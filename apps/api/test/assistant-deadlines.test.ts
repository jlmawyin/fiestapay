import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UI_LABELS, type Locale } from '@fiestapay/shared';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { HttpError } from '../src/errors.js';
import { converse, openaiAdapter } from '../src/ai/chat.js';
import { ASSISTANT_TOTAL_TIMEOUT_MS, TEXT_CALL_TIMEOUT_MS, assistantDeadline, withinDeadline } from '../src/ai/deadlines.js';
import { type RespondFn, type RespondOutput } from '../src/ai/openai.js';
import { publicChatInstruction } from '../src/ai/public-chat.js';
import { completed, fnCall, message, scriptedOpenAI } from './openai-script.js';
import { announceSkipWithoutDatabase, body, Client, DATABASE_URL, testConfig } from './harness.js';

announceSkipWithoutDatabase('assistant-deadlines.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

const ES_TIMEOUT = 'El agente tardó demasiado en responder. Tu pregunta no se procesó; puedes reintentar.';
const EN_TIMEOUT = 'The agent took too long to respond. Your question was not processed; you can try again.';

const neverRespond: RespondFn = async () => new Promise<RespondOutput>(() => undefined);

describe('plazos y formato del asistente (sin base de datos)', () => {
  it('limita cada llamada a 25 s y la consulta completa a 40 s, por debajo de los 45 s del servidor', () => {
    expect(TEXT_CALL_TIMEOUT_MS).toBe(25_000);
    expect(ASSISTANT_TOTAL_TIMEOUT_MS).toBe(40_000);
    const config = loadConfig({
      NODE_ENV: 'test',
      OPENAI_API_KEY: 'k',
      OPENAI_TIMEOUT_MS: '999999',
      GEMINI_API_KEY: 'g',
      GEMINI_TIMEOUT_MS: '999999',
    } as NodeJS.ProcessEnv);
    expect(config.openai?.timeoutMs).toBe(25_000);
    expect(config.gemini?.timeoutMs).toBe(25_000);
  });

  it('produce un 504 localizado con causa timeout al agotarse la señal', async () => {
    const startedAt = Date.now();
    const signal = assistantDeadline(10);
    await expect(withinDeadline(signal, new Promise(() => undefined), 'es', startedAt)).rejects.toMatchObject({
      statusCode: 504,
      message: ES_TIMEOUT,
      logCause: 'timeout',
    });
    await expect(
      withinDeadline(assistantDeadline(10), new Promise(() => undefined), 'en', startedAt),
    ).rejects.toMatchObject({ statusCode: 504, message: EN_TIMEOUT });
  });

  it('varias rondas de herramientas reciben la MISMA señal de plazo', async () => {
    const seen: Array<AbortSignal | undefined> = [];
    const script = scriptedOpenAI([
      completed(fnCall('call_1', 'get_my_status', '{}')),
      completed(message('Listo.')),
    ]);
    const respond: RespondFn = async (config, input) => {
      seen.push(input.signal);
      return script.respond(config, input);
    };
    const signal = assistantDeadline(5_000);
    const result = await converse(
      openaiAdapter(
        {
          apiKey: 'k',
          model: 'm',
          baseUrl: 'https://example.invalid',
          timeoutMs: 25_000,
          maxToolRounds: 4,
          maxHistoryMessages: 24,
          maxOutputTokens: 1000,
          reasoningEffort: 'low',
        },
        'reglas',
        respond,
      ),
      [{ role: 'user', parts: [{ text: 'hola' }] }],
      async () => ({ response: { ok: true } }),
      async () => undefined,
      { signal, locale: 'es', startedAt: Date.now() },
    );
    expect(result.text).toBe('Listo.');
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(signal);
    expect(seen[1]).toBe(signal);
  });

  it('corta una segunda ronda lenta con 504 compartido, sin esperar el plazo real', async () => {
    const signal = assistantDeadline(25);
    const script = scriptedOpenAI([completed(fnCall('call_1', 'get_my_status', '{}'))]);
    const respond: RespondFn = async (config, input) => {
      if (input.input.some((item) => 'type' in item && item.type === 'function_call_output')) {
        return new Promise<RespondOutput>(() => undefined);
      }
      return script.respond(config, input);
    };
    await expect(
      converse(
        openaiAdapter(
          {
            apiKey: 'k',
            model: 'm',
            baseUrl: 'https://example.invalid',
            timeoutMs: 25_000,
            maxToolRounds: 4,
            maxHistoryMessages: 24,
            maxOutputTokens: 1000,
            reasoningEffort: 'low',
          },
          'reglas',
          respond,
        ),
        [{ role: 'user', parts: [{ text: 'hola' }] }],
        async () => ({ response: { ok: true } }),
        async () => undefined,
        { signal, locale: 'es', startedAt: Date.now() },
      ),
    ).rejects.toMatchObject({ statusCode: 504, logCause: 'timeout' });
  });

  it.each<Locale>(['es', 'en'])('incluye nombre, formato y hechos de pago en la guía pública (%s)', (locale) => {
    const prompt = publicChatInstruction(locale, 'landing');
    const L = UI_LABELS[locale];
    expect(prompt).toContain(L.agentName);
    expect(prompt).toMatch(locale === 'en' ? /first line answers/i : /primera línea responde/i);
    expect(prompt).toMatch(locale === 'en' ? /90 words/i : /90 palabras/i);
    expect(prompt).toMatch(locale === 'en' ? /double quotes/i : /comillas dobles/i);
    expect(prompt).toMatch(locale === 'en' ? /at most 5 items/i : /máximo 5 elementos/i);
    expect(prompt).toMatch(locale === 'en' ? /at most one follow-up question/i : /una pregunta de seguimiento/i);
    expect(prompt).toMatch(locale === 'en' ? /never write routes/i : /nunca escribas rutas/i);
    expect(prompt).toMatch(locale === 'en' ? /fixed per person/i : /fija por persona/i);
    expect(prompt).toMatch(locale === 'en' ? /1 \+ companions/i : /1 \+ acompañantes/i);
    expect(prompt).toMatch(locale === 'en' ? /verified capture counts as paid/i : /captura verificada por el servidor cuenta como pagada/i);
    expect(prompt).toMatch(locale === 'en' ? /PayPal Sandbox and no real money/i : /PayPal Sandbox y no se mueve dinero real/i);
    expect(prompt).toMatch(locale === 'en' ? /read-only/i : /solo lectura/i);
  });
});

describeDb('plazos del asistente con base de datos', () => {
  const schema = `fp_deadlines_${randomBytes(5).toString('hex')}`;
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

  async function withApp(
    respond: RespondFn,
    fn: (app: FastifyInstance, logs: string[]) => Promise<void>,
    options: { deadlineMs?: number } = {},
  ): Promise<void> {
    const logs: string[] = [];
    const app = await buildApp({
      pool,
      config: testConfig({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'clave-de-prueba' }),
      paypal: null,
      respond,
      logger: false,
      logStream: { write: (line: string) => logs.push(line) },
      ...(options.deadlineMs ? { assistantDeadlineMs: options.deadlineMs } : {}),
    });
    await app.ready();
    try {
      await fn(app, logs);
    } finally {
      await app.close();
    }
  }

  it('un proveedor lento responde 504 localizado y el log solo guarda la causa', async () => {
    const unique = 'pregunta-secreta-que-no-debe-registrarse';
    await withApp(neverRespond, async (app, logs) => {
      const res = await new Client(app, 'en').post('/api/chat/public', { message: unique });
      expect(res.statusCode).toBe(504);
      expect(body<{ error: string }>(res).error).toBe(EN_TIMEOUT);
      const logged = logs.join('');
      expect(logged).toContain('"cause":"timeout"');
      expect(logged).toMatch(/"elapsedMs":\d+/);
      expect(logged).not.toContain(unique);
      expect(logged).not.toContain('clave-de-prueba');
    }, { deadlineMs: 25 });
  });

  it('otros fallos del proveedor siguen siendo 503 y registran http_<status>', async () => {
    const failing: RespondFn = async () => {
      throw new HttpError(503, 'El asistente no esta disponible (proveedor respondio 500)', {
        logCause: 'http_500',
        elapsedMs: 12,
      });
    };
    await withApp(failing, async (app, logs) => {
      const res = await new Client(app).post('/api/chat/public', { message: 'mensaje-unico-503' });
      expect(res.statusCode).toBe(503);
      expect(logs.join('')).toContain('"cause":"http_500"');
      expect(logs.join('')).not.toContain('mensaje-unico-503');
    });
  });

  it('una respuesta incompleta del chat público registra incomplete_<finishReason>', async () => {
    const incomplete: RespondFn = async () => ({
      items: [],
      status: 'incomplete',
      incompleteReason: 'MAX_TOKENS',
    });
    await withApp(incomplete, async (app, logs) => {
      const res = await new Client(app).post('/api/chat/public', { message: 'resume' });
      expect(res.statusCode).toBe(503);
      expect(logs.join('')).toContain('"cause":"incomplete_MAX_TOKENS"');
    });
  });

  it('el chat público pide como máximo 700 tokens visibles', async () => {
    let maxOutputTokens = 0;
    const respond: RespondFn = async (config) => {
      maxOutputTokens = (config as { maxOutputTokens: number }).maxOutputTokens;
      return completed(message('Respuesta breve.'));
    };
    await withApp(respond, async (app) => {
      const res = await new Client(app).post('/api/chat/public', { message: 'Hola' });
      expect(res.statusCode).toBe(200);
      expect(maxOutputTokens).toBe(700);
    });
  });

  it('el invitado comparte el plazo entre varias rondas de herramientas y termina en 504', async () => {
    const signals: Array<AbortSignal | undefined> = [];
    const respond: RespondFn = async (config, input) => {
      signals.push(input.signal);
      if (input.input.some((item) => 'type' in item && item.type === 'function_call_output')) {
        // Second round: deliberately slower than the remaining request budget.
        return new Promise<RespondOutput>(() => undefined);
      }
      // First round: fast tool call, so there really is a second round.
      return scriptedOpenAI([completed(fnCall('call_1', 'get_my_status', '{}'))]).respond(config, input);
    };
    await withApp(respond, async (app) => {
      const organizer = new Client(app);
      const created = body<{ event: { slug: string } }>(await organizer.post('/api/demo'));
      const guest = new Client(app);
      await guest.post(`/api/events/${created.event.slug}/join`, { name: 'Invitada Plazo' });
      const res = await guest.post(`/api/events/${created.event.slug}/chat`, { message: 'consulta lenta' });
      expect(res.statusCode).toBe(504);
      expect(body<{ error: string }>(res).error).toBe(ES_TIMEOUT);
      expect(signals.length).toBeGreaterThanOrEqual(2);
      expect(signals[0]).toBeInstanceOf(AbortSignal);
      expect(signals.every((signal) => signal === signals[0])).toBe(true);
    }, { deadlineMs: 1_000 });
  });

  it('las ayudas breves caen a reglas dentro del plazo sin esperar al proveedor', async () => {
    await withApp(neverRespond, async (app) => {
      const suggestion = await new Client(app).post('/api/ai/suggest-presentation', {
        template: 'viaje',
        title: 'Viaje al río',
      });
      expect(suggestion.statusCode).toBe(200);
      expect(body<{ source: string }>(suggestion).source).toBe('rules');

      const draft = await new Client(app).post('/api/ai/draft-event', { text: 'Cena para 4 el sábado' });
      expect(draft.statusCode).toBe(200);
      expect(body<{ source: string }>(draft).source).toBe('rules');
    }, { deadlineMs: 25 });
  });
});
