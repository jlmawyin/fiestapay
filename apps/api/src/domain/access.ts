import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from '../db/pool.js';
import { forbidden, gone } from '../errors.js';
import { sha256 } from '../lib/ids.js';
import type { EventRow, Queryable } from './read.js';

const DUMMY_DIGEST = sha256('fiestapay-unused-digest-v1');
const ADMIN_HEADER = 'x-fiesta-admin-key';

const asBuffer = (value: Uint8Array | null | undefined): Buffer | null => {
  if (!value) return null;
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
};

/**
 * Compares sha256(presented) with the stored digest. Both sides are fixed-length hashes,
 * so timingSafeEqual does not leak the secret. A missing or malformed secret still runs a compare.
 */
export function digestMatches(stored: Uint8Array | null | undefined, presented: string | null | undefined): boolean {
  const usable = typeof presented === 'string' && presented.length > 0 && presented.length <= 200;
  const digest = usable ? sha256(presented) : DUMMY_DIGEST;
  const storedBuf = asBuffer(stored);
  const expected = storedBuf && storedBuf.length === digest.length ? storedBuf : DUMMY_DIGEST;
  const equal = timingSafeEqual(digest, expected);
  return Boolean(storedBuf && storedBuf.length === digest.length && usable && equal);
}

export function presentedAdminKey(req: FastifyRequest): string | null {
  const raw = req.headers[ADMIN_HEADER];
  return typeof raw === 'string' ? raw : null;
}

export function assertAdminKey(event: EventRow, presented: string | null): void {
  if (!digestMatches(event.admin_key_hash, presented)) {
    throw forbidden('Clave de organizador invalida');
  }
}

export async function isUnlocked(db: Queryable, eventId: string, sessionId: string): Promise<boolean> {
  const { rows } = await db.query<{ ok: number }>(
    'SELECT 1 AS ok FROM event_unlocks WHERE event_id = $1 AND session_id = $2',
    [eventId, sessionId],
  );
  return rows.length > 0;
}

/**
 * Private events reveal nothing until this session unlocked them, or the request carries a valid
 * admin key. Does not decide retention: money reconciliation still runs after a tombstone.
 */
export async function assertPrivateAccess(
  db: Queryable,
  event: EventRow,
  sessionId: string | null,
  presentedKey: string | null,
): Promise<void> {
  if (!event.access_code_hash) return;
  if (digestMatches(event.admin_key_hash, presentedKey)) return;
  if (sessionId && (await isUnlocked(db, event.id, sessionId))) return;
  throw forbidden('Codigo de acceso requerido');
}

/** Purged events are gone for everyone, including a valid key (callers map that to 410). */
export async function assertParticipant(
  db: Queryable,
  event: EventRow,
  sessionId: string | null,
  presentedKey: string | null,
): Promise<void> {
  if (event.purged_at) throw gone('Este evento ya no esta disponible');
  await assertPrivateAccess(db, event, sessionId, presentedKey);
}

/** Drops every browser proof for this event. Called when the code changes or is cleared. */
export async function revokeUnlocks(db: Pool | PoolClient, eventId: string): Promise<void> {
  await db.query('DELETE FROM event_unlocks WHERE event_id = $1', [eventId]);
}

export async function rememberUnlock(db: Pool | PoolClient, eventId: string, sessionId: string): Promise<void> {
  await db.query(
    `INSERT INTO event_unlocks (event_id, session_id) VALUES ($1, $2)
     ON CONFLICT (event_id, session_id) DO NOTHING`,
    [eventId, sessionId],
  );
}
