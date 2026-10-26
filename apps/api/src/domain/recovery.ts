import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { RecoveryConsumeResult, RecoveryContactStatus, RecoveryContactUpdate, RecoveryStatus } from '@fiestapay/shared';
import type { EmailConfig } from '../config.js';
import { withTransaction, type Pool, type PoolClient } from '../db/pool.js';
import { HttpError, badGateway, badRequest, gone, notFound, unavailable } from '../errors.js';
import { recoveryEmail } from '../email/compose.js';
import { maskMailbox, normalizeMailbox } from '../email/address.js';
import type { EmailAdapter, EmailSendResult } from '../email/types.js';
import { newId, sha256 } from '../lib/ids.js';
import { assertAdminKey, digestMatches } from './access.js';
import { audit } from './audit.js';
import { findEventBySlug, lockEvent, type EventRow, type Queryable } from './read.js';
import { isPastRetention, tombstoneEvent } from './retention.js';

/** Distinct from migration (778899123), voice (778899124) and retention (778899125). */
const EMAIL_BUDGET_LOCK = 778899126;

export const PUBLIC_ACCEPTED = { status: 'accepted' as const };
export const RECOVERY_UNAVAILABLE = 'El correo de recuperacion no esta configurado';
export const RECOVERY_LIMIT = 'Demasiados intentos de correo. Espera antes de volver a solicitarlo.';

const SLUG_RE = /^[a-z0-9-]{3,80}$/;

export interface RecoveryLimits {
  dailyCap: number;
  ipLimit: number;
  ipWindowSeconds: number;
  eventLimit: number;
  eventWindowSeconds: number;
  tokenTtlSeconds: number;
  from: string;
}

interface ContactRow {
  event_id: string;
  email: string;
  email_hash: Buffer;
  verified_at: Date | null;
}

interface TokenRow {
  id: string;
  event_id: string;
  purpose: 'verify' | 'recover';
  token_hash: Buffer;
  email_hash: Buffer;
  admin_key_hash: Buffer | null;
  expires_at: Date;
  consumed_at: Date | null;
  delivery_status: string;
}

export function limitsFrom(config: EmailConfig): RecoveryLimits {
  return {
    dailyCap: config.dailyCap,
    ipLimit: config.ipLimit,
    ipWindowSeconds: config.ipWindowSeconds,
    eventLimit: config.eventLimit,
    eventWindowSeconds: config.eventWindowSeconds,
    tokenTtlSeconds: config.tokenTtlSeconds,
    from: config.from,
  };
}

function sameDigest(left: Uint8Array | null | undefined, right: Uint8Array | null | undefined): boolean {
  if (!left || !right) return !left && !right;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function newRecoveryToken(): string {
  return randomBytes(32).toString('base64url');
}

function contactStatus(row: ContactRow | null): RecoveryContactStatus {
  if (!row) return { state: 'none', masked: null };
  return { state: row.verified_at ? 'verified' : 'pending', masked: maskMailbox(row.email) };
}

async function lockBySlug(client: PoolClient, slug: string): Promise<EventRow> {
  const found = await client.query<{ id: string }>('SELECT id FROM events WHERE slug = $1', [slug]);
  const eventId = found.rows[0]?.id;
  if (!eventId) throw notFound('Evento no encontrado');
  return lockEvent(client, eventId);
}

function unavailableEvent(event: EventRow, now: Date): boolean {
  return Boolean(event.purged_at) || event.archived || isPastRetention(event.ends_at, now);
}

async function loadContact(db: Queryable, eventId: string): Promise<ContactRow | null> {
  const { rows } = await db.query<ContactRow>(
    'SELECT event_id, email, email_hash, verified_at FROM organizer_contacts WHERE event_id = $1',
    [eventId],
  );
  return rows[0] ?? null;
}

async function bumpWindow(db: PoolClient, scope: 'ip' | 'event', bucket: Buffer, windowSeconds: number): Promise<number> {
  const { rows } = await db.query<{ hits: number }>(
    `INSERT INTO email_attempt_windows AS w (scope, bucket, window_start, hits)
     VALUES ($1, $2, now(), 1)
     ON CONFLICT (scope, bucket) DO UPDATE
     SET hits = CASE
           WHEN w.window_start <= now() - make_interval(secs => $3) THEN 1
           ELSE w.hits + 1
         END,
         window_start = CASE
           WHEN w.window_start <= now() - make_interval(secs => $3) THEN now()
           ELSE w.window_start
         END
     RETURNING hits`,
    [scope, bucket, windowSeconds],
  );
  return rows[0]?.hits ?? 1;
}

/** Commits with the caller. A failed or unused reservation is not given back. */
async function reserveDaily(db: PoolClient, cap: number): Promise<boolean> {
  await db.query('SELECT pg_advisory_xact_lock($1)', [EMAIL_BUDGET_LOCK]);
  const { rows } = await db.query<{ reserved: number }>(
    `SELECT reserved FROM email_daily_budget
      WHERE day = (now() AT TIME ZONE 'America/Guayaquil')::date
      FOR UPDATE`,
    [],
  );
  const reserved = rows[0]?.reserved ?? 0;
  if (reserved >= cap) return false;
  if (rows.length === 0) {
    await db.query(
      `INSERT INTO email_daily_budget (day, reserved)
       VALUES ((now() AT TIME ZONE 'America/Guayaquil')::date, 1)`,
    );
  } else {
    await db.query(
      `UPDATE email_daily_budget SET reserved = reserved + 1
        WHERE day = (now() AT TIME ZONE 'America/Guayaquil')::date`,
    );
  }
  return true;
}

async function charge(db: PoolClient, ip: string, eventKey: string, limits: RecoveryLimits): Promise<boolean> {
  const ipHits = await bumpWindow(db, 'ip', sha256(`ip:${ip}`), limits.ipWindowSeconds);
  const eventHits = await bumpWindow(db, 'event', sha256(`event:${eventKey}`), limits.eventWindowSeconds);
  if (ipHits > limits.ipLimit || eventHits > limits.eventLimit) return false;
  return reserveDaily(db, limits.dailyCap);
}

async function insertToken(
  db: PoolClient,
  event: EventRow,
  purpose: 'verify' | 'recover',
  emailHash: Buffer,
  ttlSeconds: number,
): Promise<{ id: string; token: string }> {
  const token = newRecoveryToken();
  const id = newId();
  const expires = new Date(Date.now() + ttlSeconds * 1000);
  await db.query(
    `INSERT INTO recovery_tokens
       (id, event_id, purpose, token_hash, email_hash, admin_key_hash, expires_at, delivery_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
    [id, event.id, purpose, sha256(token), emailHash, event.admin_key_hash, expires.toISOString()],
  );
  return { id, token };
}

async function markDelivery(pool: Pool, tokenId: string, result: EmailSendResult): Promise<void> {
  // Timeout stays usable: the server may already have accepted the message. A known failure does not.
  const terminal = result.status === 'rejected' || result.status === 'failed';
  await pool.query(
    `UPDATE recovery_tokens
        SET delivery_status = $2,
            consumed_at = CASE WHEN $3::boolean THEN COALESCE(consumed_at, now()) ELSE consumed_at END
      WHERE id = $1`,
    [tokenId, result.status, terminal],
  );
}

async function handoff(
  pool: Pool,
  adapter: EmailAdapter,
  eventId: string,
  tokenId: string,
  purpose: 'verify' | 'recover',
  origin: string,
  to: string,
  token: string,
): Promise<EmailSendResult> {
  let result: EmailSendResult;
  try {
    result = await adapter.send(recoveryEmail(purpose, origin, to, token));
  } catch {
    result = { status: 'failed' };
  }
  try {
    await markDelivery(pool, tokenId, result);
    await audit(pool, eventId, result.status === 'accepted' ? 'recovery_link_sent' : 'recovery_send_failed');
  } catch {
    // The public caller still answers the same body. A lost status row must not reveal the mailbox.
  }
  return result;
}

function readyMail(
  adapter: EmailAdapter | null,
  limits: RecoveryLimits | null,
  origin: string | null,
): { adapter: EmailAdapter; limits: RecoveryLimits; origin: string } {
  if (!adapter || !limits || !origin) throw unavailable(RECOVERY_UNAVAILABLE);
  return { adapter, limits, origin };
}

export async function recoveryStatus(
  pool: Pool,
  slug: string,
  presentedKey: string | null,
  emailEnabled: boolean,
): Promise<RecoveryStatus> {
  const outcome = await withTransaction(pool, async (client) => {
    const event = await lockBySlug(client, slug);
    assertAdminKey(event, presentedKey);
    if (event.purged_at || isPastRetention(event.ends_at)) {
      if (!event.purged_at) await tombstoneEvent(client, event.id, 'retention_purged');
      return { kind: 'gone' as const };
    }
    if (event.archived) return { kind: 'gone' as const };
    const contact = await loadContact(client, event.id);
    return { kind: 'ok' as const, contact: contactStatus(contact) };
  });
  if (outcome.kind === 'gone') throw gone('Este evento ya no esta disponible');
  return { email: emailEnabled, contact: outcome.contact };
}

export async function setRecoveryContact(
  pool: Pool,
  slug: string,
  presentedKey: string | null,
  rawEmail: string,
  ip: string,
  adapter: EmailAdapter | null,
  limits: RecoveryLimits | null,
  origin: string | null,
): Promise<RecoveryContactUpdate> {
  const mail = readyMail(adapter, limits, origin);
  const email = normalizeMailbox(rawEmail);
  if (!email) throw badRequest('Correo invalido');
  const emailHash = sha256(email);
  const outcome = await withTransaction(pool, async (client) => {
    const event = await lockBySlug(client, slug);
    assertAdminKey(event, presentedKey);
    if (event.purged_at || isPastRetention(event.ends_at)) {
      if (!event.purged_at) await tombstoneEvent(client, event.id, 'retention_purged');
      return { kind: 'gone' as const };
    }
    if (event.archived) return { kind: 'gone' as const };
    const current = await loadContact(client, event.id);
    if (current?.verified_at && sameDigest(current.email_hash, emailHash)) {
      return { kind: 'unchanged' as const, contact: contactStatus(current) };
    }
    const allowed = await charge(client, ip, event.slug, mail.limits);
    if (!allowed) return { kind: 'limited' as const };
    await client.query(
      `INSERT INTO organizer_contacts (event_id, email, email_hash, verified_at, updated_at)
       VALUES ($1, $2, $3, NULL, now())
       ON CONFLICT (event_id) DO UPDATE
       SET email = EXCLUDED.email, email_hash = EXCLUDED.email_hash, verified_at = NULL, updated_at = now()`,
      [event.id, email, emailHash],
    );
    await client.query('DELETE FROM recovery_tokens WHERE event_id = $1', [event.id]);
    const issued = await insertToken(client, event, 'verify', emailHash, mail.limits.tokenTtlSeconds);
    await audit(client, event.id, 'recovery_contact_set');
    const saved = await loadContact(client, event.id);
    return { kind: 'send' as const, eventId: event.id, to: email, ...issued, contact: contactStatus(saved) };
  });
  if (outcome.kind === 'gone') throw gone('Este evento ya no esta disponible');
  if (outcome.kind === 'limited') throw new HttpError(429, RECOVERY_LIMIT);
  if (outcome.kind === 'unchanged') return { contact: outcome.contact, delivery: 'unchanged' };
  const result = await handoff(pool, mail.adapter, outcome.eventId, outcome.id, 'verify', mail.origin, outcome.to, outcome.token);
  if (result.status === 'accepted') return { contact: outcome.contact, delivery: 'accepted' };
  if (result.status === 'rejected') throw badGateway('El servidor de salida rechazo el correo y no queda verificado');
  if (result.status === 'timeout') throw badGateway('El envio no confirmo a tiempo. Si no llega, solicita otro enlace');
  throw badGateway('No se pudo enviar el correo de verificacion');
}

export async function removeRecoveryContact(
  pool: Pool,
  slug: string,
  presentedKey: string | null,
  emailEnabled: boolean,
): Promise<RecoveryStatus> {
  const outcome = await withTransaction(pool, async (client) => {
    const event = await lockBySlug(client, slug);
    assertAdminKey(event, presentedKey);
    if (event.purged_at || isPastRetention(event.ends_at)) {
      if (!event.purged_at) await tombstoneEvent(client, event.id, 'retention_purged');
      return { kind: 'gone' as const };
    }
    if (event.archived) return { kind: 'gone' as const };
    const removed = await client.query('DELETE FROM organizer_contacts WHERE event_id = $1', [event.id]);
    await client.query('DELETE FROM recovery_tokens WHERE event_id = $1', [event.id]);
    if ((removed.rowCount ?? 0) > 0) await audit(client, event.id, 'recovery_contact_removed');
    return { kind: 'ok' as const };
  });
  if (outcome.kind === 'gone') throw gone('Este evento ya no esta disponible');
  return { email: emailEnabled, contact: { state: 'none', masked: null } };
}

/**
 * Same status and body for an unknown slug, a wrong mailbox, an unverified mailbox and a match.
 * The daily reservation is taken before that branch, including attempts that send nothing.
 */
export async function requestRecoveryLink(
  pool: Pool,
  rawSlug: string,
  rawEmail: string,
  ip: string,
  adapter: EmailAdapter | null,
  limits: RecoveryLimits | null,
  origin: string | null,
): Promise<typeof PUBLIC_ACCEPTED> {
  const mail = readyMail(adapter, limits, origin);
  const email = normalizeMailbox(rawEmail);
  if (!email) throw badRequest('Correo invalido');
  const slug = rawSlug.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) throw badRequest('Enlace invalido');
  const emailHash = sha256(email);
  const outcome = await withTransaction(pool, async (client) => {
    const allowed = await charge(client, ip, slug, mail.limits);
    if (!allowed) return { kind: 'limited' as const };
    const event = await findEventBySlug(client, slug);
    if (!event || unavailableEvent(event, new Date())) return { kind: 'silent' as const };
    const contact = await loadContact(client, event.id);
    if (!contact?.verified_at || !sameDigest(contact.email_hash, emailHash)) return { kind: 'silent' as const };
    await client.query(`DELETE FROM recovery_tokens WHERE event_id = $1 AND purpose = 'recover'`, [event.id]);
    const issued = await insertToken(client, event, 'recover', emailHash, mail.limits.tokenTtlSeconds);
    return { kind: 'send' as const, eventId: event.id, to: contact.email, ...issued };
  });
  if (outcome.kind === 'limited') throw new HttpError(429, RECOVERY_LIMIT);
  if (outcome.kind === 'send') {
    await handoff(pool, mail.adapter, outcome.eventId, outcome.id, 'recover', mail.origin, outcome.to, outcome.token);
  }
  return PUBLIC_ACCEPTED;
}

export async function consumeRecoveryToken(pool: Pool, rawToken: string): Promise<RecoveryConsumeResult> {
  if (typeof rawToken !== 'string' || rawToken.length < 43 || rawToken.length > 200 || !/^[A-Za-z0-9_-]+$/.test(rawToken)) {
    throw badRequest('El enlace no es valido. Solicita uno nuevo.');
  }
  const digest = sha256(rawToken);
  const outcome = await withTransaction(pool, async (client) => {
    const located = await client.query<{ event_id: string }>('SELECT event_id FROM recovery_tokens WHERE token_hash = $1', [
      digest,
    ]);
    const eventId = located.rows[0]?.event_id;
    if (!eventId) return { kind: 'unknown' as const };
    // Event row first, then the token row. Callers must not invert this or two consumes can deadlock.
    const event = await lockEvent(client, eventId);
    const locked = await client.query<TokenRow>(
      `SELECT id, event_id, purpose, token_hash, email_hash, admin_key_hash, expires_at, consumed_at, delivery_status
         FROM recovery_tokens WHERE token_hash = $1 FOR UPDATE`,
      [digest],
    );
    const token = locked.rows[0];
    if (!token || !digestMatches(token.token_hash, rawToken)) return { kind: 'unknown' as const };
    if (event.purged_at || isPastRetention(event.ends_at)) {
      if (!event.purged_at) await tombstoneEvent(client, event.id, 'retention_purged');
      return { kind: 'gone' as const };
    }
    if (event.archived) return { kind: 'gone' as const };
    if (token.consumed_at) return { kind: 'reused' as const };
    if (token.expires_at.getTime() <= Date.now()) return { kind: 'expired' as const };
    const contact = await loadContact(client, event.id);
    const bound =
      contact &&
      sameDigest(contact.email_hash, token.email_hash) &&
      sameDigest(event.admin_key_hash, token.admin_key_hash);
    if (!bound || (token.purpose === 'recover' && !contact?.verified_at)) {
      await client.query('UPDATE recovery_tokens SET consumed_at = now() WHERE id = $1', [token.id]);
      return { kind: 'unknown' as const };
    }
    const consumed = await client.query(
      `UPDATE recovery_tokens SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL RETURNING id`,
      [token.id],
    );
    if ((consumed.rowCount ?? 0) !== 1) return { kind: 'reused' as const };
    await client.query('DELETE FROM recovery_tokens WHERE event_id = $1 AND id <> $2', [event.id, token.id]);
    if (token.purpose === 'verify') {
      await client.query('UPDATE organizer_contacts SET verified_at = now(), updated_at = now() WHERE event_id = $1', [event.id]);
      await audit(client, event.id, 'recovery_email_verified');
      return { kind: 'verify' as const, slug: event.slug };
    }
    const adminKey = randomBytes(32).toString('base64url');
    await client.query('UPDATE events SET admin_key_hash = $2 WHERE id = $1', [event.id, sha256(adminKey)]);
    await audit(client, event.id, 'admin_key_rotated');
    return { kind: 'recover' as const, slug: event.slug, adminKey };
  });
  if (outcome.kind === 'gone') throw gone('Este evento ya no esta disponible');
  if (outcome.kind === 'expired') throw badRequest('Este enlace caduco. Solicita uno nuevo.');
  if (outcome.kind === 'reused') throw badRequest('Este enlace ya se uso. Solicita uno nuevo.');
  if (outcome.kind === 'unknown') throw badRequest('El enlace no es valido. Solicita uno nuevo.');
  if (outcome.kind === 'verify') return { purpose: 'verify', slug: outcome.slug, verified: true };
  return { purpose: 'recover', slug: outcome.slug, adminKey: outcome.adminKey };
}
