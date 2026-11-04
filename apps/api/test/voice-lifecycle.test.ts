import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool, type Pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import {
  VOICE_NEW_SESSIONS_PER_MINUTE,
  releaseVoiceLease,
  requireVoiceLease,
  reserveVoiceLease,
  touchVoiceLease,
  type VoiceAudience,
} from '../src/ai/voice-lease.js';
import { newId, sha256 } from '../src/lib/ids.js';
import { startDemo } from '../src/domain/events.js';

/**
 * PostgreSQL-backed voice lifecycle tests. They are skipped, never silently passed, when
 * DATABASE_URL is absent. They exercise the persisted contract directly, so no AssemblyAI
 * token, no network and no browser are involved.
 */
describe.skipIf(!process.env.DATABASE_URL)('voice lease lifecycle', () => {
  const schema = `fp_voice_${randomBytes(5).toString('hex')}`;
  let pool: Pool;

  beforeAll(async () => {
    pool = createPool({ connectionString: process.env.DATABASE_URL!, schema });
    await migrate(pool, { schema });
  });

  afterAll(async () => {
    await pool?.end();
    const admin = createPool({ connectionString: process.env.DATABASE_URL! });
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  });

  async function insertSession(label: string): Promise<string> {
    const id = newId();
    await pool.query('INSERT INTO sessions(id, token_hash) VALUES($1,$2)', [id, sha256(label)]);
    return id;
  }

  async function eventFor(sessionId: string): Promise<string> {
    const minted = await startDemo(pool, sessionId);
    return minted.event.id;
  }

  /** The daily cap is global, so tests derive their budget from the schema's running total. */
  async function dailyUsage(): Promise<number> {
    const { rows } = await pool.query<{ seconds: string }>(
      `SELECT COALESCE(SUM(reserved_seconds), 0)::text AS seconds
         FROM voice_leases
        WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
    );
    return Number(rows[0]?.seconds ?? '0');
  }

  function reserve(
    sessionId: string,
    eventId: string | null,
    options: { audience?: VoiceAudience; seconds?: number; daily?: number } = {},
  ): Promise<string> {
    return reserveVoiceLease(pool, {
      sessionId,
      eventId,
      reservedSeconds: options.seconds ?? 60,
      dailySeconds: options.daily ?? 1800,
      audience: options.audience ?? (eventId === null ? 'public' : 'guest'),
      authorize: async () => {
        // Route-level role checks are separate; this test owns the lease contract.
      },
    });
  }

  it('releases idempotently, keeps reserved seconds and rejects the released lease', async () => {
    const session = await insertSession('release');
    const eventId = await eventFor(session);
    const leaseId = await reserve(session, eventId, { seconds: 60, daily: 1800 });

    await expect(releaseVoiceLease(pool, { leaseId, sessionId: session, reason: 'stop' })).resolves.toEqual({
      released: true,
      alreadyReleased: false,
    });
    await expect(releaseVoiceLease(pool, { leaseId, sessionId: session, reason: 'pagehide' })).resolves.toEqual({
      released: false,
      alreadyReleased: true,
    });

    const row = await pool.query<{
      seconds: number;
      released_at: Date | null;
      expires_at: Date;
      reason: string | null;
    }>(
      'SELECT reserved_seconds AS seconds, released_at, expires_at, release_reason AS reason FROM voice_leases WHERE id=$1',
      [leaseId],
    );
    expect(row.rows[0]?.seconds).toBe(60);
    expect(row.rows[0]?.released_at).not.toBeNull();
    // The first reason wins: a repeated release never rewrites history.
    expect(row.rows[0]?.reason).toBe('stop');
    // An older image only checks expires_at. Release must make it false too, without
    // removing the reserved seconds from the daily total.
    expect(row.rows[0]!.expires_at.getTime()).toBe(row.rows[0]!.released_at!.getTime());
    const legacy = await pool.query('SELECT 1 FROM voice_leases WHERE id=$1 AND expires_at > now()', [
      leaseId,
    ]);
    expect(legacy.rowCount).toBe(0);

    const usage = await pool.query<{ seconds: string }>(
      'SELECT COALESCE(SUM(reserved_seconds),0)::text AS seconds FROM voice_leases WHERE session_id=$1',
      [session],
    );
    expect(usage.rows[0]?.seconds).toBe('60');

    await expect(
      requireVoiceLease(pool, { leaseId, sessionId: session, eventId, audience: 'guest' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(touchVoiceLease(pool, { leaseId, sessionId: session })).resolves.toBe(false);
  });

  it('repairs a future expires_at left by a previous image without changing the first release', async () => {
    const session = await insertSession('legacy-expiry');
    const eventId = await eventFor(session);
    const leaseId = await reserve(session, eventId, { seconds: 30 });

    // Simulate the previous image: it wrote released_at/reason but kept expires_at in
    // the future, so a legacy `expires_at > now()` check would still see a live lease.
    const legacyReleasedAt = new Date(Date.now() - 5_000);
    await pool.query(
      "UPDATE voice_leases SET released_at=$2, release_reason='stop', expires_at=now() + interval '300 seconds' WHERE id=$1",
      [leaseId, legacyReleasedAt],
    );

    await expect(
      releaseVoiceLease(pool, { leaseId, sessionId: session, reason: 'pagehide' }),
    ).resolves.toEqual({ released: false, alreadyReleased: true });

    const row = await pool.query<{
      released_at: Date;
      expires_at: Date;
      release_reason: string;
    }>('SELECT released_at, expires_at, release_reason FROM voice_leases WHERE id=$1', [leaseId]);
    expect(row.rows[0]!.release_reason).toBe('stop');
    expect(row.rows[0]!.released_at.getTime()).toBe(legacyReleasedAt.getTime());
    expect(row.rows[0]!.expires_at.getTime()).toBeLessThanOrEqual(row.rows[0]!.released_at.getTime());
  });

  it('keeps a failed-token reservation counted and refuses a second charge on immediate retry', async () => {
    const session = await insertSession('token-failed');
    const eventId = await eventFor(session);

    const base = await dailyUsage();
    const budget = base + 120;

    // The server reserves before asking the provider. A provider failure returns 503 but
    // intentionally keeps the row and its seconds, so an immediate retry must not charge
    // a second reservation.
    const leaseId = await reserve(session, eventId, { seconds: 60, daily: budget });
    await expect(
      reserve(session, eventId, { seconds: 60, daily: budget }),
    ).rejects.toMatchObject({
      statusCode: 429,
      message: expect.stringContaining('sesión de voz activa'),
    });

    expect(await dailyUsage()).toBe(base + 60);
    const rows = await pool.query<{ released_at: Date | null }>(
      'SELECT released_at FROM voice_leases WHERE session_id=$1',
      [session],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]?.released_at).toBeNull();

    // Cleaning up the failed attempt does not refund it either.
    await releaseVoiceLease(pool, { leaseId, sessionId: session, reason: 'token_failed' });
    expect(await dailyUsage()).toBe(base + 60);
  });

  it('never releases or reads another session lease', async () => {
    const owner = await insertSession('owner');
    const stranger = await insertSession('stranger');
    const eventId = await eventFor(owner);
    const leaseId = await reserve(owner, eventId);

    await expect(
      releaseVoiceLease(pool, { leaseId, sessionId: stranger, reason: 'attack' }),
    ).rejects.toMatchObject({ statusCode: 404 });

    const row = await pool.query<{ released_at: Date | null }>(
      'SELECT released_at FROM voice_leases WHERE id=$1',
      [leaseId],
    );
    expect(row.rows[0]?.released_at).toBeNull();

    // Wrong session, wrong event or wrong audience is not authorization.
    await expect(
      requireVoiceLease(pool, { leaseId, sessionId: stranger, eventId, audience: 'guest' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      requireVoiceLease(pool, { leaseId, sessionId: owner, eventId, audience: 'organizer' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      requireVoiceLease(pool, { leaseId, sessionId: owner, eventId: newId(), audience: 'guest' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      requireVoiceLease(pool, { leaseId, sessionId: owner, eventId, audience: 'guest' }),
    ).resolves.toBeUndefined();
  });

  it('allows public informational voice with no event and no guest row', async () => {
    const session = await insertSession('public');
    const leaseId = await reserve(session, null, { audience: 'public', seconds: 180, daily: 1800 });

    const row = await pool.query<{ event_id: string | null; audience: string }>(
      'SELECT event_id, audience FROM voice_leases WHERE id=$1',
      [leaseId],
    );
    expect(row.rows[0]).toEqual({ event_id: null, audience: 'public' });
    await expect(
      requireVoiceLease(pool, { leaseId, sessionId: session, eventId: null, audience: 'public' }),
    ).resolves.toBeUndefined();
    await expect(
      requireVoiceLease(pool, { leaseId, sessionId: session, eventId: newId(), audience: 'public' }),
    ).rejects.toMatchObject({ statusCode: 403 });

    const guests = await pool.query('SELECT 1 FROM guests WHERE session_id=$1', [session]);
    expect(guests.rowCount).toBe(0);
  });

  it('serializes concurrent reservations to one lease per session', async () => {
    const session = await insertSession('concurrent');
    const eventId = await eventFor(session);

    const results = await Promise.allSettled([
      reserve(session, eventId, { seconds: 60, daily: 1800 }),
      reserve(session, eventId, { seconds: 60, daily: 1800 }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const rows = await pool.query('SELECT 1 FROM voice_leases WHERE session_id=$1', [session]);
    expect(rows.rowCount).toBe(1);
  });

  it('blocks a second role from opening a parallel lease for the same session', async () => {
    const session = await insertSession('cross-role');
    const eventId = await eventFor(session);
    await reserve(session, eventId, { audience: 'guest' });

    await expect(reserve(session, eventId, { audience: 'organizer' })).rejects.toMatchObject({
      statusCode: 429,
      message: expect.stringContaining('sesión de voz activa'),
    });
    await expect(reserve(session, null, { audience: 'public' })).rejects.toMatchObject({ statusCode: 429 });
  });

  it(`allows ${VOICE_NEW_SESSIONS_PER_MINUTE} new sessions per minute and never counts reads or releases`, async () => {
    const session = await insertSession('rate');
    const eventId = await eventFor(session);

    for (let index = 0; index < VOICE_NEW_SESSIONS_PER_MINUTE; index += 1) {
      const leaseId = await reserve(session, eventId, { seconds: 30, daily: 1800 });
      await releaseVoiceLease(pool, { leaseId, sessionId: session, reason: 'test' });
      await releaseVoiceLease(pool, { leaseId, sessionId: session, reason: 'test' });
      await touchVoiceLease(pool, { leaseId, sessionId: session });
    }

    const count = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM voice_leases WHERE session_id=$1',
      [session],
    );
    expect(count.rows[0]?.count).toBe(VOICE_NEW_SESSIONS_PER_MINUTE);

    await expect(reserve(session, eventId, { seconds: 30, daily: 1800 })).rejects.toMatchObject({
      statusCode: 429,
      message: expect.stringContaining('demasiadas sesiones'),
    });
    // Released rows still count: no extra session was created by the refused attempt.
    const after = await pool.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM voice_leases WHERE session_id=$1',
      [session],
    );
    expect(after.rows[0]?.count).toBe(VOICE_NEW_SESSIONS_PER_MINUTE);
  });

  it('fails closed on the daily cap and keeps released seconds charged', async () => {
    const firstSession = await insertSession('daily-one');
    const secondSession = await insertSession('daily-two');
    const firstEvent = await eventFor(firstSession);
    const secondEvent = await eventFor(secondSession);

    // The cap spans the whole deployment, not one session or event. Size this test's
    // budget from the seconds already reserved in the schema so it stays deterministic.
    const base = await dailyUsage();
    const budget = base + 100;

    const leaseId = await reserve(firstSession, firstEvent, { seconds: 60, daily: budget });
    await releaseVoiceLease(pool, { leaseId, sessionId: firstSession, reason: 'early' });

    await expect(
      reserve(secondSession, secondEvent, { seconds: 60, daily: budget }),
    ).rejects.toMatchObject({
      statusCode: 429,
      message: expect.stringContaining('límite diario'),
    });

    // The released 60 seconds stay charged: no refund happened.
    expect(await dailyUsage()).toBe(base + 60);
  });

  it('rejects an idle lease, recovers after releasing it, and never gifts daily budget', async () => {
    const session = await insertSession('idle');
    const eventId = await eventFor(session);

    const base = await dailyUsage();
    const budget = base + 360;

    const leaseId = await reserve(session, eventId, { seconds: 180, daily: budget });

    await pool.query(
      "UPDATE voice_leases SET activity_at = now() - interval '120 seconds' WHERE id=$1",
      [leaseId],
    );

    await expect(
      requireVoiceLease(pool, { leaseId, sessionId: session, eventId, audience: 'guest' }),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(touchVoiceLease(pool, { leaseId, sessionId: session })).resolves.toBe(false);

    // The stale lease is closed and a new reservation is possible, but the 180 seconds
    // already spent still count: 180 + 180 = 360 fits exactly.
    const recovered = await reserve(session, eventId, { seconds: 180, daily: budget });
    expect(recovered).not.toBe(leaseId);

    const rows = await pool.query<{
      id: string;
      released_at: Date | null;
      expires_at: Date;
      release_reason: string | null;
    }>(
      'SELECT id, released_at, expires_at, release_reason FROM voice_leases WHERE session_id=$1 ORDER BY created_at ASC',
      [session],
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]?.released_at).not.toBeNull();
    expect(rows.rows[0]?.release_reason).toBe('idle');
    // The stale closure must also invalidate expires_at for an older image.
    expect(rows.rows[0]!.expires_at.getTime()).toBeLessThanOrEqual(rows.rows[0]!.released_at!.getTime());
    const legacy = await pool.query('SELECT 1 FROM voice_leases WHERE id=$1 AND expires_at > now()', [
      rows.rows[0]!.id,
    ]);
    expect(legacy.rowCount).toBe(0);

    await expect(
      reserve(session, eventId, { seconds: 1, daily: budget }),
    ).rejects.toMatchObject({ statusCode: 429 });
  });
});
