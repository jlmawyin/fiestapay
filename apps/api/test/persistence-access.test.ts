import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CreatedEvent, Dashboard, FiestaEvent, Quote } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { purgeExpiredEvents } from '../src/domain/retention.js';
import { sha256 } from '../src/lib/ids.js';
import { FakePayPal } from './fake-paypal.js';
import { announceSkipWithoutDatabase, body, Client, DATABASE_URL, MERCHANT, testConfig } from './harness.js';

announceSkipWithoutDatabase('persistence-access.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

const futureEvent = (overrides: Record<string, unknown> = {}) => ({
  title: 'Fiesta real',
  template: 'casa' as const,
  meal: 'cena' as const,
  description: 'Encuentro',
  startsAt: '2026-12-20T23:00:00.000Z',
  endsAt: '2026-12-21T03:00:00.000Z',
  location: 'Casa',
  includes: ['Mesa'],
  priceCents: 2500,
  capacity: 8,
  goalCents: 10000,
  minimumCents: 5000,
  agenda: [],
  ...overrides,
});

describeDb('persistencia, clave de organizador y acceso privado', () => {
  const schema = `fp_test_${randomBytes(5).toString('hex')}`;
  let pool: Pool;
  let adminPool: Pool;
  let app: FastifyInstance;
  let fake: FakePayPal;

  beforeAll(async () => {
    pool = createPool({ connectionString: DATABASE_URL!, schema });
    adminPool = createPool({ connectionString: DATABASE_URL!, max: 2 });
    await migrate(pool, { schema });
    fake = new FakePayPal(MERCHANT);
    app = await buildApp({ pool, config: testConfig(), paypal: fake, logger: false });
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

  async function guestOn(slug: string, name: string): Promise<Client> {
    const client = new Client(app);
    expect((await client.post(`/api/events/${slug}/join`, { name })).statusCode).toBe(200);
    expect((await client.post(`/api/events/${slug}/rsvp`, { status: 'yes', companions: 0 })).statusCode).toBe(200);
    return client;
  }

  it('devuelve la clave una vez, la guarda solo como hash y exige el encabezado', async () => {
    const owner = new Client(app);
    const res = await owner.post('/api/events', futureEvent());
    expect(res.statusCode).toBe(200);
    const minted = body<CreatedEvent>(res);
    expect(minted.adminKey).toEqual(expect.any(String));
    expect(minted.adminKey!.length).toBeGreaterThanOrEqual(43);
    expect(minted.event.slug.split('-').pop()!.length).toBeGreaterThanOrEqual(12);
    expect(JSON.stringify(minted.event)).not.toContain(minted.adminKey);

    const { rows } = await pool.query<{ admin_key_hash: Buffer }>('SELECT admin_key_hash FROM events WHERE slug = $1', [
      minted.event.slug,
    ]);
    expect(rows[0]!.admin_key_hash.equals(sha256(minted.adminKey!))).toBe(true);
    expect(rows[0]!.admin_key_hash.toString('utf8')).not.toContain(minted.adminKey);

    const listed = body<{ events: FiestaEvent[] }>(await owner.get('/api/events'));
    expect(JSON.stringify(listed)).not.toContain(minted.adminKey);

    const stranger = new Client(app);
    expect((await stranger.get(`/api/events/${minted.event.slug}/dashboard`)).statusCode).toBe(403);
    expect((await stranger.put(`/api/events/${minted.event.slug}`, futureEvent({ title: 'Ajena' }))).statusCode).toBe(403);
    expect((await stranger.post(`/api/events/${minted.event.slug}/close`)).statusCode).toBe(403);
    expect((await stranger.delete(`/api/events/${minted.event.slug}`)).statusCode).toBe(403);

    const independent = new Client(app);
    independent.authorize(minted.event.slug, minted.adminKey!);
    const dash = body<Dashboard>(await independent.get(`/api/events/${minted.event.slug}/dashboard`));
    expect(dash.event.title).toBe('Fiesta real');
    expect(dash.payments).toEqual([]);
    expect(independent.cookie).toBeUndefined();

    independent.authorize(minted.event.slug, 'clave-incorrecta');
    expect((await independent.get(`/api/events/${minted.event.slug}/dashboard`)).statusCode).toBe(403);
  });

  it('emite la primera clave solo a la sesion original de un evento legado', async () => {
    const owner = new Client(app);
    const minted = body<CreatedEvent>(await owner.post('/api/events', futureEvent({ title: 'Legado' })));
    await pool.query('UPDATE events SET admin_key_hash = NULL WHERE slug = $1', [minted.event.slug]);

    const other = new Client(app);
    expect((await other.post(`/api/events/${minted.event.slug}/join`, { name: 'Otro' })).statusCode).toBe(200);
    expect((await other.post(`/api/events/${minted.event.slug}/admin/key`)).statusCode).toBe(403);
    expect((await owner.get(`/api/events/${minted.event.slug}/dashboard`)).statusCode).toBe(403);

    const boot = await owner.post(`/api/events/${minted.event.slug}/admin/key`);
    expect(boot.statusCode).toBe(200);
    const key = body<{ adminKey: string }>(boot).adminKey;
    expect((await owner.post(`/api/events/${minted.event.slug}/admin/key`)).statusCode).toBe(403);

    const browser = new Client(app);
    browser.authorize(minted.event.slug, key);
    expect((await browser.get(`/api/events/${minted.event.slug}/dashboard`)).statusCode).toBe(200);
    browser.authorize(minted.event.slug, 'otra');
    expect((await browser.get(`/api/events/${minted.event.slug}/dashboard`)).statusCode).toBe(403);
  });

  it('no deja pasar chat, voz, cotizacion ni orden sin el codigo, y revoca al cambiarlo', async () => {
    const owner = new Client(app);
    const minted = body<CreatedEvent>(
      await owner.post('/api/events', futureEvent({ title: 'Privada', accessCode: 'codigo-valido' })),
    );
    const slug = minted.event.slug;
    const stranger = new Client(app);
    expect((await stranger.get(`/api/events/${slug}`)).statusCode).toBe(403);
    expect((await stranger.post(`/api/events/${slug}/join`, { name: 'Ana' })).statusCode).toBe(403);
    expect((await stranger.post(`/api/events/${slug}/quote`)).statusCode).toBe(403);
    expect((await stranger.post(`/api/events/${slug}/chat`, { message: 'hola' })).statusCode).toBe(403);
    expect((await stranger.post(`/api/events/${slug}/voice/token`, { consent: true })).statusCode).toBe(403);
    expect((await stranger.post(`/api/events/${slug}/unlock`, { code: 'mal' })).statusCode).toBe(403);

    expect((await stranger.post(`/api/events/${slug}/unlock`, { code: 'codigo-valido' })).statusCode).toBe(200);
    expect((await stranger.get(`/api/events/${slug}`)).statusCode).toBe(200);
    expect(JSON.stringify(body(await stranger.get(`/api/events/${slug}`)))).not.toContain('codigo-valido');
    expect(JSON.stringify(body(await stranger.get(`/api/events/${slug}`)))).not.toContain(minted.adminKey);

    const guest = new Client(app);
    expect((await guest.post(`/api/events/${slug}/join`, { name: 'Ana' })).statusCode).toBe(403);
    expect((await guest.post(`/api/events/${slug}/unlock`, { code: 'codigo-valido' })).statusCode).toBe(200);
    expect((await guest.post(`/api/events/${slug}/join`, { name: 'Ana' })).statusCode).toBe(200);
    expect((await guest.post(`/api/events/${slug}/rsvp`, { status: 'yes', companions: 0 })).statusCode).toBe(200);
    const { quote } = body<{ quote: Quote }>(await guest.post(`/api/events/${slug}/quote`));
    expect((await guest.post(`/api/events/${slug}/orders`, { quoteId: quote.id, confirmed: true })).statusCode).toBe(200);

    const edited = await owner.put(`/api/events/${slug}`, futureEvent({ title: 'Privada', accessCode: 'codigo-nuevo' }));
    expect(edited.statusCode).toBe(200);
    expect((await guest.get(`/api/events/${slug}`)).statusCode).toBe(403);
    expect((await guest.post(`/api/events/${slug}/unlock`, { code: 'codigo-valido' })).statusCode).toBe(403);
    expect((await guest.post(`/api/events/${slug}/unlock`, { code: 'codigo-nuevo' })).statusCode).toBe(200);

    const cleared = await owner.put(`/api/events/${slug}`, futureEvent({ title: 'Privada', accessCode: null }));
    expect(cleared.statusCode).toBe(200);
    const publicView = body<{ event: FiestaEvent }>(await new Client(app).get(`/api/events/${slug}`));
    expect(publicView.event.accessRestricted).toBe(false);
  });

  it('el reinicio archiva solo la demo y conserva la fiesta real', async () => {
    const owner = new Client(app);
    const custom = body<CreatedEvent>(await owner.post('/api/events', futureEvent({ title: 'No es demo' })));
    const demo = body<CreatedEvent>(await owner.post('/api/demo'));
    expect((await owner.post('/api/demo/reset')).statusCode).toBe(200);

    const still = body<{ event: FiestaEvent }>(await new Client(app).get(`/api/events/${custom.event.slug}`));
    expect(still.event.title).toBe('No es demo');
    const row = await pool.query<{ archived: boolean; is_demo: boolean }>(
      'SELECT archived, is_demo FROM events WHERE slug = $1',
      [custom.event.slug],
    );
    expect(row.rows[0]).toEqual({ archived: false, is_demo: false });
    expect((await owner.post(`/api/events/${demo.event.slug}/quote`)).statusCode).toBe(410);
    expect((await new Client(app).get(`/api/events/${demo.event.slug}`)).statusCode).toBe(410);
  });

  it('oculta al cumplirse 72 horas, conserva el libro y concilia una captura tardia', async () => {
    const owner = new Client(app);
    const minted = body<CreatedEvent>(await owner.post('/api/events', futureEvent({ title: 'Por vencer' })));
    const slug = minted.event.slug;
    const guest = await guestOn(slug, 'Pagador');
    const quoteRes = await guest.post(`/api/events/${slug}/quote`);
    const { quote } = body<{ quote: Quote }>(quoteRes);
    const orderRes = await guest.post(`/api/events/${slug}/orders`, { quoteId: quote.id, confirmed: true });
    expect(orderRes.statusCode).toBe(200);
    const orderId = body<{ orderId: string }>(orderRes).orderId;
    await fake.captureOrder({ paypalOrderId: orderId, requestId: 'externo' });
    await pool.query(
      `INSERT INTO chat_messages (event_id, session_id, role, parts)
       SELECT g.event_id, g.session_id, 'user', '[{"text":"nombre secreto"}]'::jsonb
         FROM guests g JOIN events e ON e.id = g.event_id WHERE e.slug = $1 LIMIT 1`,
      [slug],
    );

    await pool.query(
      `UPDATE events SET starts_at = now() - interval '80 hours', ends_at = now() - interval '71 hours' WHERE slug = $1`,
      [slug],
    );
    expect((await purgeExpiredEvents(pool)).purged).toBe(0);
    expect((await new Client(app).get(`/api/events/${slug}`)).statusCode).toBe(200);

    await pool.query(
      `UPDATE events SET starts_at = now() - interval '80 hours', ends_at = now() - interval '73 hours' WHERE slug = $1`,
      [slug],
    );
    expect((await new Client(app).get(`/api/events/${slug}`)).statusCode).toBe(410);
    const hidden = await pool.query<{ title: string; purged_at: Date | null; name: string; chats: number }>(
      `SELECT e.title, e.purged_at, g.name,
              (SELECT COUNT(*)::int FROM chat_messages c WHERE c.event_id = e.id) AS chats
         FROM events e JOIN guests g ON g.event_id = e.id WHERE e.slug = $1`,
      [slug],
    );
    expect(hidden.rows[0]!.title).toBe('Eliminado');
    expect(hidden.rows[0]!.purged_at).toBeTruthy();
    expect(hidden.rows[0]!.name).toBe('');
    expect(hidden.rows[0]!.chats).toBe(0);

    const reconciled = await guest.post(`/api/orders/${orderId}/capture`);
    expect(reconciled.statusCode).toBe(200);
    const ledger = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM payment_ledger WHERE event_id = (SELECT id FROM events WHERE slug = $1)`,
      [slug],
    );
    expect(ledger.rows[0]!.n).toBe(1);
    const orders = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM orders WHERE event_id = (SELECT id FROM events WHERE slug = $1)`,
      [slug],
    );
    expect(orders.rows[0]!.n).toBe(1);
    expect((await new Client(app).post(`/api/events/${slug}/join`, { name: 'Tarde' })).statusCode).toBe(410);
    expect((await owner.get(`/api/events/${slug}/dashboard`)).statusCode).toBe(410);
  });

  it('limita los intentos de codigo', async () => {
    const limited = await buildApp({
      pool,
      config: testConfig({ RATE_LIMIT: '1', RATE_LIMIT_MAX: '500' }),
      paypal: fake,
      logger: false,
    });
    await limited.ready();
    try {
      const owner = new Client(limited);
      const minted = body<CreatedEvent>(
        await owner.post('/api/events', futureEvent({ title: 'Tope', accessCode: 'codigo-valido' })),
      );
      const client = new Client(limited);
      const codes: number[] = [];
      for (let i = 0; i < 10; i += 1) {
        codes.push((await client.post(`/api/events/${minted.event.slug}/unlock`, { code: 'mal' })).statusCode);
      }
      expect(codes).toContain(429);
    } finally {
      await limited.close();
    }
  });
});
