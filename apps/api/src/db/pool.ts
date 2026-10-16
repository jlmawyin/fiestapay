import pg from 'pg';

const { Pool, types } = pg;
export type Pool = pg.Pool;
export type PoolClient = pg.PoolClient;

// Keep bigint-ish aggregates as numbers we control: int8 (20) and numeric (1700) arrive as
// strings from pg by default. Money stays integer cents, so parse through Number only after
// an explicit, bounded check at the call site (see sumToCents).
types.setTypeParser(20, (v) => v);
types.setTypeParser(1700, (v) => v);

export interface PoolOptions {
  connectionString: string;
  /** Optional dedicated schema (used by tests to isolate runs). */
  schema?: string;
  max?: number;
}

export function createPool(opts: PoolOptions): Pool {
  return new Pool({
    connectionString: opts.connectionString,
    max: opts.max ?? 10,
    connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000,
    // `options` is passed through to the backend, so every pooled connection gets the schema.
    ...(opts.schema ? { options: `-c search_path=${opts.schema},public` } : {}),
    application_name: 'fiestapay-api',
  });
}

/** Runs fn inside a transaction, rolling back on any throw. */
export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* the connection is being discarded anyway */
    }
    throw err;
  } finally {
    client.release();
  }
}

/** Parses a SUM()/COUNT() result into a safe integer. */
export function sumToCents(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`Suma monetaria invalida: ${String(value)}`);
  return n;
}
