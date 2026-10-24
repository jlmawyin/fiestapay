import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool } from './pool.js';

const MIGRATIONS_DIR = join(import.meta.dirname, 'migrations');
// Arbitrary but stable key so two booting instances cannot migrate at the same time.
const ADVISORY_LOCK_KEY = 778899123;

export interface MigrateResult {
  applied: string[];
  skipped: string[];
}

export async function migrate(pool: Pool, opts: { schema?: string } = {}): Promise<MigrateResult> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];
  try {
    if (opts.schema) {
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(opts.schema)}`);
      await client.query(`SET search_path TO ${quoteIdent(opts.schema)}, public`);
    }
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const done = new Set<string>(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
    );
    for (const file of files) {
      if (done.has(file)) {
        skipped.push(file);
        continue;
      }
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migracion fallida ${file}: ${(err as Error).message}`, { cause: err });
      }
    }
    return { applied, skipped };
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    } catch {
      /* ignore */
    }
    client.release();
  }
}

/** Only identifiers we generate ourselves reach this, but validate anyway. */
export function quoteIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`Identificador invalido: ${name}`);
  return `"${name}"`;
}
