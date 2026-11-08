import type { Pool, PoolClient } from '../db/pool.js';
import type { Locale } from '@fiestapay/shared';
import { HttpError, forbidden, notFound, unavailable } from '../errors.js';
import { newId } from '../lib/ids.js';
import { withTransaction } from '../db/pool.js';

export type VoiceAudience = 'guest' | 'organizer' | 'public';

/** Real inactivity window. A lease with no interaction for this long is dead. */
export const VOICE_IDLE_SECONDS = 60;
/** New reservations allowed for one browser session in any rolling minute, across roles. */
export const VOICE_NEW_SESSIONS_PER_MINUTE = 5;
/** Client-side cooldown after any refusal. Not enforced here; published for the UI/contract. */
export const VOICE_CLIENT_COOLDOWN_SECONDS = 15;
/** Minimum separation between client-attested activity writes. Stops a ping loop. */
export const VOICE_ACTIVITY_MIN_INTERVAL_SECONDS = 5;

const MAX_SECONDS = 300;
const ACTIVE_LEASE_ES = 'Ya tienes una sesión de voz activa. Espera a que termine o pulsa Detener.';
const ACTIVE_LEASE_EN = 'You already have an active voice session. Wait for it to end or press Stop.';
const RATE_LIMIT_ES = 'Has iniciado demasiadas sesiones de voz. Espera un minuto antes de intentarlo otra vez.';
const RATE_LIMIT_EN = 'You started too many voice sessions. Wait one minute before trying again.';
const DAILY_LIMIT_ES = 'Se alcanzó el límite diario de voz; continúa por texto.';
const DAILY_LIMIT_EN = 'The daily voice limit was reached; continue by text.';

function leaseMessage(es: string, en: string, locale: Locale = 'es'): string {
  return locale === 'en' ? en : es;
}

/**
 * Shared voice reservation for guest, organizer and public audiences.
 *
 * The advisory lock is first and is common to every audience, so a guest, organizer or
 * public request cannot interleave its unique-active check or its daily total. A partial
 * unique index on (session_id) WHERE released_at IS NULL is the authoritative guard even
 * if this function is ever called without the lock. The lock is never held across the
 * AssemblyAI HTTP call.
 *
 * The full reserved duration is charged before the provider token is requested and the
 * row is kept forever: a failed token, an idle expiry or an explicit release never returns
 * budget. Only rows created today count toward the UTC daily cap.
 */
export async function reserveVoiceLease(
  pool: Pool,
  input: {
    sessionId: string;
    /** Null only for the public informational audience; no fictional event is created. */
    eventId: string | null;
    reservedSeconds: number;
    dailySeconds: number;
    audience: VoiceAudience;
    locale?: Locale;
    authorize: (db: PoolClient) => Promise<void>;
  },
): Promise<string> {
  const locale = input.locale ?? 'es';
  if (input.audience === 'public' ? input.eventId !== null : input.eventId === null) {
    throw new HttpError(400, leaseMessage('Reserva de voz inválida', 'Invalid voice reservation', locale));
  }
  const reservedSeconds = Math.floor(input.reservedSeconds);
  if (!Number.isInteger(reservedSeconds) || reservedSeconds < 1 || reservedSeconds > MAX_SECONDS) {
    throw new HttpError(400, leaseMessage('Duración de voz inválida', 'Invalid voice duration', locale));
  }

  return withTransaction(pool, async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(778899124)');

    // Close this session's own stale reservations before looking for a live one. This is
    // the only place another lease is touched, and the scope is always session_id + this
    // caller's own session. Reserved seconds stay counted.
    await db.query(
      `UPDATE voice_leases
          SET released_at = now(),
              -- An older image only checks expires_at. Expiring the stale row here makes
              -- the closure visible to that image too; reserved seconds stay charged.
              expires_at = LEAST(expires_at, now()),
              release_reason = CASE WHEN expires_at <= now() THEN 'expired' ELSE 'idle' END
        WHERE session_id = $1
          AND released_at IS NULL
          AND (expires_at <= now() OR activity_at <= now() - ($2 * interval '1 second'))`,
      [input.sessionId, VOICE_IDLE_SECONDS],
    );

    const usage = await db.query<{ seconds: string }>(
      `SELECT COALESCE(SUM(reserved_seconds), 0)::text AS seconds
         FROM voice_leases
        WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
    );
    const used = Number(usage.rows[0]?.seconds ?? '0');
    if (!Number.isSafeInteger(used) || used + reservedSeconds > input.dailySeconds) {
      throw new HttpError(429, leaseMessage(DAILY_LIMIT_ES, DAILY_LIMIT_EN, locale));
    }

    const active = await db.query(
      `SELECT id
         FROM voice_leases
        WHERE session_id = $1
          AND released_at IS NULL
          AND expires_at > now()
          AND activity_at > now() - ($2 * interval '1 second')
        LIMIT 1`,
      [input.sessionId, VOICE_IDLE_SECONDS],
    );
    if (active.rowCount) throw new HttpError(429, leaseMessage(ACTIVE_LEASE_ES, ACTIVE_LEASE_EN, locale));

    // Persistent across guest, organizer and public: querying, releasing and activity
    // writes never insert a row, so they never consume this allowance.
    const recent = await db.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM voice_leases
        WHERE session_id = $1
          AND created_at > now() - interval '60 seconds'`,
      [input.sessionId],
    );
    if (Number(recent.rows[0]?.count ?? 0) >= VOICE_NEW_SESSIONS_PER_MINUTE) {
      throw new HttpError(429, leaseMessage(RATE_LIMIT_ES, RATE_LIMIT_EN, locale));
    }

    await input.authorize(db);
    const id = newId();
    await db.query(
      `INSERT INTO voice_leases (id, session_id, event_id, reserved_seconds, expires_at, audience, activity_at)
       VALUES ($1, $2, $3, $4, now() + ($4 + 60) * interval '1 second', $5, now())`,
      [id, input.sessionId, input.eventId, reservedSeconds, input.audience],
    );
    return id;
  });
}

/**
 * Audience and event are part of the lease. A guest lease cannot run an organizer tool or
 * the reverse, and a released, expired or idle lease is rejected even if its row exists.
 */
export async function requireVoiceLease(
  db: Pool | PoolClient,
  input: { leaseId: string; sessionId: string; eventId: string | null; audience: VoiceAudience; locale?: Locale },
): Promise<void> {
  const lease = await db.query<{ audience: string }>(
    `SELECT audience
       FROM voice_leases
      WHERE id = $1
        AND session_id = $2
        AND event_id IS NOT DISTINCT FROM $3
        AND released_at IS NULL
        AND expires_at > now()
        AND activity_at > now() - ($4 * interval '1 second')`,
    [input.leaseId, input.sessionId, input.eventId, VOICE_IDLE_SECONDS],
  );
  const row = lease.rows[0];
  if (!row || row.audience !== input.audience) {
    throw forbidden(leaseMessage(
      'Herramienta o sesión de voz no autorizada',
      'Tool or voice session not authorized',
      input.locale,
    ));
  }
}

/**
 * Marks real interaction. The endpoint is intentionally not a heartbeat: callers send it
 * for speech or reply events, the server throttles writes to one every 5 seconds, and it
 * can never move expires_at. A plain ping therefore cannot keep a lease alive forever.
 *
 * @returns true when the lease exists and is still live; false when it is released,
 * expired or idle. A false result is not an error: the caller must stop the session.
 */
export async function touchVoiceLease(
  pool: Pool,
  input: { leaseId: string; sessionId: string },
): Promise<boolean> {
  const { rows } = await pool.query<{ live: boolean }>(
    `WITH live AS (
       SELECT id
         FROM voice_leases
        WHERE id = $1
          AND session_id = $2
          AND released_at IS NULL
          AND expires_at > now()
          AND activity_at > now() - ($3 * interval '1 second')
     ), touched AS (
       UPDATE voice_leases AS lease
          SET activity_at = now()
         FROM live
        WHERE lease.id = live.id
          AND lease.activity_at <= now() - ($4 * interval '1 second')
        RETURNING lease.id
     )
     SELECT EXISTS (SELECT 1 FROM live) AS live`,
    [input.leaseId, input.sessionId, VOICE_IDLE_SECONDS, VOICE_ACTIVITY_MIN_INTERVAL_SECONDS],
  );
  return Boolean(rows[0]?.live);
}

export interface VoiceReleaseResult {
  released: boolean;
  alreadyReleased: boolean;
}

/**
 * Idempotent release. Only the owner (same session) can release: a foreign or unknown
 * lease id answers 404 without changing any row. Repeated calls keep the first timestamp
 * and reason. `expires_at` is clamped to that timestamp so an older image that only reads
 * `expires_at` cannot revive the lease. reserved_seconds remain in the daily sum by design.
 */
export async function releaseVoiceLease(
  pool: Pool,
  input: { leaseId: string; sessionId: string; reason?: string },
): Promise<VoiceReleaseResult> {
  const reason = (input.reason ?? 'client').trim().slice(0, 40) || 'client';
  return withTransaction(pool, async (db) => {
    const { rows } = await db.query<{ previous: Date | null }>(
      `WITH target AS (
         SELECT id, released_at
           FROM voice_leases
          WHERE id = $1 AND session_id = $2
          FOR UPDATE
       ), updated AS (
         UPDATE voice_leases AS lease
            SET released_at = COALESCE(lease.released_at, now()),
                release_reason = COALESCE(lease.release_reason, $3),
                -- A previous image only consults expires_at, so a released lease must
                -- also stop being live there. Repeated calls keep the first timestamp.
                expires_at = LEAST(lease.expires_at, COALESCE(lease.released_at, now()))
           FROM target
          WHERE lease.id = target.id
          RETURNING lease.id, target.released_at AS previous
       )
       SELECT previous FROM updated`,
      [input.leaseId, input.sessionId, reason],
    );
    const row = rows[0];
    if (!row) throw notFound('Sesión de voz no encontrada');
    return { released: row.previous === null, alreadyReleased: row.previous !== null };
  });
}

/**
 * AssemblyAI realtime token. The provider call is GET. The browser route that asks us for a
 * token is POST; that does not change this outbound method. No model name is sent: the voice
 * engine does not expose one here.
 */
export async function fetchAssemblyRealtimeToken(
  voice: { key: string; maxSeconds: number },
  locale: Locale = 'es',
): Promise<string> {
  const url = new URL('https://agents.assemblyai.com/v1/token');
  url.searchParams.set('expires_in_seconds', '60');
  url.searchParams.set('max_session_duration_seconds', String(voice.maxSeconds));
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${voice.key}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw unavailable(leaseMessage(
      'No se pudo iniciar la voz. Continúa por texto',
      'Could not start voice. Continue by text',
      locale,
    ));
  }
  if (!response.ok) {
    throw unavailable(leaseMessage(
      'El proveedor de voz no está disponible',
      'The voice provider is not available',
      locale,
    ));
  }
  const data = await response.json() as { token?: string };
  if (!data.token) {
    throw unavailable(leaseMessage(
      'El proveedor no entregó una sesión de voz',
      'The provider did not return a voice session',
      locale,
    ));
  }
  return data.token;
}

/** PCM, one voice per locale. Shared so guest, organizer and public voice stay on the same engine. */
export function assemblyVoiceMedia(locale: Locale = 'es'): {
  input: { format: { encoding: string }; language_codes: string[]; transcription_mode: string };
  output: { voice: string; format: { encoding: string } };
} {
  const english = locale === 'en';
  return {
    input: {
      format: { encoding: 'audio/pcm' },
      language_codes: [english ? 'en' : 'es'],
      transcription_mode: 'max_accuracy',
    },
    output: { voice: english ? 'jane' : 'lola', format: { encoding: 'audio/pcm' } },
  };
}
