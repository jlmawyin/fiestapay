/**
 * Somos Panas SP-3 — migración 0013_tenants.sql.
 * Depende de Postgres 16, `migrate.ts` y migraciones 0001–0012 intactas.
 * Comprueba idempotencia, backfill del legado sin tocar dinero y hashes inmutables de SQL previo.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { LEGACY_TENANT_SLUG } from '../src/lib/host.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.warn(
    '[tenants-migration.test] DATABASE_URL ausente: pruebas de integracion con PostgreSQL OMITIDAS (no aprobadas).',
  );
}
const describeDb = DATABASE_URL ? describe : describe.skip;

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/db/migrations');

/** SHA-256 de cada migración 0001–0012; cualquier byte nuevo rompe esta prueba a propósito. */
const IMMUTABLE_MIGRATION_SHA256: Record<string, string> = {
  '0001_init.sql': '5f7d0d367e401c3c4225ba0ace912f7fe0a798c98d33f29a56f10de8d9d1b320',
  '0002_voice.sql': '9c1eb7ff739817cb75bc2fb7cba3de49348135f7652f4d9509fe7f63e3583bb7',
  '0003_payment_state.sql': '87700b922e4e5f6332c25ce11f7d837c879eb3c755ffbc71ae7454b4e5533090',
  '0004_ai_budget.sql': '163992466dfb21728be092c78baf7729779d4d6340445f7df53fe9a04da9cb8f',
  '0005_persistence_access.sql': 'af89445140acb2a962c5aa59cb0d72627d6a2b5cd4b4bdf96d10507494cb3d8c',
  '0006_organizer_recovery.sql': '34a90e69e98c9412723635931c1399ec548eebebbdba777dc5d4c9ee6e071dbe',
  '0007_funding.sql': '0dfbf6ee13b3b8795532d29fceadf02e18539c3e780d4742301d1ce3330360df',
  '0008_moderation.sql': 'b05a9651750016a571ee5bc1cc0303e64d1f4f2d50324d02740ade3368c14d9d',
  '0009_event_presentation.sql': '9876e44509703815f2dc25d54f9560c534077f036cfc9255e744ee76eb29e498',
  '0010_organizer_assistant.sql': '986ac0abe2ee06e50b43a84a52a3d1fff3f70c096193a2a97cd9efe70e4bc828',
  '0011_voice_lifecycle.sql': 'd73aa9d754a529389624530caa8954386f02b7e05e0d6fa6e9d1b3ad4fd5dbce',
  '0012_public_chat_budget.sql': 'c1165226458b154ebb6a9d5c445d3217b124b7877e93d7673ae2a435edc74a40',
};

function newSchema(): string {
  return `fp_tenant_${randomBytes(5).toString('hex')}`;
}

/**
 * Calcula SHA-256 de un archivo de migración.
 * Entrada: ruta absoluta al `.sql`.
 * Salida: digest hex en minúsculas.
 */
async function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Aplica SQL en orden y registra en `schema_migrations` como `migrate.ts`.
 * Entrada: pool, esquema aislado y lista de nombres de archivo.
 */
async function applyMigrations(pool: Pool, schema: string, files: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await client.query(`SET search_path TO "${schema}", public`);
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const file of files) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
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

interface MoneySnapshot {
  orderRows: number;
  orderCents: number;
  ledgerRows: number;
  ledgerCents: number;
}

/**
 * Cuenta filas y centavos en orders y payment_ledger.
 * Entrada: pool ya con search_path del esquema de prueba.
 * Salida: totales para comparar antes y después del backfill.
 */
async function moneySnapshot(pool: Pool): Promise<MoneySnapshot> {
  const orders = await pool.query<{ n: number; cents: number }>(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(amount_cents), 0)::int AS cents FROM orders`,
  );
  const ledger = await pool.query<{ n: number; cents: number }>(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(amount_cents), 0)::int AS cents FROM payment_ledger`,
  );
  return {
    orderRows: orders.rows[0]?.n ?? 0,
    orderCents: orders.rows[0]?.cents ?? 0,
    ledgerRows: ledger.rows[0]?.n ?? 0,
    ledgerCents: ledger.rows[0]?.cents ?? 0,
  };
}

/**
 * Siembra un evento mínimo con orden pagada y fila de libro mayor (post-0001, pre-0013).
 * Entrada: pool del esquema aislado sin columnas de tenant.
 */
async function seedMoneyFixture(pool: Pool): Promise<{ eventId: string; slug: string }> {
  const sessionId = randomUUID();
  const eventId = randomUUID();
  const guestId = randomUUID();
  const quoteId = randomUUID();
  const orderId = randomUUID();
  const slug = `sp3-${randomBytes(4).toString('hex')}`;
  const starts = new Date(Date.now() + 86_400_000).toISOString();
  const ends = new Date(Date.now() + 90_000_000).toISOString();

  await pool.query('INSERT INTO sessions (id, token_hash) VALUES ($1, $2)', [sessionId, randomBytes(32)]);
  await pool.query(
    `INSERT INTO events (
       id, slug, organizer_session_id, title, template, meal, description,
       starts_at, ends_at, location, price_cents, funding_status
     ) VALUES ($1,$2,$3,'Fiesta SP-3','casa','cena','Desc',
       $4::timestamptz,$5::timestamptz,'Casa',2500,'legacy')`,
    [eventId, slug, sessionId, starts, ends],
  );
  await pool.query(
    `INSERT INTO guests (id, event_id, session_id, name) VALUES ($1,$2,$3,'Invitado')`,
    [guestId, eventId, sessionId],
  );
  await pool.query(
    `INSERT INTO quotes (id, event_id, guest_id, obligation_version, people, unit_cents, total_cents,
       paid_cents, amount_cents, summary, expires_at)
     VALUES ($1,$2,$3,1,1,2500,2500,0,2500,'Cuenta',$4::timestamptz)`,
    [quoteId, eventId, guestId, new Date(Date.now() + 3_600_000).toISOString()],
  );
  await pool.query(
    `INSERT INTO orders (id, event_id, guest_id, quote_id, obligation_version, request_id,
       paypal_order_id, amount_cents, payee_merchant_id, status, capture_id)
     VALUES ($1,$2,$3,$4,1,$5,'PAYPAL-TEST',2500,'merchant@test','paid','CAP-1')`,
    [orderId, eventId, guestId, quoteId, `req-${randomBytes(4).toString('hex')}`],
  );
  await pool.query(
    `INSERT INTO payment_ledger (id, event_id, guest_id, order_id, kind, amount_cents, external_id, capture_id)
     VALUES ($1,$2,$3,$4,'capture',2500,'ext-capture-1','CAP-1')`,
    [randomUUID(), eventId, guestId, orderId],
  );
  return { eventId, slug };
}

describeDb('migracion 0013 tenants (SP-3)', () => {
  const schemaFresh = newSchema();
  const schemaBackfill = newSchema();
  let admin: Pool;
  let freshPool: Pool;
  let backfillPool: Pool;

  beforeAll(async () => {
    admin = createPool({ connectionString: DATABASE_URL!, max: 4 });
    await admin.query(`CREATE SCHEMA IF NOT EXISTS "${schemaFresh}"`);
    await admin.query(`CREATE SCHEMA IF NOT EXISTS "${schemaBackfill}"`);
    freshPool = createPool({ connectionString: DATABASE_URL!, schema: schemaFresh });
    backfillPool = createPool({ connectionString: DATABASE_URL!, schema: schemaBackfill });
  });

  afterAll(async () => {
    await freshPool?.end();
    await backfillPool?.end();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schemaFresh}" CASCADE`);
      await admin.query(`DROP SCHEMA IF EXISTS "${schemaBackfill}" CASCADE`);
      await admin.end();
    }
  });

  it('el backfill del SQL solo asigna tenant donde faltaba', async () => {
    const sql = await readFile(join(MIGRATIONS_DIR, '0013_tenants.sql'), 'utf8');
    expect(sql).toMatch(/UPDATE events[\s\S]*WHERE tenant_id IS NULL/i);
    expect(sql).not.toMatch(/UPDATE orders/i);
    expect(sql).not.toMatch(/UPDATE payment_ledger/i);
  });

  it('las migraciones 0001–0012 no cambian de bytes (SHA-256)', async () => {
    const files = Object.keys(IMMUTABLE_MIGRATION_SHA256).sort();
    for (const file of files) {
      const digest = await sha256File(join(MIGRATIONS_DIR, file));
      expect(digest, file).toBe(IMMUTABLE_MIGRATION_SHA256[file]);
    }
    const all = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    expect(all.slice(0, 12)).toEqual(files);
  });

  it('en esquema vacio aplica 0013 una vez y la segunda pasada la omite', async () => {
    const first = await migrate(freshPool, { schema: schemaFresh });
    expect(first.applied).toContain('0013_tenants.sql');
    const second = await migrate(freshPool, { schema: schemaFresh });
    expect(second.skipped).toContain('0013_tenants.sql');
    expect(second.applied).not.toContain('0013_tenants.sql');
  });

  it('backfill del legado sin alterar orders ni payment_ledger', async () => {
    const legacyFiles = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql') && f < '0013_tenants.sql')
      .sort();
    await applyMigrations(admin, schemaBackfill, legacyFiles);
    const pool = createPool({ connectionString: DATABASE_URL!, schema: schemaBackfill });
    try {
      const { eventId, slug } = await seedMoneyFixture(pool);
      const before = await moneySnapshot(pool);

      const applied = await migrate(pool, { schema: schemaBackfill });
      expect(applied.applied).toContain('0013_tenants.sql');

      const after = await moneySnapshot(pool);
      expect(after).toEqual(before);

      const { rows: tenants } = await pool.query<{ id: string }>(
        `SELECT id FROM tenants WHERE slug = $1`,
        [LEGACY_TENANT_SLUG],
      );
      expect(tenants).toHaveLength(1);

      const { rows: ev } = await pool.query<{
        tenant_id: string;
        visibility: string;
        chargeable: boolean;
      }>(`SELECT tenant_id, visibility, chargeable FROM events WHERE id = $1`, [eventId]);
      expect(ev[0]?.tenant_id).toBe(tenants[0]!.id);
      expect(ev[0]?.visibility).toBe('private');
      expect(ev[0]?.chargeable).toBe(true);

      const { rows: slugCheck } = await pool.query<{ slug: string }>(
        `SELECT slug FROM events WHERE slug = $1`,
        [slug],
      );
      expect(slugCheck).toHaveLength(1);

      const { rows: backfillPattern } = await pool.query<{ clause: string }>(
        `SELECT pg_get_constraintdef(oid) AS clause FROM pg_constraint
          WHERE conrelid = 'events'::regclass AND conname = 'events_public_no_access_code'`,
      );
      expect(backfillPattern[0]?.clause ?? '').toContain('access_code_hash');
    } finally {
      await pool.end();
    }
  });

  it('existe tenant legado con ajustes FiestaPay y modulo asistente encendido', async () => {
    const { rows } = await freshPool.query<{ display_name: string; modulo_asistente: boolean }>(
      `SELECT ts.display_name, ts.modulo_asistente
         FROM tenant_settings ts
         JOIN tenants t ON t.id = ts.tenant_id
        WHERE t.slug = $1`,
      [LEGACY_TENANT_SLUG],
    );
    expect(rows[0]?.display_name).toBe('FiestaPay');
    expect(rows[0]?.modulo_asistente).toBe(true);
  });
});