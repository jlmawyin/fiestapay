import type { Pool, PoolClient } from '../db/pool.js';
import { HttpError, forbidden, unavailable } from '../errors.js';
import { newId } from '../lib/ids.js';
import { withTransaction } from '../db/pool.js';

export type VoiceAudience = 'guest' | 'organizer';

/**
 * Shared voice reservation. The advisory lock stays first, matching the guest route, so a guest
 * lease and an organizer lease cannot invert lock order against each other. An authorize callback
 * may then lock the event row before the lease insert. The lock is never held across the
 * AssemblyAI HTTP call. A failed or ambiguous token request still keeps the reservation.
 */
export async function reserveVoiceLease(
  pool: Pool,
  input: {
    sessionId: string;
    eventId: string;
    reservedSeconds: number;
    dailySeconds: number;
    audience: VoiceAudience;
    authorize: (db: PoolClient) => Promise<void>;
  },
): Promise<string> {
  return withTransaction(pool, async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(778899124)');
    const usage = await db.query<{ seconds: string }>(
      `SELECT COALESCE(SUM(reserved_seconds), 0)::text AS seconds
         FROM voice_leases
        WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
    );
    const used = Number(usage.rows[0]?.seconds ?? '0');
    if (used + input.reservedSeconds > input.dailySeconds) {
      throw new HttpError(429, 'Se alcanzó el límite diario de voz; continúa por texto');
    }
    const active = await db.query(
      'SELECT id FROM voice_leases WHERE session_id = $1 AND expires_at > now()',
      [input.sessionId],
    );
    if (active.rowCount) throw new HttpError(429, 'Ya tienes una sesión de voz reservada. Espera a que termine');
    await input.authorize(db);
    const id = newId();
    await db.query(
      `INSERT INTO voice_leases (id, session_id, event_id, reserved_seconds, expires_at, audience)
       VALUES ($1, $2, $3, $4, now() + ($4 + 60) * interval '1 second', $5)`,
      [id, input.sessionId, input.eventId, input.reservedSeconds, input.audience],
    );
    return id;
  });
}

/** Audience is part of the lease. A guest lease cannot run an organizer tool, or the reverse. */
export async function requireVoiceLease(
  db: Pool | PoolClient,
  input: { leaseId: string; sessionId: string; eventId: string; audience: VoiceAudience },
): Promise<void> {
  const lease = await db.query<{ audience: string }>(
    `SELECT audience
       FROM voice_leases
      WHERE id = $1 AND session_id = $2 AND event_id = $3 AND expires_at > now()`,
    [input.leaseId, input.sessionId, input.eventId],
  );
  const row = lease.rows[0];
  if (!row || row.audience !== input.audience) throw forbidden('Herramienta o sesión de voz no autorizada');
}

/**
 * AssemblyAI realtime token. The provider call is GET. The browser route that asks us for a
 * token is POST; that does not change this outbound method. No model name is sent: the voice
 * engine does not expose one here.
 */
export async function fetchAssemblyRealtimeToken(voice: { key: string; maxSeconds: number }): Promise<string> {
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
    throw unavailable('No se pudo iniciar la voz. Continúa por texto');
  }
  if (!response.ok) throw unavailable('El proveedor de voz no está disponible');
  const data = await response.json() as { token?: string };
  if (!data.token) throw unavailable('El proveedor no entregó una sesión de voz');
  return data.token;
}

/** PCM, Spanish, and Lola. Shared so guest and organizer voice stay on the same engine. */
export function assemblyVoiceMedia(): {
  input: { format: { encoding: string }; language_codes: string[]; transcription_mode: string };
  output: { voice: string; format: { encoding: string } };
} {
  return {
    input: { format: { encoding: 'audio/pcm' }, language_codes: ['es'], transcription_mode: 'max_accuracy' },
    output: { voice: 'lola', format: { encoding: 'audio/pcm' } },
  };
}
