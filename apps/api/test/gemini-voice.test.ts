import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  GEMINI_DEFAULT_LIVE_MODEL,
  GEMINI_DEFAULT_TEXT_MODEL,
  VOICE_PAYMENT_PENDING,
  type GeminiVoiceSessionConfig,
} from '@fiestapay/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { runTool } from '../src/ai/tools.js';
import { findGuestBySession, getEventBySlug } from '../src/domain/read.js';
import type { CreateGeminiVoiceTokenFn, GeminiVoiceTokenRequest } from '../src/ai/gemini-live.js';
import { ORGANIZER_TOOL_DECLARATIONS, ORGANIZER_TOOL_NAMES } from '../src/ai/organizer-tools.js';
import { TOOL_DECLARATIONS } from '../src/ai/tools.js';
import { announceSkipWithoutDatabase, body, Client, DATABASE_URL, testConfig } from './harness.js';

announceSkipWithoutDatabase('gemini-voice.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

const GEMINI_KEY = 'g-key-secret-never-in-response';

function geminiEnv(overrides: Record<string, string | undefined> = {}) {
  return testConfig({
    AI_TEXT_PROVIDER: 'gemini',
    GEMINI_API_KEY: GEMINI_KEY,
    VOICE_ENABLED: 'true',
    VOICE_MAX_SECONDS: '180',
    VOICE_DAILY_SECONDS: '1800',
    ...overrides,
  });
}

describe('configuracion Gemini de voz y modelos', () => {
  it('Gemini es el proveedor de voz por defecto y la sesion se acota a 120 s', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      VOICE_ENABLED: 'true',
      GEMINI_API_KEY: GEMINI_KEY,
      VOICE_MAX_SECONDS: '300',
    } as NodeJS.ProcessEnv);
    expect(config.voice).toMatchObject({ provider: 'gemini', enabled: true, maxSeconds: 120 });
  });

  it('AssemblyAI solo se habilita con VOICE_PROVIDER=assemblyai y su clave', () => {
    const geminiDefault = loadConfig({
      NODE_ENV: 'test',
      VOICE_ENABLED: 'true',
      ASSEMBLYAI_API_KEY: 'assembly-key',
      VOICE_MAX_SECONDS: '300',
    } as NodeJS.ProcessEnv);
    expect(geminiDefault.voice.provider).toBe('gemini');
    expect(geminiDefault.voice.enabled).toBe(false);

    const rollback = loadConfig({
      NODE_ENV: 'test',
      VOICE_ENABLED: 'true',
      VOICE_PROVIDER: 'assemblyai',
      ASSEMBLYAI_API_KEY: 'assembly-key',
      VOICE_MAX_SECONDS: '300',
    } as NodeJS.ProcessEnv);
    expect(rollback.voice).toMatchObject({ provider: 'assemblyai', enabled: true, maxSeconds: 300 });
  });

  it('un proveedor desconocido cae a Gemini sin repetir el valor', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      VOICE_ENABLED: 'true',
      VOICE_PROVIDER: 'proveedor-inventado',
      GEMINI_API_KEY: GEMINI_KEY,
    } as NodeJS.ProcessEnv);
    expect(config.voice.provider).toBe('gemini');
    expect(JSON.stringify(config.voice)).not.toContain('proveedor-inventado');
  });

  it('valida nombres de modelo y sustituye los invalidos sin eco', () => {
    const invalid = loadConfig({
      NODE_ENV: 'test',
      GEMINI_API_KEY: GEMINI_KEY,
      GEMINI_LIVE_MODEL: 'modelo-ajeno',
      GEMINI_TEXT_MODEL: 'gemini-<script>',
    } as NodeJS.ProcessEnv);
    expect(invalid.gemini).toMatchObject({
      liveModel: GEMINI_DEFAULT_LIVE_MODEL,
      textModel: GEMINI_DEFAULT_TEXT_MODEL,
    });

    const valid = loadConfig({
      NODE_ENV: 'test',
      GEMINI_API_KEY: GEMINI_KEY,
      GEMINI_LIVE_MODEL: 'gemini-3.9-live.preview',
      GEMINI_TEXT_MODEL: 'gemini-3.9-flash',
    } as NodeJS.ProcessEnv);
    expect(valid.gemini).toMatchObject({
      liveModel: 'gemini-3.9-live.preview',
      textModel: 'gemini-3.9-flash',
    });
  });

  it('ignora el GEMINI_MODEL heredado', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      GEMINI_API_KEY: GEMINI_KEY,
      GEMINI_MODEL: 'gemini-9-legacy',
    } as NodeJS.ProcessEnv);
    expect(config.gemini?.liveModel).toBe(GEMINI_DEFAULT_LIVE_MODEL);
    expect(config.gemini?.textModel).toBe(GEMINI_DEFAULT_TEXT_MODEL);
  });

  it('AI_TEXT_PROVIDER decide el proveedor de texto y LLM_PROVIDER sigue siendo compatibilidad', () => {
    expect(loadConfig({ NODE_ENV: 'test', GEMINI_API_KEY: GEMINI_KEY, OPENAI_API_KEY: 'o-key' } as NodeJS.ProcessEnv).textProvider).toBe('gemini');
    expect(loadConfig({ NODE_ENV: 'test', OPENAI_API_KEY: 'o-key' } as NodeJS.ProcessEnv).textProvider).toBe('openai');
    expect(loadConfig({
      NODE_ENV: 'test',
      AI_TEXT_PROVIDER: 'openai',
      GEMINI_API_KEY: GEMINI_KEY,
      OPENAI_API_KEY: 'o-key',
    } as NodeJS.ProcessEnv).textProvider).toBe('openai');
    expect(() => loadConfig({
      NODE_ENV: 'test',
      LLM_PROVIDER: 'openai',
      OPENAI_API_KEY: 'o-key',
    } as NodeJS.ProcessEnv)).not.toThrow();
  });
});

describeDb('tokens Gemini Live por rol, autorizacion, presupuesto y arrendamiento', () => {
  const schema = `fp_gemini_voice_${randomBytes(5).toString('hex')}`;
  let pool: Pool;
  let adminPool: Pool;

  beforeAll(async () => {
    pool = createPool({ connectionString: DATABASE_URL!, schema });
    adminPool = createPool({ connectionString: DATABASE_URL!, max: 2 });
    await migrate(pool, { schema });
  });

  afterAll(async () => {
    await pool?.end();
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await adminPool.end();
    }
  });

  beforeEach(async () => {
    // Each case starts with an empty daily/minute ledger; the provider is always the seam.
    await pool.query('TRUNCATE voice_leases');
  });

  async function withApp(
    extra: Record<string, string | undefined>,
    fn: (app: FastifyInstance, requests: GeminiVoiceTokenRequest[]) => Promise<void>,
    seam?: CreateGeminiVoiceTokenFn,
  ): Promise<void> {
    const requests: GeminiVoiceTokenRequest[] = [];
    const createVoiceToken: CreateGeminiVoiceTokenFn = seam ?? (async (request) => {
      requests.push(structuredClone(request));
      return 'auth_tokens/test-token';
    });
    const app = await buildApp({
      pool,
      config: geminiEnv(extra),
      paypal: null,
      createVoiceToken,
      logger: false,
    });
    await app.ready();
    try {
      await fn(app, requests);
    } finally {
      await app.close();
    }
  }

  async function demo(app: FastifyInstance, locale?: 'es' | 'en') {
    const organizer = new Client(app, locale);
    const created = body<{ event: { slug: string; title: string }; adminKey: string }>(await organizer.post('/api/demo'));
    return { organizer, slug: created.event.slug, title: created.event.title, key: created.adminKey };
  }

  async function join(app: FastifyInstance, slug: string, locale?: 'es' | 'en') {
    const guest = new Client(app, locale);
    await guest.post(`/api/events/${slug}/join`, { name: 'Invitada Gemini' });
    return guest;
  }

  async function leaseCount(): Promise<number> {
    const { rows } = await pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM voice_leases');
    return rows[0]!.n;
  }

  it('el invitado recibe el modelo, la voz, el kickoff, las herramientas y el token efimero bloqueados', async () => {
    await withApp({}, async (app, requests) => {
      const { slug } = await demo(app);
      const guest = await join(app, slug);
      const res = await guest.post(`/api/events/${slug}/voice/token`, { consent: true });
      expect(res.statusCode).toBe(200);
      const payload = body<{ token: string; sessionConfig: GeminiVoiceSessionConfig; maxSeconds: number; leaseId: string; audience: string; provider: string }>(res);
      expect(payload).toMatchObject({ token: 'auth_tokens/test-token', maxSeconds: 120, audience: 'guest', provider: 'gemini' });
      expect(payload.sessionConfig.provider).toBe('gemini');
      expect(payload.sessionConfig.model).toBe(GEMINI_DEFAULT_LIVE_MODEL);
      expect(payload.sessionConfig.apiVersion).toBe('v1beta');
      expect(payload.sessionConfig.locale).toBe('es');
      expect(payload.sessionConfig.liveConfig.responseModalities).toEqual(['AUDIO']);
      expect(payload.sessionConfig.liveConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore');
      expect(payload.sessionConfig.liveConfig.tools[0]!.functionDeclarations.map((d) => d.name))
        .toEqual(TOOL_DECLARATIONS.map((d) => d.name));
      const rsvp = payload.sessionConfig.liveConfig.tools[0]!.functionDeclarations.find((d) => d.name === 'propose_rsvp');
      const status = (rsvp?.parameters?.properties as Record<string, { type?: string }>).status;
      expect(status.type).toBe('STRING');
      expect(payload.sessionConfig.kickoff).toMatch(/Bienvenido a FiestaPay/);
      expect(payload.sessionConfig.liveConfig.systemInstruction).toContain('Aprobar en PayPal');

      expect(requests).toHaveLength(1);
      const request = requests[0]!;
      expect(request).toMatchObject({ model: GEMINI_DEFAULT_LIVE_MODEL, uses: 1, apiKey: GEMINI_KEY });
      expect(request.liveConfig).toEqual(payload.sessionConfig.liveConfig);
      expect(Date.parse(request.newSessionExpireTime) - Date.now()).toBeGreaterThan(50_000);
      expect(Date.parse(request.expireTime) - Date.parse(request.newSessionExpireTime)).toBe(90_000);

      const raw = res.body;
      expect(raw).not.toContain(GEMINI_KEY);
      expect(raw).not.toContain('apiKey');
    });
  });

  it('en ingles usa la voz Puck, la instruccion y el kickoff ingleses', async () => {
    await withApp({}, async (app) => {
      const { slug } = await demo(app, 'en');
      const guest = await join(app, slug, 'en');
      const res = await guest.post(`/api/events/${slug}/voice/token`, { consent: true });
      const payload = body<{ sessionConfig: GeminiVoiceSessionConfig }>(res);
      expect(payload.sessionConfig.locale).toBe('en');
      expect(payload.sessionConfig.liveConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Puck');
      expect(payload.sessionConfig.liveConfig.systemInstruction).toContain('Approve in PayPal');
      expect(payload.sessionConfig.kickoff).toMatch(/Welcome to FiestaPay/);
    });
  });

  it('el organizador recibe sus herramientas y el publico no recibe ninguna', async () => {
    await withApp({}, async (app, requests) => {
      const { organizer, slug } = await demo(app);
      const orgRes = await organizer.post(`/api/events/${slug}/organizer-voice/token`, { consent: true });
      expect(orgRes.statusCode).toBe(200);
      const org = body<{ sessionConfig: GeminiVoiceSessionConfig; audience: string; provider: string }>(orgRes);
      expect(org).toMatchObject({ audience: 'organizer', provider: 'gemini' });
      const names = org.sessionConfig.liveConfig.tools[0]!.functionDeclarations.map((d) => d.name);
      expect(names).toEqual(ORGANIZER_TOOL_DECLARATIONS.map((d) => d.name));
      expect(new Set(names)).toEqual(ORGANIZER_TOOL_NAMES);
      expect(org.sessionConfig.kickoff).toMatch(/Hola\. Puedo consultar/);

      const pubRes = await new Client(app).post('/api/voice/public/token', { consent: true });
      expect(pubRes.statusCode).toBe(200);
      const pub = body<{ sessionConfig: GeminiVoiceSessionConfig; audience: string; provider: string }>(pubRes);
      expect(pub).toMatchObject({ audience: 'public', provider: 'gemini' });
      expect(pub.sessionConfig.liveConfig.tools).toEqual([]);
      expect(pub.sessionConfig.liveConfig.systemInstruction).not.toContain('prepare_quote');
      expect(requests).toHaveLength(2);
    });
  });

  it('403 sin unirse, sin clave de organizador o con la clave de otro evento', async () => {
    await withApp({}, async (app) => {
      const first = await demo(app);
      const second = await demo(app);

      // The creator has a session but has not joined as a guest.
      const noJoin = await first.organizer.post(`/api/events/${first.slug}/voice/token`, { consent: true });
      expect(noJoin.statusCode).toBe(403);

      const noKey = new Client(app);
      const organizerDenied = await noKey.post(`/api/events/${first.slug}/organizer-voice/token`, { consent: true });
      expect(organizerDenied.statusCode).toBe(403);

      const crossed = new Client(app);
      crossed.authorize(first.slug, second.key);
      const otherEvent = await crossed.post(`/api/events/${first.slug}/organizer-voice/token`, { consent: true });
      expect(otherEvent.statusCode).toBe(403);
    });
  });

  it('el fallo del proveedor responde 503 sin cuerpo ni clave y conserva el arrendamiento', async () => {
    await withApp({}, async (app) => {
      const { organizer, slug } = await demo(app);
      const failed = await organizer.post(`/api/events/${slug}/organizer-voice/token`, { consent: true });
      expect(failed.statusCode).toBe(503);
      expect(failed.body).not.toContain(GEMINI_KEY);
      expect(failed.body).not.toContain('cuerpo-secreto');
      expect(await leaseCount()).toBe(1);
      const again = await organizer.post(`/api/events/${slug}/organizer-voice/token`, { consent: true });
      expect(again.statusCode).toBe(429);
      expect(again.body).toMatch(/sesión de voz activa/);
    }, async () => {
      throw new Error(`cuerpo-secreto ${GEMINI_KEY}`);
    });
  });

  it('la sesion activa, el limite diario y las 5 por minuto se consumen igual que hoy', async () => {
    // Same session, first as guest and then as organizer: authorization succeeds (the
    // organizer key is presented) and only the active lease can answer 429.
    await withApp({ VOICE_DAILY_SECONDS: '600' }, async (app) => {
      const { organizer, slug } = await demo(app);
      expect((await organizer.post(`/api/events/${slug}/join`, { name: 'Organizadora Invitada' })).statusCode).toBe(200);
      expect((await organizer.post(`/api/events/${slug}/voice/token`, { consent: true })).statusCode).toBe(200);
      const active = await organizer.post(`/api/events/${slug}/organizer-voice/token`, { consent: true });
      expect(active.statusCode).toBe(429);
      expect(active.body).toMatch(/sesión de voz activa/);
    });

    // The daily sum is charged before the active-lease check, so the same organizer session
    // gets the daily limit once its own 120 s have consumed the configured day.
    // Each block is its own day: the previous block's reserved seconds must not leak in.
    await pool.query('TRUNCATE voice_leases');
    await withApp({ VOICE_DAILY_SECONDS: '120' }, async (app) => {
      const { organizer, slug } = await demo(app);
      expect((await organizer.post(`/api/events/${slug}/organizer-voice/token`, { consent: true })).statusCode).toBe(200);
      const daily = await organizer.post(`/api/events/${slug}/organizer-voice/token`, { consent: true });
      expect(daily.statusCode).toBe(429);
      expect(daily.body).toMatch(/límite diario de voz/);
    });

    await pool.query('TRUNCATE voice_leases');
    await withApp({ VOICE_DAILY_SECONDS: '1800' }, async (app) => {
      // One session: release each lease so only the rolling 5-per-minute limit can reject.
      const client = new Client(app);
      const statuses: number[] = [];
      for (let i = 0; i < 6; i += 1) {
        const res = await client.post('/api/voice/public/token', { consent: true });
        statuses.push(res.statusCode);
        if (res.statusCode === 200) {
          const issued = body<{ leaseId: string }>(res);
          expect((await client.post('/api/voice/lease/release', { leaseId: issued.leaseId })).statusCode).toBe(200);
        }
      }
      expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
      expect(statuses[5]).toBe(429);
    });
  });

  it('prepare_quote usa solo centavos del servidor y devuelve el estado pendiente y el siguiente paso', async () => {
    await withApp({}, async (app) => {
      const { slug } = await demo(app);
      const guest = await join(app, slug);
      await guest.post(`/api/events/${slug}/rsvp`, { status: 'yes', companions: 1 });
      const event = await getEventBySlug(pool, slug);
      const { rows } = await pool.query<{ session_id: string }>(
        `SELECT g.session_id FROM guests g JOIN events e ON e.id = g.event_id WHERE e.slug = $1 AND g.name = $2`,
        [slug, 'Invitada Gemini'],
      );
      const sessionId = rows[0]!.session_id;
      const guestRow = await findGuestBySession(pool, event.id, sessionId);
      const outcome = await runTool(
        { pool, sessionId, event, guest: guestRow, quoteTtlSeconds: 900, locale: 'es' },
        'prepare_quote',
        { amountCents: 1, totalCents: 1, a_pagar_centavos: 1 },
      );
      expect(outcome.response).toMatchObject({
        ok: true,
        estado: VOICE_PAYMENT_PENDING,
        a_pagar_centavos: event.price_cents * 2,
      });
      expect(String(outcome.response.siguiente_paso)).toMatch(/Aprobar en PayPal/);
      expect(String(outcome.response.siguiente_paso)).toMatch(/captura verificada/);

      const english = await runTool(
        { pool, sessionId, event, guest: guestRow, quoteTtlSeconds: 900, locale: 'en' },
        'prepare_quote',
        { amountCents: 999_999 },
      );
      expect(english.response).toMatchObject({ a_pagar_centavos: event.price_cents * 2 });
      expect(String(english.response.siguiente_paso)).toMatch(/Approve in PayPal/);
    });
  });
});
