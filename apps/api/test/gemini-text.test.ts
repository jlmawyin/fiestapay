import { randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  GEMINI_DEFAULT_TEXT_MODEL,
  GEMINI_LIVE_API_VERSION,
  type PresentationSuggestion,
} from '@fiestapay/shared';
import { buildApp } from '../src/app.js';
import { loadConfig, type GeminiConfig } from '../src/config.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import {
  createGeminiResponse,
  GEMINI_THINKING_HEADROOM_TOKENS,
  geminiRequestBody,
  parseGeminiResponse,
  toGeminiContents,
  toGeminiFunctionDeclarations,
} from '../src/ai/gemini-text.js';
import {
  sanitizeOutput,
  toOpenAITools,
  type RespondFn,
  type RespondInput,
} from '../src/ai/openai.js';
import { TOOL_DECLARATIONS } from '../src/ai/tools.js';
import { completed, message } from './openai-script.js';
import { announceSkipWithoutDatabase, body, Client, DATABASE_URL, testConfig } from './harness.js';

announceSkipWithoutDatabase('gemini-text.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

const KEY = 'g-key-text-never-in-response';

function geminiConfig(overrides: Record<string, string> = {}): GeminiConfig {
  const config = loadConfig({
    NODE_ENV: 'test',
    GEMINI_API_KEY: KEY,
    AI_TEXT_PROVIDER: 'gemini',
    ...overrides,
  } as NodeJS.ProcessEnv).gemini;
  if (!config) throw new Error('gemini config expected');
  return config;
}

function signedInput(): RespondInput {
  return {
    instructions: 'reglas del asistente',
    input: [
      { role: 'user', content: 'hola' },
      { type: 'function_call', call_id: 'call_1', name: 'get_my_status', arguments: '{}', gemini_signature: 'sig-1' },
      { type: 'function_call_output', call_id: 'call_1', output: '{"ok":true}' },
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'listo', annotations: [] }],
        gemini_signature: 'sig-2',
      },
    ],
    tools: toOpenAITools(TOOL_DECLARATIONS),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('adaptador Gemini generateContent', () => {
  it('mapea texto, functionCall, functionResponse y conserva las firmas de pensamiento', () => {
    const contents = toGeminiContents(signedInput().input);
    expect(contents).toEqual([
      { role: 'user', parts: [{ text: 'hola' }] },
      {
        role: 'model',
        parts: [{ functionCall: { name: 'get_my_status', args: {} }, thoughtSignature: 'sig-1' }],
      },
      { role: 'user', parts: [{ functionResponse: { name: 'get_my_status', response: { ok: true } } }] },
      { role: 'model', parts: [{ text: 'listo', thoughtSignature: 'sig-2' }] },
    ]);
  });

  it('en llamadas paralelas conserva la firma de la primera y reenvia las demas', () => {
    const contents = toGeminiContents([
      { role: 'user', content: 'consulta' },
      { type: 'function_call', call_id: 'p1', name: 'get_event_details', arguments: '{}', gemini_signature: 'sig-p1' },
      { type: 'function_call', call_id: 'p2', name: 'get_my_status', arguments: '{}' },
      { type: 'function_call_output', call_id: 'p1', output: '{"ok":1}' },
      { type: 'function_call_output', call_id: 'p2', output: '{"ok":2}' },
    ]);
    expect(contents[1]).toEqual({
      role: 'model',
      parts: [
        { functionCall: { name: 'get_event_details', args: {} }, thoughtSignature: 'sig-p1' },
        { functionCall: { name: 'get_my_status', args: {} } },
      ],
    });
    expect(contents[2]).toEqual({
      role: 'user',
      parts: [
        { functionResponse: { name: 'get_event_details', response: { ok: 1 } } },
        { functionResponse: { name: 'get_my_status', response: { ok: 2 } } },
      ],
    });
  });

  it('un functionCall antiguo sin firma no se reenvia como llamada', () => {
    const contents = toGeminiContents([
      { role: 'user', content: 'hola' },
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'texto visible', annotations: [] }],
      },
      { type: 'function_call', call_id: 'old', name: 'get_my_status', arguments: '{}' },
      { type: 'function_call_output', call_id: 'old', output: '{"ok":true}' },
    ]);
    expect(JSON.stringify(contents)).not.toContain('functionCall');
    expect(JSON.stringify(contents)).not.toContain('functionResponse');
    expect(contents).toContainEqual({ role: 'model', parts: [{ text: 'texto visible' }] });
  });

  it('genera cuerpo REST con tipos en mayusculas, AUTO, salida limitada y pensamiento bajo', () => {
    const config = geminiConfig({ GEMINI_MAX_OUTPUT_TOKENS: '1234' });
    const body = geminiRequestBody(config, signedInput());
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'reglas del asistente' }] });
    expect(body.generationConfig).toEqual({
      maxOutputTokens: 1234 + GEMINI_THINKING_HEADROOM_TOKENS,
      thinkingConfig: { thinkingLevel: 'low' },
    });
    expect(body.toolConfig).toEqual({ functionCallingConfig: { mode: 'AUTO' } });
    const declarations = body.tools?.[0]?.functionDeclarations ?? [];
    expect(declarations.map((d) => d.name)).toEqual(TOOL_DECLARATIONS.map((d) => d.name));
    const rsvp = declarations.find((d) => d.name === 'propose_rsvp');
    expect(rsvp?.parameters?.type).toBe('OBJECT');
    const props = rsvp?.parameters?.properties as Record<string, { type?: string }>;
    expect(props.status.type).toBe('STRING');
    expect(props.companions.type).toBe('INTEGER');
  });

  it('suma 2048 de margen de razonamiento al tope visible pedido por el caller', () => {
    expect(GEMINI_THINKING_HEADROOM_TOKENS).toBe(2048);
    for (const requested of [700, 2000]) {
      const config = geminiConfig({ GEMINI_MAX_OUTPUT_TOKENS: String(requested) });
      const body = geminiRequestBody(config, signedInput());
      expect(body.generationConfig.maxOutputTokens).toBe(requested + 2048);
      // El tope del caller no cambia: solo se traduce al presupuesto compartido de Gemini.
      expect(config.maxOutputTokens).toBe(requested);
    }
    expect(geminiRequestBody(geminiConfig({ GEMINI_MAX_OUTPUT_TOKENS: '700' }), signedInput()).generationConfig.maxOutputTokens).toBe(2748);
    expect(geminiRequestBody(geminiConfig({ GEMINI_MAX_OUTPUT_TOKENS: '2000' }), signedInput()).generationConfig.maxOutputTokens).toBe(4048);
  });

  it('convierte las declaraciones del servidor al contrato publico sin mutar el original', () => {
    const declarations = toGeminiFunctionDeclarations(TOOL_DECLARATIONS);
    expect(declarations.find((d) => d.name === 'propose_rsvp')?.parameters?.type).toBe('OBJECT');
    expect(TOOL_DECLARATIONS[1]?.parameters).toBeUndefined();
  });

  it('normaliza texto y functionCall con call_id generado y firma', () => {
    const parsed = parseGeminiResponse({
      candidates: [{
        finishReason: 'STOP',
        content: {
          role: 'model',
          parts: [
            { functionCall: { name: 'get_my_status', args: { limit: 1 } }, thoughtSignature: 'sig-call' },
            { text: 'Hola', thoughtSignature: 'sig-text' },
            { text: 'oculto', thought: true },
          ],
        },
      }],
    });
    expect(parsed.status).toBe('completed');
    expect(parsed.items).toHaveLength(2);
    expect(parsed.items[0]).toMatchObject({
      type: 'function_call',
      name: 'get_my_status',
      arguments: '{"limit":1}',
      gemini_signature: 'sig-call',
    });
    expect((parsed.items[0] as { call_id: string }).call_id).toMatch(/^call_/);
    expect(parsed.items[1]).toMatchObject({
      type: 'message',
      gemini_signature: 'sig-text',
      content: [{ type: 'output_text', text: 'Hola' }],
    });
  });

  it('marca incompleto MAX_TOKENS y rechaza un error del proveedor sin cuerpo', () => {
    expect(parseGeminiResponse({
      candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'parcial' }] } }],
    })).toEqual({ items: [], status: 'incomplete', incompleteReason: 'MAX_TOKENS' });
    expect(() => parseGeminiResponse({ error: { message: 'detalle secreto' } })).toThrow(/no pudo completar/);
  });

  it('sanitizeOutput e historial aceptan gemini_signature', () => {
    const items = sanitizeOutput([
      { type: 'function_call', call_id: 'c1', name: 'get_my_status', arguments: '{}', gemini_signature: 's1' },
      {
        type: 'message',
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: 'hola' }],
        gemini_signature: 's2',
      },
    ]);
    expect(items[0]).toMatchObject({ type: 'function_call', gemini_signature: 's1' });
    expect(items[1]).toMatchObject({ type: 'message', gemini_signature: 's2' });
  });

  it('envia la clave solo en x-goog-api-key y no en la URL ni en Authorization', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'ok' }] } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const config = geminiConfig({ GEMINI_TEXT_MODEL: 'gemini-3.5-flash', GEMINI_MAX_OUTPUT_TOKENS: '777' });
    const output = await createGeminiResponse(config, signedInput());
    expect(output.status).toBe('completed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://generativelanguage.googleapis.com/${GEMINI_LIVE_API_VERSION}/models/gemini-3.5-flash:generateContent`);
    expect(url).not.toContain(KEY);
    const headers = init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe(KEY);
    expect(headers.authorization).toBeUndefined();
    const sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(sent).toMatchObject({
      systemInstruction: { parts: [{ text: 'reglas del asistente' }] },
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      generationConfig: {
        maxOutputTokens: 777 + GEMINI_THINKING_HEADROOM_TOKENS,
        thinkingConfig: { thinkingLevel: 'low' },
      },
    });
  });

  it('un error HTTP reporta solo el estado, nunca el cuerpo ni la clave', async () => {
    vi.stubGlobal('fetch', async () => new Response(`cuerpo-secreto ${KEY}`, { status: 500 }));
    await expect(createGeminiResponse(geminiConfig(), signedInput())).rejects.toMatchObject({
      statusCode: 503,
      message: 'El asistente no esta disponible (proveedor respondio 500)',
    });
  });

  it('un cuerpo ilegible responde 503 sin eco', async () => {
    vi.stubGlobal('fetch', async () => new Response('no-es-json', { status: 200 }));
    await expect(createGeminiResponse(geminiConfig(), signedInput())).rejects.toMatchObject({
      statusCode: 503,
    });
  });
});

describeDb('asistentes de texto con AI_TEXT_PROVIDER=gemini', () => {
  const schema = `fp_gemini_text_${randomBytes(5).toString('hex')}`;
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
    fn: (app: FastifyInstance, configs: Array<Record<string, unknown>>) => Promise<void>,
  ) {
    const configs: Array<Record<string, unknown>> = [];
    const wrapped: RespondFn = async (config, input) => {
      configs.push(config as unknown as Record<string, unknown>);
      return respond(config, input);
    };
    const app = await buildApp({
      pool,
      config: testConfig({
        AI_TEXT_PROVIDER: 'gemini',
        GEMINI_API_KEY: KEY,
        GEMINI_TEXT_MODEL: 'gemini-3.5-flash',
        OPENAI_API_KEY: 'openai-key-that-must-not-be-used',
      }),
      paypal: null,
      respond: wrapped,
      logger: false,
    });
    await app.ready();
    try {
      await fn(app, configs);
    } finally {
      await app.close();
    }
  }

  const responder: RespondFn = async (_config, input) => {
    if (input.instructions.includes('redactor breve')) {
      return completed(message('{"theme":"montana","description":"Una salida breve al aire libre."}'));
    }
    return completed(message('Respuesta con Gemini.'));
  };

  it('invitado, organizador y publico usan el modelo Gemini elegido', async () => {
    await withApp(responder, async (app, configs) => {
      const organizer = new Client(app);
      const created = body<{ event: { slug: string } }>(await organizer.post('/api/demo'));
      const guest = new Client(app);
      await guest.post(`/api/events/${created.event.slug}/join`, { name: 'Invitada Texto' });

      expect((await guest.post(`/api/events/${created.event.slug}/chat`, { message: 'Hola' })).statusCode).toBe(200);
      expect((await organizer.post(`/api/events/${created.event.slug}/organizer-chat`, { message: 'Hola' })).statusCode).toBe(200);
      expect((await new Client(app).post('/api/chat/public', { message: 'Hola' })).statusCode).toBe(200);

      expect(configs).toHaveLength(3);
      for (const config of configs) {
        expect(config).toMatchObject({ textModel: GEMINI_DEFAULT_TEXT_MODEL, apiKey: KEY });
        expect(config).not.toHaveProperty('baseUrl');
      }
    });
  });

  it('si la IA cae, el chat publico responde 503 y la sugerencia cae a reglas', async () => {
    const down: RespondFn = async () => {
      throw new Error(`fallo con ${KEY}`);
    };
    await withApp(down, async (app) => {
      const publicChat = await new Client(app).post('/api/chat/public', { message: 'Hola' });
      expect(publicChat.statusCode).toBe(503);
      expect(publicChat.body).not.toContain(KEY);

      const suggestion = await new Client(app).post('/api/ai/suggest-presentation', {
        template: 'viaje',
        title: 'Viaje al rio',
      });
      expect(suggestion.statusCode).toBe(200);
      const payload = body<PresentationSuggestion>(suggestion);
      expect(payload.source).toBe('rules');
      expect(payload.description).toBeNull();
      expect(JSON.stringify(payload)).not.toContain(KEY);
    });
  });
});
