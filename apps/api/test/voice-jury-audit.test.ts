import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { FakePayPal } from './fake-paypal.js';
import {
  announceSkipWithoutDatabase,
  Client,
  DATABASE_URL,
  MERCHANT,
  testConfig,
} from './harness.js';
import {
  releaseVoiceLease,
  reserveVoiceLease,
  touchVoiceLease,
} from '../src/ai/voice-lease.js';
import { newId, sha256 } from '../src/lib/ids.js';

announceSkipWithoutDatabase('voice-jury-audit.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb('Auditoría independiente de ciclo de vida de voz (API / DB)', () => {
  const schema = `fp_jury_audit_${randomBytes(5).toString('hex')}`;
  let pool: Pool;
  let adminPool: Pool;
  let fake: FakePayPal;
  let app: FastifyInstance;

  beforeAll(async () => {
    pool = createPool({ connectionString: DATABASE_URL!, schema });
    adminPool = createPool({ connectionString: DATABASE_URL!, max: 2 });
    await migrate(pool, { schema });
    fake = new FakePayPal(MERCHANT);

    app = await buildApp({
      pool,
      config: testConfig({
        VOICE_ENABLED: 'true',
        ASSEMBLYAI_API_KEY: 'test-fake-assembly-key',
        VOICE_MAX_SECONDS: '180',
        VOICE_DAILY_SECONDS: '1800',
      }),
      paypal: fake,
      logger: false,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await adminPool.end();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function insertSession(label: string): Promise<string> {
    const id = newId();
    await pool.query('INSERT INTO sessions(id, token_hash) VALUES($1, $2)', [id, sha256(label)]);
    return id;
  }

  describe('CSRF / Origin guards on voice endpoints', () => {
    it('rejects POST /api/voice/lease/release from forbidden origin with 403', async () => {
      const client = new Client(app);
      const res = await client.post(
        '/api/voice/lease/release',
        { leaseId: randomUUID() },
        'https://attacker-malicious-site.com',
      );
      expect(res.statusCode).toBe(403);
      expect(res.body).toContain('Origen no permitido');
    });

    it('rejects POST /api/voice/public/token from forbidden origin with 403', async () => {
      const client = new Client(app);
      const res = await client.post(
        '/api/voice/public/token',
        { consent: true },
        'https://attacker-malicious-site.com',
      );
      expect(res.statusCode).toBe(403);
      expect(res.body).toContain('Origen no permitido');
    });

    it('rejects POST /api/voice/lease/activity from forbidden origin with 403', async () => {
      const client = new Client(app);
      const res = await client.post(
        '/api/voice/lease/activity',
        { leaseId: randomUUID() },
        'https://attacker-malicious-site.com',
      );
      expect(res.statusCode).toBe(403);
      expect(res.body).toContain('Origen no permitido');
    });
  });

  describe('Foreign lease protection and tamper resistance', () => {
    it('foreign session cannot release another session lease (404 and row untouched)', async () => {
      const victimSession = await insertSession('victim-session');
      const attackerSession = await insertSession('attacker-session');

      const leaseId = await reserveVoiceLease(pool, {
        sessionId: victimSession,
        eventId: null,
        reservedSeconds: 180,
        dailySeconds: 1800,
        audience: 'public',
        authorize: async () => {},
      });

      // Attacker tries to release victim lease directly in db helper
      await expect(
        releaseVoiceLease(pool, { leaseId, sessionId: attackerSession, reason: 'malicious' }),
      ).rejects.toMatchObject({ statusCode: 404 });

      // Check victim lease is still unreleased
      const { rows } = await pool.query<{ released_at: Date | null }>(
        'SELECT released_at FROM voice_leases WHERE id = $1',
        [leaseId],
      );
      expect(rows[0]?.released_at).toBeNull();
    });

    it('foreign session cannot touch or prolong another session lease', async () => {
      const victimSession = await insertSession('victim-session-2');
      const attackerSession = await insertSession('attacker-session-2');

      const leaseId = await reserveVoiceLease(pool, {
        sessionId: victimSession,
        eventId: null,
        reservedSeconds: 180,
        dailySeconds: 1800,
        audience: 'public',
        authorize: async () => {},
      });

      const touchResult = await touchVoiceLease(pool, {
        leaseId,
        sessionId: attackerSession,
      });
      expect(touchResult).toBe(false);
    });
  });

  describe('Auditoría de consistencia de release y expires_at', () => {
    it('release invalida también la consulta de expires_at de una imagen anterior', async () => {
      const session = await insertSession('release-expiry-check');
      const leaseId = await reserveVoiceLease(pool, {
        sessionId: session,
        eventId: null,
        reservedSeconds: 180,
        dailySeconds: 1800,
        audience: 'public',
        authorize: async () => {},
      });

      const before = await pool.query<{ expires_at: Date }>(
        'SELECT expires_at FROM voice_leases WHERE id = $1',
        [leaseId],
      );
      const originalExpiresAt = before.rows[0]!.expires_at;

      // Realizar release
      await releaseVoiceLease(pool, { leaseId, sessionId: session, reason: 'stop' });

      const after = await pool.query<{ released_at: Date | null; expires_at: Date }>(
        'SELECT released_at, expires_at FROM voice_leases WHERE id = $1',
        [leaseId],
      );

      expect(after.rows[0]?.released_at).not.toBeNull();

      expect(after.rows[0]!.expires_at.getTime()).toBeLessThan(originalExpiresAt.getTime());
      const legacy = await pool.query('SELECT id FROM voice_leases WHERE id = $1 AND expires_at > now()', [leaseId]);
      expect(legacy.rowCount).toBe(0);
    });
  });

  describe('Rate limit persistente y no devolución de presupuesto', () => {
    it('5 nuevas sesiones por minuto bloquea la sexta en cualquier rol de la sesión', async () => {
      const session = await insertSession('rate-limit-multi-role');

      // 5 reservas públicas rápidas
      for (let i = 0; i < 5; i++) {
        const leaseId = await reserveVoiceLease(pool, {
          sessionId: session,
          eventId: null,
          reservedSeconds: 10,
          dailySeconds: 3600,
          audience: 'public',
          authorize: async () => {},
        });
        await releaseVoiceLease(pool, { leaseId, sessionId: session, reason: 'quick-test' });
      }

      // La 6ta reserva es rechazada por rate limit
      await expect(
        reserveVoiceLease(pool, {
          sessionId: session,
          eventId: null,
          reservedSeconds: 10,
          dailySeconds: 3600,
          audience: 'public',
          authorize: async () => {},
        }),
      ).rejects.toMatchObject({
        statusCode: 429,
        message: expect.stringContaining('demasiadas sesiones'),
      });
    });

    it('liberación no devuelve el presupuesto diario consumido', async () => {
      const session1 = await insertSession('budget-session-1');
      const session2 = await insertSession('budget-session-2');

      const { rows: initialUsage } = await pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(reserved_seconds), 0)::text AS total
           FROM voice_leases
          WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
      );
      const base = Number(initialUsage[0]?.total ?? 0);
      const dailyCap = base + 120;

      // Reserva 60s y libera inmediatamente
      const leaseId = await reserveVoiceLease(pool, {
        sessionId: session1,
        eventId: null,
        reservedSeconds: 60,
        dailySeconds: dailyCap,
        audience: 'public',
        authorize: async () => {},
      });
      await releaseVoiceLease(pool, { leaseId, sessionId: session1, reason: 'stop' });

      // Reserva otros 60s (total = base + 120, tope alcanzado)
      await reserveVoiceLease(pool, {
        sessionId: session2,
        eventId: null,
        reservedSeconds: 60,
        dailySeconds: dailyCap,
        audience: 'public',
        authorize: async () => {},
      });

      // Intento adicional falla por tope diario
      await expect(
        reserveVoiceLease(pool, {
          sessionId: session2,
          eventId: null,
          reservedSeconds: 10,
          dailySeconds: dailyCap,
          audience: 'public',
          authorize: async () => {},
        }),
      ).rejects.toMatchObject({
        statusCode: 429,
        message: expect.stringContaining('límite diario'),
      });
    });
  });
});
