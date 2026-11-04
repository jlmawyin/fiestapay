import { withTransaction, type Pool, type PoolClient } from '../db/pool.js';
import { gone } from '../errors.js';
import { audit, type AuditAction } from './audit.js';
import { lockEvent, type EventRow, type Queryable } from './read.js';

/** Distinct from the migration lock (778899123) and the voice lease lock (778899124). */
export const RETENTION_LOCK = 778899125;
export const RETENTION_MS = 72 * 60 * 60 * 1000;

/** True at ends_at + 72h, including that exact instant. The sweeper may lag; callers must not. */
export function isPastRetention(endsAt: Date, now = new Date()): boolean {
  return endsAt.getTime() + RETENTION_MS <= now.getTime();
}

/**
 * Hides an event the moment the window closes, even if the 15-minute sweeper has not run.
 * The tombstone commits in its own transaction, then the caller answers 410.
 */
export async function concealExpired(pool: Pool, event: EventRow, now = new Date()): Promise<void> {
  if (!event.purged_at && !isPastRetention(event.ends_at, now)) return;
  if (!event.purged_at) {
    await withTransaction(pool, async (client) => {
      const locked = await lockEvent(client, event.id);
      if (!locked.purged_at && isPastRetention(locked.ends_at, now)) {
        await tombstoneEvent(client, locked.id, 'retention_purged');
      }
    });
  }
  throw gone('Este evento ya no esta disponible');
}
const PURGE_BATCH = 25;

/**
 * Wipes public content, the optional organizer name, and chat.
 * Keeps the event row and every order or ledger row.
 * Idempotent: a second call on an already purged event does nothing.
 */
export async function tombstoneEvent(db: Queryable, eventId: string, action: AuditAction): Promise<boolean> {
  const updated = await db.query(
    `UPDATE events SET
       purged_at = now(),
       closed_at = COALESCE(closed_at, now()),
       title = 'Eliminado',
       organizer_name = NULL,
       description = '',
       location = '',
       includes = '[]'::jsonb,
       agenda = '[]'::jsonb,
       access_code_hash = NULL
     WHERE id = $1 AND purged_at IS NULL
     RETURNING id`,
    [eventId],
  );
  await db.query('DELETE FROM recovery_tokens WHERE event_id = $1', [eventId]);
  await db.query('DELETE FROM organizer_contacts WHERE event_id = $1', [eventId]);
  if ((updated.rowCount ?? 0) === 0) return false;
  await db.query('UPDATE guests SET name = \'\' WHERE event_id = $1', [eventId]);
  await db.query('DELETE FROM chat_messages WHERE event_id = $1', [eventId]);
  await db.query('DELETE FROM organizer_chat_messages WHERE event_id = $1', [eventId]);
  await audit(db, eventId, action);
  return true;
}

/**
 * At ends_at + 72h, tombstone. Before that instant, no row is touched.
 * The advisory lock makes overlapping boots and ticks no-ops instead of double work.
 */
export async function purgeExpiredEvents(pool: Pool, now = new Date()): Promise<{ purged: number }> {
  const client = await pool.connect();
  try {
    const lock = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [RETENTION_LOCK]);
    if (!lock.rows[0]?.locked) return { purged: 0 };
    try {
      return await purgeLocked(client, now);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [RETENTION_LOCK]);
    }
  } finally {
    client.release();
  }
}

async function purgeLocked(client: PoolClient, now: Date): Promise<{ purged: number }> {
  await client.query('BEGIN');
  try {
    const due = await client.query<{ id: string }>(
      `SELECT id FROM events
        WHERE purged_at IS NULL
          AND ends_at + interval '72 hours' <= $1::timestamptz
        ORDER BY ends_at ASC
        LIMIT $2
        FOR UPDATE`,
      [now.toISOString(), PURGE_BATCH],
    );
    let purged = 0;
    for (const row of due.rows) {
      if (await tombstoneEvent(client, row.id, 'retention_purged')) purged += 1;
    }
    await client.query('COMMIT');
    return { purged };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

/** In-process non-overlap plus the database lock. One immediate pass, then a bounded interval. */
export function startRetentionLoop(pool: Pool, onError: (err: unknown) => void, intervalMs = 15 * 60 * 1000): () => void {
  let running = false;
  const tick = (): void => {
    if (running) return;
    running = true;
    void purgeExpiredEvents(pool)
      .catch(onError)
      .finally(() => {
        running = false;
      });
  };
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
