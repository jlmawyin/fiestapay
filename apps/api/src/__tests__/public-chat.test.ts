import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { reserveAiRequest } from '../ai/budget.js';
import type { OpenAIConfig } from '../config.js';
import { loadConfig } from '../config.js';
import type { RespondFn, RespondInput, RespondOutput } from '../ai/openai.js';
import { buildApp } from '../app.js';
import { migrate } from '../db/migrate.js';
import { createPool, type Pool } from '../db/pool.js';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const ORIGIN = 'http://localhost:5173';

function requireValue<T>(value: T | null): T {
  if (value === null) throw new Error('El proveedor falso no fue llamado');
  return value;
}

function completed(text: string): RespondOutput {
  return {
    status: 'completed',
    items: [
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
  };
}

function cookieFrom(raw: string | string[] | undefined): string {
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header) throw new Error('La ruta pública no emitio su propia cookie');
  return header.split(';')[0] ?? header;
}

describe.skipIf(databaseUrl.length === 0)('chat publico informativo (FP-PUBLIC-CHAT-20261104)', () => {
  let pool: Pool;
  let adminPool: Pool;
  let app: FastifyInstance;
  let schemaName: string;
  let respondImpl: RespondFn = async () => completed('Respuesta publica de prueba.');

  const respond: RespondFn = (config, input) => respondImpl(config, input);

  async function postPublic(payload: Record<string, unknown>, cookie?: string) {
    return app.inject({
      method: 'POST',
      url: '/api/chat/public',
      payload,
      headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    });
  }

  async function countRows(table: 'ai_requests' | 'chat_messages' | 'events'): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM ${table}`);
    return Number(rows[0]?.count ?? '0');
  }

  async function newSession(): Promise<string> {
    const id = randomUUID();
    await pool.query('INSERT INTO sessions (id, token_hash) VALUES ($1,$2)', [
      id,
      Buffer.from(randomUUID().replace(/-/g, ''), 'hex'),
    ]);
    return id;
  }

  beforeAll(async () => {
    schemaName = `public_chat_test_${randomUUID().replace(/-/g, '')}`;
    adminPool = createPool({ connectionString: databaseUrl });
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    pool = createPool({ connectionString: databaseUrl, schema: schemaName });
    await migrate(pool);

    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      RATE_LIMIT: '0',
      SERVE_WEB: '0',
      PUBLIC_ORIGIN: ORIGIN,
      OPENAI_API_KEY: 'test-key',
      OPENAI_MODEL: 'gpt-6-luna',
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
    });
    app = await buildApp({ pool, config, respond, logger: false });
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    if (schemaName) await adminPool?.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await adminPool?.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE ai_requests, chat_messages, sessions CASCADE');
    respondImpl = async () => completed('Respuesta publica de prueba.');
  });

  it('funciona sin evento ni invitado, emite cookie propia y no guarda el chat publico', async () => {
    let capturedConfig: OpenAIConfig | null = null;
    let capturedInput: RespondInput | null = null;
    respondImpl = async (config, input) => {
      capturedConfig = config;
      capturedInput = input;
      return completed('FiestaPay usa PayPal Sandbox y no mueve dinero real.');
    };

    const response = await postPublic({ message: '  ¿Qué es FiestaPay?  ' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ text: 'FiestaPay usa PayPal Sandbox y no mueve dinero real.' });
    const cookie = cookieFrom(response.headers['set-cookie']);
    expect(cookie).toContain('fp_session=');

    const model = requireValue<OpenAIConfig>(capturedConfig);
    const input = requireValue<RespondInput>(capturedInput);
    expect(model.model).toBe('gpt-6-luna');
    expect(model.reasoningEffort).toBe('low');
    expect(input.tools).toEqual([]);
    expect(input.input).toEqual([{ role: 'user', content: '¿Qué es FiestaPay?' }]);
    expect(input.instructions).toContain('separado de cualquier evento');
    expect(input.instructions).toContain('OpenAI');
    expect(input.instructions).toContain('AG Grid');
    expect(input.instructions).toContain('/recover');

    const requests = await pool.query<{ event_id: string | null }>('SELECT event_id FROM ai_requests');
    expect(requests.rows).toHaveLength(1);
    expect(requests.rows[0]?.event_id).toBeNull();
    expect(await countRows('events')).toBe(0);
    expect(await countRows('chat_messages')).toBe(0);
  });

  it('envia la guia compartida al proveedor publico sin event data, tools ni historial', async () => {
    let capturedInput: RespondInput | null = null;
    let providerCalls = 0;
    respondImpl = async (_config, input) => {
      providerCalls += 1;
      capturedInput = input;
      return completed('Puedes usar "Ver panel de ejemplo (AG Grid)" o "Probar pago con PayPal".');
    };

    const response = await postPublic({ message: '¿Cómo empiezo la demo?' });
    expect(response.statusCode).toBe(200);
    expect(providerCalls).toBe(1);

    const input = requireValue<RespondInput>(capturedInput);
    expect(input.tools).toEqual([]);
    expect(input.instructions).toContain('GUÍA COMPARTIDA FIESTAPAY');
    expect(input.instructions).toContain('Explora la demo');
    expect(input.instructions).toContain('Ver panel de ejemplo (AG Grid)');
    expect(input.instructions).toContain('Probar pago con PayPal');
    expect(input.instructions).toContain('Recuperar mi enlace');
    expect(input.instructions).toContain('Detener y Cerrar Micrófono');
    expect(input.instructions).toMatch(/sin estado/i);
    expect(input.instructions).toMatch(/Nunca afirmes recordar clics/i);
    expect(input.instructions).not.toContain('Cena privada de prueba');
    expect(input.input).toEqual([{ role: 'user', content: '¿Cómo empiezo la demo?' }]);
    expect(await countRows('chat_messages')).toBe(0);
    expect(await countRows('events')).toBe(0);
  });

  it('rechaza mensajes vacios, largos o con rol, historial, evento o clave del cliente', async () => {
    let providerCalls = 0;
    respondImpl = async () => {
      providerCalls += 1;
      return completed('No deberia responder.');
    };

    const invalid: Record<string, unknown>[] = [
      {},
      { message: '   ' },
      { message: 'x'.repeat(1201) },
      { message: 7 },
      { message: 'hola', role: 'organizer' },
      { message: 'hola', history: [] },
      { message: 'hola', messages: [] },
      { message: 'hola', eventId: randomUUID() },
      { message: 'hola', adminKey: 'clave-ajena' },
    ];
    for (const payload of invalid) {
      const response = await postPublic(payload);
      expect(response.statusCode).toBe(400);
      expect(response.json()).not.toHaveProperty('text');
    }
    expect(providerCalls).toBe(0);
    expect(await countRows('ai_requests')).toBe(0);

    const tooLong = await postPublic({ message: 'a'.repeat(1201) });
    expect(tooLong.statusCode).toBe(400);

    let accepted: string | null = null;
    respondImpl = async (_config, input) => {
      accepted = (input.input[0] as { content?: string } | undefined)?.content ?? null;
      return completed('Limite aceptado.');
    };
    const atLimit = await postPublic({ message: `  ${'a'.repeat(1200)}  ` });
    expect(atLimit.statusCode).toBe(200);
    expect(requireValue(accepted)).toHaveLength(1200);
  });

  it('cada sesion envia solo su pregunta actual; no carga ni persiste historial de otras sesiones', async () => {
    const inputs: RespondInput[] = [];
    respondImpl = async (_config, input) => {
      inputs.push(input);
      return completed(`respuesta-${inputs.length}`);
    };

    const first = await postPublic({ message: 'pregunta A' });
    const firstCookie = cookieFrom(first.headers['set-cookie']);
    await postPublic({ message: 'pregunta B' }, firstCookie);
    await postPublic({ message: 'pregunta C' });

    expect(inputs.map((input) => input.input)).toEqual([
      [{ role: 'user', content: 'pregunta A' }],
      [{ role: 'user', content: 'pregunta B' }],
      [{ role: 'user', content: 'pregunta C' }],
    ]);
    const sessions = await pool.query<{ sessions: string }>(
      'SELECT count(DISTINCT session_id)::text AS sessions FROM ai_requests',
    );
    expect(Number(sessions.rows[0]?.sessions)).toBe(2);
    expect(await countRows('chat_messages')).toBe(0);

    const historyRoute = await app.inject({
      method: 'GET',
      url: '/api/chat/public/history',
      headers: { origin: ORIGIN, cookie: firstCookie },
    });
    expect(historyRoute.statusCode).toBe(404);
  });

  it('la migracion 0012 deja event_id nullable y conserva fila, FK e indice', async () => {
    const column = await pool.query<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'ai_requests' AND column_name = 'event_id'`,
    );
    expect(column.rows[0]?.is_nullable).toBe('YES');

    const fk = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_constraint
        WHERE conrelid = 'ai_requests'::regclass AND contype = 'f'`,
    );
    expect(Number(fk.rows[0]?.count)).toBeGreaterThan(0);

    const index = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_indexes
        WHERE schemaname = current_schema() AND tablename = 'ai_requests' AND indexname = 'ai_requests_day_idx'`,
    );
    expect(Number(index.rows[0]?.count)).toBe(1);

    const sessionId = await newSession();
    await reserveAiRequest(pool, sessionId, null);
    const rows = await pool.query<{ event_id: string | null }>('SELECT event_id FROM ai_requests');
    expect(rows.rows[0]?.event_id).toBeNull();
  });

  it('comparte el tope diario global y el tope 60 por sesion bajo el mismo advisory lock', async () => {
    const first = await newSession();
    const second = await newSession();
    const third = await newSession();

    await reserveAiRequest(pool, first, null, 2);
    await reserveAiRequest(pool, second, null, 2);
    await expect(reserveAiRequest(pool, third, null, 2)).rejects.toMatchObject({ statusCode: 429 });
    expect(await countRows('ai_requests')).toBe(2);

    await pool.query('TRUNCATE ai_requests');
    for (let index = 0; index < 60; index += 1) {
      await reserveAiRequest(pool, first, null, 500);
    }
    await expect(reserveAiRequest(pool, first, null, 500)).rejects.toMatchObject({ statusCode: 429 });
    await expect(reserveAiRequest(pool, second, null, 500)).resolves.toBeUndefined();
    expect(await countRows('ai_requests')).toBe(61);
  });

  it('dos solicitudes concurrentes no pueden superar el ultimo cupo global', async () => {
    const first = await newSession();
    const second = await newSession();

    const results = await Promise.allSettled([
      reserveAiRequest(pool, first, null, 1),
      reserveAiRequest(pool, second, null, 1),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.status === 'rejected' ? rejected[0].reason : null).toMatchObject({ statusCode: 429 });
    expect(await countRows('ai_requests')).toBe(1);
  });

  it('un fallo del proveedor reserva presupuesto pero devuelve 503 sin respuesta inventada', async () => {
    let providerCalls = 0;
    respondImpl = async () => {
      providerCalls += 1;
      throw new Error('fallo con detalle secreto que no debe llegar al cliente');
    };

    const response = await postPublic({ message: '¿Cómo funciona?' });
    expect(response.statusCode).toBe(503);
    const body = response.json() as { error: string; text?: string };
    expect(body.text).toBeUndefined();
    expect(body.error).toMatch(/chat público no está disponible/i);
    expect(body.error).toMatch(/reintentar manualmente|formularios y el panel/i);
    expect(body.error).not.toContain('detalle secreto');
    expect(providerCalls).toBe(1);
    expect(await countRows('ai_requests')).toBe(1);
  });

  const rejectedOutputs: Array<[string, RespondOutput]> = [
    ['incompleta', { status: 'incomplete', items: [] }],
    ['vacia', completed('   ')],
    [
      'con una herramienta inesperada',
      {
        status: 'completed',
        items: [
          {
            type: 'function_call',
            call_id: 'call-1',
            name: 'get_funding_progress',
            arguments: '{}',
          },
        ],
      },
    ],
  ];

  it.each(rejectedOutputs)('rechaza una salida %s con 503 amigable y sin tools', async (_name, output) => {
    respondImpl = async () => output;
    const response = await postPublic({ message: 'consulta general' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).not.toHaveProperty('text');
    expect(await countRows('ai_requests')).toBe(1);
  });

  it('acota el texto, no afirma ejecuciones y conserva la configuracion existente', async () => {
    let capturedConfig: OpenAIConfig | null = null;
    let capturedInput: RespondInput | null = null;
    respondImpl = async (config, input) => {
      capturedConfig = config;
      capturedInput = input;
      return completed(`**Hola** ${'a'.repeat(4000)}`);
    };

    const response = await postPublic({ message: 'resumen general' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { text: string };
    expect(body.text.startsWith('**Hola**')).toBe(true);
    expect(body.text.length).toBe(2000);
    const input = requireValue<RespondInput>(capturedInput);
    expect(input.tools).toEqual([]);
    expect(input.instructions).toContain('No ejecutas acciones');
    expect(requireValue<OpenAIConfig>(capturedConfig).reasoningEffort).toBe('low');

    respondImpl = async () => completed('Ya procesé el reembolso de todos y confirmé el evento.');
    const claim = await postPublic({ message: '¿Reembolsaste?' });
    expect(claim.statusCode).toBe(503);
    expect(claim.json()).not.toHaveProperty('text');
  });

  it('sin OpenAI responde 503 antes de reservar presupuesto', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      RATE_LIMIT: '0',
      SERVE_WEB: '0',
      PUBLIC_ORIGIN: ORIGIN,
    });
    const unavailableApp = await buildApp({
      pool,
      config: { ...config, openai: null, openaiDisabledReason: 'Falta OPENAI_API_KEY' },
      logger: false,
    });
    try {
      const response = await unavailableApp.inject({
        method: 'POST',
        url: '/api/chat/public',
        payload: { message: 'hola' },
        headers: { origin: ORIGIN },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ error: 'Falta OPENAI_API_KEY' });
      expect(await countRows('ai_requests')).toBe(0);
    } finally {
      await unavailableApp.close();
    }
  });

  it('aplica 20 solicitudes por minuto por IP', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      RATE_LIMIT: '1',
      RATE_LIMIT_MAX: '1000',
      SERVE_WEB: '0',
      PUBLIC_ORIGIN: ORIGIN,
      OPENAI_API_KEY: 'test-key',
      OPENAI_MODEL: 'gpt-6-luna',
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
    });
    const limitedApp = await buildApp({ pool, config, respond, logger: false });
    try {
      const statuses: number[] = [];
      for (let index = 0; index < 21; index += 1) {
        const response = await limitedApp.inject({
          method: 'POST',
          url: '/api/chat/public',
          payload: { message: `consulta ${index}` },
          headers: { origin: ORIGIN },
        });
        statuses.push(response.statusCode);
      }
      expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
      expect(statuses[20]).toBe(429);
      expect(await countRows('ai_requests')).toBe(20);
    } finally {
      await limitedApp.close();
    }
  });
});
