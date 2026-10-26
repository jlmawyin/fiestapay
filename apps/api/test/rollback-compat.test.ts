import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.warn(
    '[rollback-compat.test] DATABASE_URL ausente: pruebas de integracion con PostgreSQL OMITIDAS (no aprobadas).',
  );
}
const describeDb = DATABASE_URL ? describe : describe.skip;

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/db/migrations');
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

const LEGACY_COLUMNS = `id, slug, organizer_session_id, generation, title, template, meal, description,
  starts_at, location, includes, agenda, price_cents, capacity, goal_cents, minimum_cents`;

interface Stamp {
  id: string;
  starts_at: Date;
  ends_at: Date;
}

interface FnRow {
  proname: string;
  nspname: string;
  config: string | null;
  prosrc: string;
}

interface TriggerRow {
  tgname: string;
  fn_schema: string;
  def: string;
}

function newSchema(): string {
  return `fp_rb_${randomBytes(5).toString('hex')}`;
}

async function insertSession(pool: Pool): Promise<string> {
  const id = randomUUID();
  await pool.query('INSERT INTO sessions (id, token_hash) VALUES ($1, $2)', [id, randomBytes(32)]);
  return id;
}

/** Column list of the production writer that omitted ends_at. */
async function legacyInsert(pool: Pool, sessionId: string, startsAt: string, title: string): Promise<Stamp> {
  const id = randomUUID();
  const slug = `leg-${randomBytes(4).toString('hex')}`;
  const { rows } = await pool.query<Stamp>(
    `INSERT INTO events (${LEGACY_COLUMNS})
     VALUES ($1, $2, $3, 0, $4, 'casa', 'cena', 'Legado',
       $5::timestamptz, 'Casa', '[]'::jsonb, '[]'::jsonb, 2500, 8, 10000, 5000)
     RETURNING id, starts_at, ends_at`,
    [id, slug, sessionId, title, startsAt],
  );
  return rows[0]!;
}

async function explicitInsert(
  pool: Pool,
  sessionId: string,
  startsAt: string,
  endsAt: string,
  title: string,
): Promise<Stamp> {
  const id = randomUUID();
  const slug = `exp-${randomBytes(4).toString('hex')}`;
  const { rows } = await pool.query<Stamp>(
    `INSERT INTO events (${LEGACY_COLUMNS}, ends_at)
     VALUES ($1, $2, $3, 0, $4, 'casa', 'cena', 'Explicito',
       $5::timestamptz, 'Casa', '[]'::jsonb, '[]'::jsonb, 2500, 8, 10000, 5000, $6::timestamptz)
     RETURNING id, starts_at, ends_at`,
    [id, slug, sessionId, title, startsAt, endsAt],
  );
  return rows[0]!;
}

async function stampOf(pool: Pool, id: string): Promise<Stamp> {
  const { rows } = await pool.query<Stamp>('SELECT id, starts_at, ends_at FROM events WHERE id = $1', [id]);
  return rows[0]!;
}

async function expectSqlstate(run: () => Promise<unknown>, code: string, messageIncludes?: string): Promise<void> {
  try {
    await run();
  } catch (err) {
    const pg = err as { code?: string; message?: string };
    expect(pg.code).toBe(code);
    if (messageIncludes) expect(pg.message ?? '').toContain(messageIncludes);
    return;
  }
  throw new Error(`se esperaba SQLSTATE ${code}`);
}

async function publicFiestaFunctions(pool: Pool): Promise<string[]> {
  const { rows } = await pool.query<{ proname: string }>(
    `SELECT p.proname
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname LIKE 'fiestapay_%'
      ORDER BY p.proname, p.oid`,
  );
  return rows.map((row) => row.proname);
}

async function functionsIn(pool: Pool, schema: string): Promise<FnRow[]> {
  const { rows } = await pool.query<FnRow>(
    `SELECT p.proname, n.nspname, p.proconfig::text AS config, p.prosrc
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $1
        AND p.proname IN ('fiestapay_fill_legacy_ends_at', 'fiestapay_reject_event_delete')
      ORDER BY p.proname`,
    [schema],
  );
  return rows;
}

async function triggersIn(pool: Pool, schema: string): Promise<TriggerRow[]> {
  const { rows } = await pool.query<TriggerRow>(
    `SELECT t.tgname, pn.nspname AS fn_schema, pg_get_triggerdef(t.oid) AS def
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace cn ON cn.oid = c.relnamespace
       JOIN pg_proc p ON p.oid = t.tgfoid
       JOIN pg_namespace pn ON pn.oid = p.pronamespace
      WHERE cn.nspname = $1
        AND NOT t.tgisinternal
        AND t.tgname IN ('events_fill_legacy_ends_at', 'events_reject_money_delete')
      ORDER BY t.tgname`,
    [schema],
  );
  return rows;
}

async function applyFiles(pool: Pool, schema: string, files: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO "${schema}", public`);
    for (const file of files) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
  }
}

describeDb('compatibilidad del escritor legado con ends_at', () => {
  const schema = newSchema();
  const backfillSchema = newSchema();
  let pool: Pool;
  let backfillPool: Pool;
  let admin: Pool;
  let publicFunctionsBefore: string[] = [];

  beforeAll(async () => {
    admin = createPool({ connectionString: DATABASE_URL!, max: 2 });
    publicFunctionsBefore = await publicFiestaFunctions(admin);
    await admin.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await admin.query(`CREATE SCHEMA IF NOT EXISTS "${backfillSchema}"`);

    pool = createPool({ connectionString: DATABASE_URL!, schema });
    await migrate(pool, { schema });
    backfillPool = createPool({ connectionString: DATABASE_URL!, schema: backfillSchema });
  });

  afterAll(async () => {
    await pool?.end();
    await backfillPool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.query(`DROP SCHEMA IF EXISTS "${backfillSchema}" CASCADE`);
      await admin.end();
    }
  });

  it('crea las funciones en el esquema aislado y no en public', async () => {
    const fns = await functionsIn(pool, schema);
    expect(fns.map((row) => row.proname)).toEqual([
      'fiestapay_fill_legacy_ends_at',
      'fiestapay_reject_event_delete',
    ]);
    for (const row of fns) {
      expect(row.nspname).toBe(schema);
      expect(row.config ?? '').not.toMatch(/public/i);
    }
    const fill = fns.find((row) => row.proname === 'fiestapay_fill_legacy_ends_at')!;
    expect(fill.prosrc).toContain('NEW.ends_at IS NULL');
    expect(fill.prosrc).toContain("interval '4 hours'");
    const guard = fns.find((row) => row.proname === 'fiestapay_reject_event_delete')!;
    expect(guard.prosrc).toContain('payment_ledger');
    expect(guard.prosrc).toContain('orders');
    expect(guard.prosrc).toContain('no se elimina un evento con registros de pago');
    expect(guard.config ?? '').toContain(schema);

    const triggers = await triggersIn(pool, schema);
    const fillTrigger = triggers.find((row) => row.tgname === 'events_fill_legacy_ends_at');
    const deleteTrigger = triggers.find((row) => row.tgname === 'events_reject_money_delete');
    expect(fillTrigger?.fn_schema).toBe(schema);
    expect(fillTrigger?.def).toContain('BEFORE INSERT');
    expect(fillTrigger?.def).not.toContain('UPDATE');
    expect(fillTrigger?.def).not.toContain('DELETE');
    expect(deleteTrigger?.fn_schema).toBe(schema);
    expect(deleteTrigger?.def).toContain('BEFORE DELETE');

    expect(await publicFiestaFunctions(admin)).toEqual(publicFunctionsBefore);
    const leaked = await admin.query(
      `SELECT 1
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'fiestapay_fill_legacy_ends_at'`,
    );
    expect(leaked.rowCount).toBe(0);
  });

  it('conserva el relleno, el check, la retencion y las columnas de acceso', async () => {
    const columns = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'events'
          AND column_name = ANY($2::text[])
        ORDER BY column_name`,
      [schema, ['access_code_hash', 'admin_key_hash', 'closed_at', 'ends_at', 'is_demo', 'purged_at']],
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      'access_code_hash',
      'admin_key_hash',
      'closed_at',
      'ends_at',
      'is_demo',
      'purged_at',
    ]);
    const constraint = await pool.query(
      `SELECT 1 FROM pg_constraint c
         JOIN pg_class rel ON rel.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = rel.relnamespace
        WHERE n.nspname = $1 AND c.conname = 'events_ends_after_start'`,
      [schema],
    );
    expect(constraint.rowCount).toBe(1);
    const index = await pool.query(
      `SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = 'events_retention_idx'`,
      [schema],
    );
    expect(index.rowCount).toBe(1);
    const unlocks = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'event_unlocks'`,
      [schema],
    );
    expect(unlocks.rowCount).toBe(1);
  });

  it('el INSERT legado sin fin guarda starts_at mas 4 horas', async () => {
    const sessionId = await insertSession(pool);
    const row = await legacyInsert(pool, sessionId, '2026-12-20 18:00:00-05', 'Sin fin');
    expect(row.ends_at.getTime() - row.starts_at.getTime()).toBe(FOUR_HOURS_MS);

    const explicitNull = randomUUID();
    const { rows } = await pool.query<Stamp>(
      `INSERT INTO events (${LEGACY_COLUMNS}, ends_at)
       VALUES ($1, $2, $3, 0, 'Nulo', 'casa', 'cena', 'Nulo',
         $4::timestamptz, 'Casa', '[]'::jsonb, '[]'::jsonb, 2500, 8, 10000, 5000, NULL)
       RETURNING id, starts_at, ends_at`,
      [explicitNull, `nil-${randomBytes(4).toString('hex')}`, sessionId, '2026-12-21 13:00:00-05'],
    );
    expect(rows[0]!.ends_at.getTime() - rows[0]!.starts_at.getTime()).toBe(FOUR_HOURS_MS);
  });

  it('conserva un fin explicito valido y rechaza un fin que no es posterior al inicio', async () => {
    const sessionId = await insertSession(pool);
    const kept = await explicitInsert(
      pool,
      sessionId,
      '2026-12-20 18:00:00-05',
      '2026-12-21 00:00:00-05',
      'Seis horas',
    );
    expect(kept.ends_at.getTime() - kept.starts_at.getTime()).toBe(6 * 60 * 60 * 1000);

    await expectSqlstate(
      () =>
        explicitInsert(pool, sessionId, '2026-12-20 18:00:00-05', '2026-12-20 18:00:00-05', 'Igual'),
      '23514',
    );
    await expectSqlstate(
      () =>
        explicitInsert(pool, sessionId, '2026-12-20 18:00:00-05', '2026-12-20 17:00:00-05', 'Antes'),
      '23514',
    );
  });

  it('no reescribe fechas existentes ni explicitas en UPDATE', async () => {
    const sessionId = await insertSession(pool);
    const legacy = await legacyInsert(pool, sessionId, '2026-12-20 18:00:00-05', 'Relleno');
    const explicit = await explicitInsert(
      pool,
      sessionId,
      '2026-12-22 18:00:00-05',
      '2026-12-22 20:00:00-05',
      'Dos horas',
    );

    await pool.query(`UPDATE events SET title = 'Renombrado', location = 'Otro' WHERE id = $1`, [legacy.id]);
    await pool.query(`UPDATE events SET title = 'Renombrado' WHERE id = $1`, [explicit.id]);
    const legacyAfter = await stampOf(pool, legacy.id);
    const explicitAfter = await stampOf(pool, explicit.id);
    expect(legacyAfter.starts_at.getTime()).toBe(legacy.starts_at.getTime());
    expect(legacyAfter.ends_at.getTime()).toBe(legacy.ends_at.getTime());
    expect(explicitAfter.ends_at.getTime()).toBe(explicit.ends_at.getTime());

    await pool.query(`UPDATE events SET starts_at = starts_at - interval '1 hour' WHERE id = $1`, [explicit.id]);
    const shifted = await stampOf(pool, explicit.id);
    expect(shifted.starts_at.getTime()).toBe(explicit.starts_at.getTime() - 60 * 60 * 1000);
    expect(shifted.ends_at.getTime()).toBe(explicit.ends_at.getTime());

    await pool.query(`UPDATE events SET ends_at = starts_at + interval '3 hours' WHERE id = $1`, [explicit.id]);
    const rewritten = await stampOf(pool, explicit.id);
    expect(rewritten.ends_at.getTime() - rewritten.starts_at.getTime()).toBe(3 * 60 * 60 * 1000);

    const beforeReject = await stampOf(pool, explicit.id);
    await expectSqlstate(
      () => pool.query(`UPDATE events SET ends_at = starts_at WHERE id = $1`, [explicit.id]),
      '23514',
    );
    const afterReject = await stampOf(pool, explicit.id);
    expect(afterReject.starts_at.getTime()).toBe(beforeReject.starts_at.getTime());
    expect(afterReject.ends_at.getTime()).toBe(beforeReject.ends_at.getTime());
  });

  it('el guardia de borrado financiero sigue igual', async () => {
    const sessionId = await insertSession(pool);
    const free = await legacyInsert(pool, sessionId, '2026-12-20 18:00:00-05', 'Sin dinero');
    await pool.query('DELETE FROM events WHERE id = $1', [free.id]);
    expect((await pool.query('SELECT id FROM events WHERE id = $1', [free.id])).rowCount).toBe(0);

    const kept = await legacyInsert(pool, sessionId, '2026-12-23 18:00:00-05', 'Con orden');
    const guestId = randomUUID();
    const quoteId = randomUUID();
    const orderId = randomUUID();
    await pool.query(
      `INSERT INTO guests (id, event_id, session_id, name) VALUES ($1, $2, $3, 'Ana')`,
      [guestId, kept.id, sessionId],
    );
    await pool.query(
      `INSERT INTO quotes (
         id, event_id, guest_id, obligation_version, people, unit_cents, total_cents,
         paid_cents, amount_cents, summary, expires_at
       ) VALUES ($1, $2, $3, 1, 1, 2500, 2500, 0, 2500, 'Cuota', now() + interval '1 day')`,
      [quoteId, kept.id, guestId],
    );
    await pool.query(
      `INSERT INTO orders (
         id, event_id, guest_id, quote_id, obligation_version, request_id, amount_cents,
         payee_merchant_id, status
       ) VALUES ($1, $2, $3, $4, 1, $5, 2500, 'MERCHANT-TEST', 'created')`,
      [orderId, kept.id, guestId, quoteId, `req-${orderId}`],
    );
    await expectSqlstate(
      () => pool.query('DELETE FROM events WHERE id = $1', [kept.id]),
      'P0001',
      'no se elimina un evento con registros de pago',
    );
    expect((await pool.query('SELECT id FROM events WHERE id = $1', [kept.id])).rowCount).toBe(1);
  });

  it('una fila anterior a la migracion queda rellenada y no se reescribe', async () => {
    await applyFiles(backfillPool, backfillSchema, [
      '0001_init.sql',
      '0002_voice.sql',
      '0003_payment_state.sql',
      '0004_ai_budget.sql',
    ]);
    const sessionId = await insertSession(backfillPool);
    const id = randomUUID();
    const startsAt = '2026-08-01 19:00:00-05';
    await backfillPool.query(
      `INSERT INTO events (${LEGACY_COLUMNS})
       VALUES ($1, $2, $3, 0, 'Ya existia', 'comida', 'almuerzo', 'Antes de 0005',
         $4::timestamptz, 'Casa', '[]'::jsonb, '[]'::jsonb, 2500, 8, 10000, 5000)`,
      [id, `old-${randomBytes(4).toString('hex')}`, sessionId, startsAt],
    );
    await applyFiles(backfillPool, backfillSchema, ['0005_persistence_access.sql']);

    const backfilled = await stampOf(backfillPool, id);
    expect(backfilled.ends_at.getTime() - backfilled.starts_at.getTime()).toBe(FOUR_HOURS_MS);
    await backfillPool.query(`UPDATE events SET title = 'Sigue igual', description = 'Tocada' WHERE id = $1`, [id]);
    const after = await stampOf(backfillPool, id);
    expect(after.starts_at.getTime()).toBe(backfilled.starts_at.getTime());
    expect(after.ends_at.getTime()).toBe(backfilled.ends_at.getTime());

    const fns = await functionsIn(backfillPool, backfillSchema);
    expect(fns).toHaveLength(2);
    expect(fns.every((row) => row.nspname === backfillSchema)).toBe(true);
    expect(await publicFiestaFunctions(admin)).toEqual(publicFunctionsBefore);
  });

  it('la API nueva rechaza un alta sin fin valido', async () => {
    let buildApp: typeof import('../src/app.js').buildApp;
    let testConfig: typeof import('./harness.js').testConfig;
    let Client: typeof import('./harness.js').Client;
    try {
      ({ buildApp } = await import('../src/app.js'));
      ({ testConfig, Client } = await import('./harness.js'));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`OUTSIDE_OWNERSHIP import de la API: ${message}`, { cause: err });
    }

    const app = await buildApp({ pool, config: testConfig(), paypal: null, logger: false });
    try {
      await app.ready();
      const client = new Client(app);
      const startsAt = '2026-12-20T23:00:00.000Z';
      const base = {
        title: 'Fiesta real',
        template: 'casa',
        meal: 'cena',
        description: 'Encuentro',
        startsAt,
        location: 'Casa',
        includes: ['Mesa'],
        priceCents: 2500,
        capacity: 8,
        goalCents: 10000,
        minimumCents: 5000,
        agenda: [],
      };
      expect((await client.post('/api/events', base)).statusCode).toBe(400);
      expect((await client.post('/api/events', { ...base, endsAt: startsAt })).statusCode).toBe(400);

      const endsAt = '2026-12-21T02:00:00.000Z';
      const created = await client.post('/api/events', { ...base, endsAt });
      expect(created.statusCode).toBe(200);
      const slug = (created.json() as { event: { slug: string } }).event.slug;
      const { rows } = await pool.query<{ starts_at: Date; ends_at: Date }>(
        'SELECT starts_at, ends_at FROM events WHERE slug = $1',
        [slug],
      );
      expect(rows[0]!.ends_at.toISOString()).toBe(endsAt);
      expect(rows[0]!.ends_at.getTime() - rows[0]!.starts_at.getTime()).toBe(3 * 60 * 60 * 1000);
    } finally {
      await app.close();
    }
  });
});
