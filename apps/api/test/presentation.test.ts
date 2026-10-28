import { randomBytes, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CreatedEvent, FiestaEvent } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { FakePayPal } from './fake-paypal.js';
import { announceSkipWithoutDatabase, body, Client, DATABASE_URL, MERCHANT, testConfig } from './harness.js';

announceSkipWithoutDatabase('presentation.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

const base = (overrides: Record<string, unknown> = {}) => ({
  title: 'Viaje a Cuenca',
  template: 'viaje',
  meal: 'almuerzo',
  description: 'Salida del grupo',
  startsAt: '2026-12-15T19:00:00.000Z',
  endsAt: '2026-12-16T15:00:00.000Z',
  location: 'Cuenca',
  includes: ['Bus'],
  priceCents: 6500,
  capacity: 8,
  goalCents: null,
  minimumCents: null,
  agenda: [],
  ...overrides,
});

describeDb('presentacion: nombre, tema y filas anteriores', () => {
  const schema = `fp_test_${randomBytes(5).toString('hex')}`;
  let pool: Pool;
  let adminPool: Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    pool = createPool({ connectionString: DATABASE_URL!, schema });
    adminPool = createPool({ connectionString: DATABASE_URL!, max: 2 });
    await migrate(pool, { schema });
    app = await buildApp({ pool, config: testConfig(), paypal: new FakePayPal(MERCHANT), logger: false });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await adminPool.end();
    }
  });

  it('guarda el tema y el nombre, los recarga y no toca el dinero', async () => {
    const owner = new Client(app);
    const created = await owner.post('/api/events', base({ organizerName: '  Ana  ', theme: 'montana' }));
    expect(created.statusCode).toBe(200);
    const minted = body<CreatedEvent>(created);
    expect(minted.event.theme).toBe('montana');
    expect(minted.event.organizerName).toBe('Ana');
    expect(minted.event.priceCents).toBe(6500);
    expect(minted.event.collectedCents).toBe(0);
    expect(minted.event.endsAt).toBe('2026-12-16T15:00:00.000Z');

    const pub = body<{ event: FiestaEvent }>(await new Client(app).get(`/api/events/${minted.event.slug}`));
    expect(pub.event.theme).toBe('montana');
    expect(pub.event.organizerName).toBe('Ana');
    expect(JSON.stringify(pub)).not.toContain(minted.adminKey);

    const edited = await owner.put(`/api/events/${minted.event.slug}`, base({ title: 'Viaje editado', theme: 'costa' }));
    expect(edited.statusCode).toBe(200);
    expect(body<CreatedEvent>(edited).event.theme).toBe('costa');
    expect(body<CreatedEvent>(edited).event.priceCents).toBe(6500);

    const again = body<{ event: FiestaEvent }>(await new Client(app).get(`/api/events/${minted.event.slug}`));
    expect(again.event.theme).toBe('costa');
    expect(again.event.title).toBe('Viaje editado');
    expect(again.event.organizerName).toBe('Ana');
  });

  it('rechaza tema ajeno, nombre largo, estado de dinero y un guardado sin clave', async () => {
    const owner = new Client(app);
    const hostile = '<img src=x onerror="alert(1)"><script>alert(1)</script>';
    const created = await owner.post('/api/events', base({
      title: 'Viaje seguro',
      organizerName: hostile,
      theme: 'camino',
    }));
    expect(created.statusCode).toBe(200);
    const minted = body<CreatedEvent>(created);
    expect(minted.event.organizerName).toBe(hostile);
    expect(minted.event.priceCents).toBe(6500);
    const stored = await pool.query<{ organizer_name: string; price_cents: number }>(
      'SELECT organizer_name, price_cents FROM events WHERE slug = $1',
      [minted.event.slug],
    );
    expect(stored.rows[0]?.organizer_name).toBe(hostile);
    expect(stored.rows[0]?.price_cents).toBe(6500);

    expect((await owner.post('/api/events', base({ theme: 'mesa' }))).statusCode).toBe(400);
    expect((await owner.post('/api/events', base({ organizerName: 'A'.repeat(101) }))).statusCode).toBe(400);
    expect((await owner.post('/api/events', base({ collectedCents: 100 }))).statusCode).toBe(400);

    const stranger = new Client(app);
    const denied = await stranger.put(`/api/events/${minted.event.slug}`, base({ title: 'Ajena', theme: 'ciudad' }));
    expect(denied.statusCode).toBe(403);
    const still = body<{ event: FiestaEvent }>(await stranger.get(`/api/events/${minted.event.slug}`));
    expect(still.event.title).toBe('Viaje seguro');
    expect(still.event.theme).toBe('camino');
    expect(still.event.priceCents).toBe(6500);
  });

  it('aplica 0009 sobre una fila creada antes de esas columnas', async () => {
    const legacy = `fp_leg_${randomBytes(4).toString('hex')}`;
    await adminPool.query(`CREATE SCHEMA "${legacy}"`);
    const legacyPool = createPool({ connectionString: DATABASE_URL!, schema: legacy, max: 1 });
    try {
      const dir = join(import.meta.dirname, '../src/db/migrations');
      const files = (await readdir(dir)).filter((file) => file.endsWith('.sql') && file < '0009_event_presentation.sql').sort();
      const client = await legacyPool.connect();
      try {
        await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
        for (const file of files) {
          const sql = await readFile(join(dir, file), 'utf8');
          await client.query('BEGIN');
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
          await client.query('COMMIT');
        }
        const sessionId = randomUUID();
        const eventId = randomUUID();
        await client.query('INSERT INTO sessions (id, token_hash) VALUES ($1, $2)', [sessionId, randomBytes(32)]);
        await client.query(
          `INSERT INTO events (id, slug, organizer_session_id, title, template, meal, description, starts_at, ends_at, location, price_cents)
           VALUES ($1, $2, $3, 'Legado', 'viaje', 'cena', 'Antes', $4, $5, 'Cuenca', 2500)`,
          [eventId, `viaje-legado-${randomBytes(3).toString('hex')}`, sessionId, '2026-12-15T19:00:00.000Z', '2026-12-16T15:00:00.000Z'],
        );
        const before = await client.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = 'events' AND column_name IN ('organizer_name', 'theme')`,
          [legacy],
        );
        expect(before.rows).toHaveLength(0);
        const sql = await readFile(join(dir, '0009_event_presentation.sql'), 'utf8');
        await client.query(sql);
        const row = await client.query<{ organizer_name: string | null; theme: string | null; price_cents: number; meal: string }>(
          'SELECT organizer_name, theme, price_cents, meal FROM events',
        );
        expect(row.rows[0]).toMatchObject({ organizer_name: null, theme: null, price_cents: 2500, meal: 'cena' });
        await expect(client.query("UPDATE events SET theme = 'mesa'")).rejects.toThrow();
      } finally {
        client.release();
      }
    } finally {
      await legacyPool.end();
      await adminPool.query(`DROP SCHEMA IF EXISTS "${legacy}" CASCADE`);
    }
  });
});
