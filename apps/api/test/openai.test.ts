import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Capabilities } from '@fiestapay/shared';
import { buildApp } from '../src/app.js';
import { loadConfig, type OpenAIConfig } from '../src/config.js';
import type { Pool } from '../src/db/pool.js';
import { HttpError } from '../src/errors.js';
import { converse, MAX_TOOL_CALLS_PER_ROUND, openaiAdapter } from '../src/ai/chat.js';
import type { StoredTurn } from '../src/ai/history.js';
import { createResponse, sanitizeOutput, toOpenAIInput, toOpenAITools, type RespondOutput } from '../src/ai/openai.js';
import { TOOL_DECLARATIONS, type ToolOutcome } from '../src/ai/tools.js';
import { completed, fnCall, message, reasoning, scriptedOpenAI } from './openai-script.js';

const KEY = 'sk-test-no-real-key';

const openaiConfig = (overrides: Record<string, string> = {}): OpenAIConfig => {
  const config = loadConfig({ NODE_ENV: 'test', OPENAI_API_KEY: KEY, ...overrides } as NodeJS.ProcessEnv).openai;
  if (!config) throw new Error('openai config expected');
  return config;
};

/** Mock HTTP: every test that reaches fetch goes through this stub, never the network. */
function stubFetch(status: number, payload: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
    new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('configuracion del proveedor de chat', () => {
  it('usa OpenAI gpt-6-luna con razonamiento bajo y no lee claves ajenas', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      OPENAI_API_KEY: KEY,
      GEMINI_API_KEY: 'g-key-should-not-appear',
      GEMINI_MODEL: 'modelo-ajeno',
      GEMINI_BASE_URL: 'https://example.invalid',
    } as NodeJS.ProcessEnv);
    expect(config.llmProvider).toBe('openai');
    expect(config.openai).toMatchObject({ model: 'gpt-6-luna', reasoningEffort: 'low', baseUrl: 'https://api.openai.com/v1' });
    expect(config).not.toHaveProperty('gemini');
    const packed = JSON.stringify(config);
    expect(packed).not.toContain('g-key-should-not-appear');
    expect(packed).not.toContain('modelo-ajeno');
    expect(packed).not.toContain('example.invalid');
    expect(packed.toLowerCase()).not.toContain('gemini');
  });

  it('acepta solo LLM_PROVIDER=openai y no repite un valor rechazado', () => {
    expect(loadConfig({ NODE_ENV: 'test', LLM_PROVIDER: 'openai', OPENAI_API_KEY: KEY } as NodeJS.ProcessEnv).llmProvider).toBe('openai');
    expect(loadConfig({ NODE_ENV: 'test', LLM_PROVIDER: 'OpenAI', OPENAI_API_KEY: KEY } as NodeJS.ProcessEnv).llmProvider).toBe('openai');
    for (const raw of ['gemini', 'sk-pegada-por-error']) {
      expect(() => loadConfig({ NODE_ENV: 'test', LLM_PROVIDER: raw } as NodeJS.ProcessEnv)).toThrow(/LLM_PROVIDER invalido/);
      try {
        loadConfig({ NODE_ENV: 'test', LLM_PROVIDER: raw } as NodeJS.ProcessEnv);
      } catch (err) {
        expect((err as Error).message).not.toContain(raw);
      }
    }
  });

  it('sin clave deja el chat apagado con un motivo sin secretos', () => {
    const config = loadConfig({ NODE_ENV: 'test', GEMINI_API_KEY: 'g-key-should-not-appear' } as NodeJS.ProcessEnv);
    expect(config.openai).toBeNull();
    expect(config).not.toHaveProperty('gemini');
    expect(config.openaiDisabledReason).toContain('OPENAI_API_KEY');
    expect(config.openaiDisabledReason).not.toContain('g-key');
    expect(JSON.stringify(config).toLowerCase()).not.toContain('gemini');
  });

  it('acota tiempos, rondas, historial y salida', () => {
    const config = openaiConfig({
      OPENAI_TIMEOUT_MS: '999999',
      OPENAI_MAX_TOOL_ROUNDS: '99',
      OPENAI_MAX_HISTORY: '9999',
      OPENAI_MAX_OUTPUT_TOKENS: '99999',
    });
    expect(config).toMatchObject({ timeoutMs: 60000, maxToolRounds: 6, maxHistoryMessages: 60, maxOutputTokens: 4000 });
  });

  it('rechaza una URL base sin https', () => {
    const config = loadConfig({ NODE_ENV: 'test', OPENAI_API_KEY: KEY, OPENAI_BASE_URL: 'http://evil.example' } as NodeJS.ProcessEnv);
    expect(config.openai).toBeNull();
  });
});

describe('capacidades segun el proveedor seleccionado', () => {
  // The capabilities route never touches the database.
  const fakePool = {} as Pool;
  async function caps(env: Record<string, string>): Promise<Capabilities> {
    const app = await buildApp({
      pool: fakePool,
      config: loadConfig({ NODE_ENV: 'test', SERVE_WEB: '0', RATE_LIMIT: '0', ...env } as NodeJS.ProcessEnv),
      paypal: null,
      logger: false,
    });
    try {
      return (await app.inject({ method: 'GET', url: '/api/capabilities' })).json<Capabilities>();
    } finally {
      await app.close();
    }
  }

  it('OpenAI configurado anuncia chat y omite un proveedor retirado', async () => {
    const announced = await caps({ OPENAI_API_KEY: KEY, GEMINI_API_KEY: 'g-key-should-not-appear' });
    expect(announced).toMatchObject({ chat: true, llmProvider: 'openai' });
    expect(announced).not.toHaveProperty('gemini');
    const packed = JSON.stringify(announced);
    expect(packed.toLowerCase()).not.toContain('gemini');
    expect(packed).not.toContain('g-key');
  });

  it('sin clave anuncia chat apagado aunque el entorno traiga una clave ajena', async () => {
    const announced = await caps({ GEMINI_API_KEY: 'g-key-should-not-appear' });
    expect(announced).toMatchObject({ chat: false, llmProvider: 'openai' });
    expect(JSON.stringify(announced).toLowerCase()).not.toContain('gemini');
    expect(JSON.stringify(announced)).not.toContain('g-key');
  });
});

describe('peticion Responses (HTTP simulado)', () => {
  const input = { instructions: 'reglas', input: [{ role: 'user' as const, content: 'hola' }], tools: toOpenAITools(TOOL_DECLARATIONS) };

  it('envia modelo, razonamiento bajo, herramientas estrictas y la clave solo en el encabezado', async () => {
    const fetchMock = stubFetch(200, { status: 'completed', error: null, output: [] });
    await createResponse(openaiConfig(), input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const sent = JSON.parse(init.body as string);
    expect(sent).toMatchObject({
      model: 'gpt-6-luna',
      instructions: 'reglas',
      reasoning: { effort: 'low' },
      store: false,
      include: ['reasoning.encrypted_content'],
      max_output_tokens: 2000,
    });
    expect(sent).not.toHaveProperty('temperature');
    expect(init.body as string).not.toContain(KEY);

    expect(sent.tools.map((t: { name: string }) => t.name)).toEqual(TOOL_DECLARATIONS.map((d) => d.name));
    for (const tool of sent.tools) {
      expect(tool).toMatchObject({ type: 'function', strict: true, parameters: { type: 'object', additionalProperties: false } });
      // Strict mode: every declared property is required.
      expect([...tool.parameters.required].sort()).toEqual(Object.keys(tool.parameters.properties).sort());
    }
    expect(sent.tools.find((t: { name: string }) => t.name === 'propose_rsvp').parameters.required).toEqual(['status', 'companions']);
  });

  it.each([401, 403, 429, 500])('un %i responde 503 con el estado y sin el cuerpo ni la clave', async (status) => {
    stubFetch(status, { error: { message: `detalle interno ${KEY}` } });
    const err = await createResponse(openaiConfig(), input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).statusCode).toBe(503);
    expect((err as HttpError).message).toContain(String(status));
    expect((err as HttpError).message).not.toContain('detalle');
    expect((err as HttpError).message).not.toContain(KEY);
  });

  it('un timeout o fallo de red responde 503 sin detalle', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    }));
    const err = await createResponse(openaiConfig(), input).catch((e: unknown) => e);
    expect((err as HttpError).statusCode).toBe(503);
    expect((err as HttpError).message).toContain('no respondio');
  });

  it('un JSON ilegible responde 503', async () => {
    stubFetch(200, '{no es json');
    await expect(createResponse(openaiConfig(), input)).rejects.toMatchObject({ statusCode: 503 });
  });

  it('una respuesta fallida o con error responde 503', async () => {
    stubFetch(200, { status: 'failed', error: { code: 'server_error' }, output: [] });
    await expect(createResponse(openaiConfig(), input)).rejects.toMatchObject({ statusCode: 503 });
  });

  it('una respuesta incompleta no devuelve llamadas parciales', async () => {
    stubFetch(200, {
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [fnCall('call_1', 'prepare_quote')],
    });
    expect(await createResponse(openaiConfig(), input)).toEqual({ status: 'incomplete', items: [] });
  });

  it('una llamada mal formada invalida toda la respuesta', async () => {
    stubFetch(200, {
      status: 'completed',
      output: [fnCall('call_ok', 'get_my_status'), { type: 'function_call', name: 'prepare_quote', arguments: '{}' }],
    });
    await expect(createResponse(openaiConfig(), input)).rejects.toMatchObject({ statusCode: 503 });
  });

  it('conserva solo los campos del contrato', async () => {
    stubFetch(200, {
      status: 'completed',
      output: [
        { type: 'reasoning', id: 'rs_1', encrypted_content: 'enc', summary: [{ text: 'resumen' }], extra: 1 },
        { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'get_my_status', arguments: '{}', status: 'completed' },
        { type: 'web_search_call', id: 'ws_1' },
        { type: 'message', id: 'msg_1', role: 'assistant', content: [{ type: 'output_text', text: 'Hola', logprobs: [] }] },
      ],
    });
    const { items } = await createResponse(openaiConfig(), input);
    expect(items).toEqual([
      { type: 'reasoning', id: 'rs_1', encrypted_content: 'enc', summary: [] },
      { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'get_my_status', arguments: '{}' },
      { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Hola', annotations: [] }] },
    ]);
  });

  it('sin razonamiento cifrado descarta el razonamiento y el id de la llamada', () => {
    expect(
      sanitizeOutput([
        { type: 'reasoning', id: 'rs_1', summary: [] },
        { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'get_my_status', arguments: '{}' },
      ]),
    ).toEqual([{ type: 'function_call', call_id: 'call_1', name: 'get_my_status', arguments: '{}' }]);
  });
});

describe('bucle de herramientas con OpenAI (sin base de datos)', () => {
  function run(turns: RespondOutput[], config = openaiConfig()) {
    const script = scriptedOpenAI(turns);
    const executed: { name: string; args: unknown }[] = [];
    const persisted: StoredTurn[] = [];
    const execute = async (name: string, args: unknown): Promise<ToolOutcome> => {
      executed.push({ name, args });
      if (name === 'prepare_quote') return { response: { ok: true, a_pagar_centavos: 5000 }, actions: ['pay'] };
      return { response: { ok: true, herramienta: name } };
    };
    const history: StoredTurn[] = [{ role: 'user', parts: [{ text: 'Cuanto pago?' }] }];
    const result = converse(openaiAdapter(config, 'reglas', script.respond), history, execute, async (turn) => {
      persisted.push(structuredClone(turn));
    });
    return { result, inputs: script.inputs, executed, persisted };
  }

  it('encadena varias rondas devolviendo razonamiento y call_id en orden', async () => {
    const { result, inputs, executed, persisted } = run([
      completed(reasoning('rs_1', 'enc-1'), fnCall('call_a', 'get_my_status', '{}', 'fc_a')),
      completed(reasoning('rs_2', 'enc-2'), fnCall('call_b', 'prepare_quote', '{}', 'fc_b')),
      completed(message('Total $50,00. Confirmo?')),
    ]);
    const outcome = await result;
    expect(outcome.text).toBe('Total $50,00. Confirmo?');
    expect(outcome.actions).toEqual(['pay']);
    expect(executed.map((e) => e.name)).toEqual(['get_my_status', 'prepare_quote']);
    expect(persisted.map((t) => t.role)).toEqual(['model', 'function', 'model', 'function', 'model']);

    const third = inputs[2]!.input.map((item) => ('type' in item ? `${item.type}:${'call_id' in item ? item.call_id : 'id' in item ? item.id : ''}` : `${item.role}`));
    expect(third).toEqual([
      'user',
      'reasoning:rs_1',
      'function_call:call_a',
      'function_call_output:call_a',
      'reasoning:rs_2',
      'function_call:call_b',
      'function_call_output:call_b',
    ]);
    const quoteOutput = inputs[2]!.input[6] as { output: string };
    expect(JSON.parse(quoteOutput.output)).toEqual({ ok: true, a_pagar_centavos: 5000 });
  });

  it('no ejecuta argumentos ilegibles ni herramientas desconocidas, pero responde a cada call_id', async () => {
    const { result, inputs, executed } = run([
      completed(
        fnCall('call_1', 'propose_rsvp', '{"status":'),
        fnCall('call_2', 'propose_rsvp', '["yes",1]'),
        fnCall('call_3', 'transferir_dinero', '{"a":"otro"}'),
        fnCall('call_4', 'propose_rsvp', 'x'.repeat(3000)),
      ),
      completed(message('No puedo.')),
    ]);
    await result;
    expect(executed).toHaveLength(0);
    const outputs = inputs[1]!.input.flatMap((i) => ('type' in i && i.type === 'function_call_output' ? [i] : []));
    expect(outputs.map((o) => o.call_id)).toEqual(['call_1', 'call_2', 'call_3', 'call_4']);
    expect(outputs.every((o) => JSON.parse(o.output).ok === false)).toBe(true);
  });

  it('limita las llamadas ejecutadas por ronda', async () => {
    const calls = Array.from({ length: MAX_TOOL_CALLS_PER_ROUND + 2 }, (_, i) => fnCall(`call_${i}`, 'get_event_details'));
    const { result, inputs, executed } = run([completed(...calls), completed(message('ok'))]);
    await result;
    expect(executed).toHaveLength(MAX_TOOL_CALLS_PER_ROUND);
    const outputs = inputs[1]!.input.filter((i) => 'type' in i && i.type === 'function_call_output');
    expect(outputs).toHaveLength(MAX_TOOL_CALLS_PER_ROUND + 2);
  });

  it('corta el bucle en el limite de rondas', async () => {
    const config = openaiConfig({ OPENAI_MAX_TOOL_ROUNDS: '2' });
    const { result, inputs, executed } = run([completed(fnCall('call_loop', 'get_event_details'))], config);
    expect((await result).text).toBe('');
    expect(inputs).toHaveLength(3);
    expect(executed).toHaveLength(2);
  });

  it('una ronda incompleta no ejecuta ni guarda nada', async () => {
    const { result, executed, persisted } = run([{ status: 'incomplete', items: [] }]);
    expect((await result).text).toBe('');
    expect(executed).toHaveLength(0);
    expect(persisted).toHaveLength(0);
  });

  it('un error del proveedor se propaga sin ejecutar herramientas', async () => {
    const executed: string[] = [];
    const failing = async (): Promise<RespondOutput> => {
      throw new HttpError(503, 'El asistente no esta disponible (proveedor respondio 429)');
    };
    await expect(
      converse(
        openaiAdapter(openaiConfig(), 'reglas', failing),
        [{ role: 'user', parts: [{ text: 'hola' }] }],
        async (name) => {
          executed.push(name);
          return { response: {} };
        },
        async () => {},
      ),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(executed).toHaveLength(0);
  });

  it('una negativa del dominio vuelve al modelo como informacion', async () => {
    const script = scriptedOpenAI([completed(fnCall('call_q', 'prepare_quote')), completed(message('Confirma primero.'))]);
    await converse(
      openaiAdapter(openaiConfig(), 'reglas', script.respond),
      [{ role: 'user', parts: [{ text: 'cotiza' }] }],
      async () => {
        throw new HttpError(410, 'La cotizacion vencio');
      },
      async () => {},
    );
    const output = script.inputs[1]!.input.find((i) => 'type' in i && i.type === 'function_call_output') as { output: string };
    expect(JSON.parse(output.output)).toEqual({ ok: false, motivo: 'La cotizacion vencio' });
  });
});

describe('historial legado y ventanas truncadas', () => {
  const oaModel = (...items: Parameters<typeof completed>): StoredTurn => ({ role: 'model', parts: items.map((openai) => ({ openai })) });
  const oaOutputs = (...ids: string[]): StoredTurn => ({
    role: 'function',
    parts: ids.map((id) => ({ openai: { type: 'function_call_output' as const, call_id: id, output: '{"ok":true}' } })),
  });

  it('no reenvia salidas huerfanas, llamadas sin respuesta ni firmas o cargas legadas', () => {
    const turns: StoredTurn[] = [
      // Window truncated right after a model turn: this output has no call.
      oaOutputs('call_lost'),
      { role: 'user', parts: [{ text: 'hola' }] },
      { role: 'model', parts: [{ functionCall: { id: 'g1', name: 'get_event_details', args: {} }, thoughtSignature: 'firma' }] },
      { role: 'function', parts: [{ functionResponse: { id: 'g1', name: 'get_event_details', response: { ok: true } } }] },
      { role: 'model', parts: [{ text: 'Es un almuerzo.', thoughtSignature: 'firma-2' }] },
      { role: 'user', parts: [{ text: 'cotiza' }] },
      // Round limit hit: calls persisted without outputs.
      oaModel(reasoning('rs_x', 'enc-x'), fnCall('call_unanswered', 'prepare_quote'), message('Un momento.')),
      { role: 'user', parts: [{ text: 'y ahora?' }] },
      oaModel(reasoning('rs_ok', 'enc-ok'), fnCall('call_ok', 'get_my_status')),
      oaOutputs('call_ok', 'call_extra'),
    ];
    const input = toOpenAIInput(turns);
    const json = JSON.stringify(input);
    expect(json).not.toContain('firma');
    expect(json).not.toContain('functionCall');
    expect(json).not.toContain('call_lost');
    expect(json).not.toContain('call_unanswered');
    expect(json).not.toContain('enc-x');
    expect(json).not.toContain('call_extra');
    expect(input).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'Es un almuerzo.' },
      { role: 'user', content: 'cotiza' },
      { role: 'assistant', content: 'Un momento.' },
      { role: 'user', content: 'y ahora?' },
      reasoning('rs_ok', 'enc-ok'),
      fnCall('call_ok', 'get_my_status'),
      { type: 'function_call_output', call_id: 'call_ok', output: '{"ok":true}' },
    ]);
  });
});
