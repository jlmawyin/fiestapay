import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Capabilities, ChatResult, FiestaEvent } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import type { GenerateFn, GenerateInput, GenerateOutput, GeminiPart } from '../src/ai/gemini.js';
import type { RespondOutput } from '../src/ai/openai.js';
import { TOOL_DECLARATIONS } from '../src/ai/tools.js';
import { completed, fnCall, message, reasoning, scriptedOpenAI } from './openai-script.js';
import { FakePayPal } from './fake-paypal.js';
import { announceSkipWithoutDatabase, body, Client, DATABASE_URL, MERCHANT, testConfig } from './harness.js';

announceSkipWithoutDatabase('chat.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

const call = (name: string, args: Record<string, unknown> = {}): GenerateOutput => ({
  parts: [{ functionCall: { name, args } }],
  finishReason: 'STOP',
});

const say = (text: string): GenerateOutput => ({ parts: [{ text }], finishReason: 'STOP' });

/** Scripted model: returns the queued turns in order, repeating the last one. */
function scripted(turns: GenerateOutput[]): { generate: GenerateFn; inputs: GenerateInput[] } {
  const inputs: GenerateInput[] = [];
  let index = 0;
  const generate: GenerateFn = async (_config, input) => {
    inputs.push(input);
    const turn = turns[Math.min(index, turns.length - 1)]!;
    index += 1;
    return turn;
  };
  return { generate, inputs };
}

const functionResponses = (input: GenerateInput): Record<string, unknown>[] =>
  input.history
    .filter((turn) => turn.role === 'function')
    .flatMap((turn) => turn.parts)
    .flatMap((part: GeminiPart) => (part.functionResponse ? [part.functionResponse.response] : []));

describeDb('Asistente de texto con herramientas nativas', () => {
  const schema = `fp_chat_${randomBytes(5).toString('hex')}`;
  let pool: Pool;
  let adminPool: Pool;
  let fake: FakePayPal;

  beforeAll(async () => {
    pool = createPool({ connectionString: DATABASE_URL!, schema });
    adminPool = createPool({ connectionString: DATABASE_URL!, max: 2 });
    await migrate(pool, { schema });
    fake = new FakePayPal(MERCHANT);
  });

  afterAll(async () => {
    await pool?.end();
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await adminPool.end();
    }
  });

  /** App with the assistant configured and a scripted model instead of the HTTP call. */
  async function appWith(turns: GenerateOutput[]) {
    const script = scripted(turns);
    const app = await buildApp({
      pool,
      config: testConfig({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'clave-de-prueba', GEMINI_MODEL: 'modelo-de-prueba' }),
      paypal: fake,
      generate: script.generate,
      logger: false,
    });
    await app.ready();
    return { app, inputs: script.inputs };
  }

  async function scenario(app: FastifyInstance, companions: number, status: 'yes' | 'maybe' = 'yes') {
    const organizer = new Client(app);
    const { event } = body<{ event: FiestaEvent }>(await organizer.post('/api/demo'));
    const guest = new Client(app);
    await guest.post(`/api/events/${event.slug}/join`, { name: 'Invitada Chat' });
    await guest.post(`/api/events/${event.slug}/rsvp`, { status, companions });
    return { organizer, guest, event };
  }

  async function counts(eventSlug: string) {
    const { rows } = await pool.query<{ orders: number; ledger: number; quotes: number; messages: number }>(
      `SELECT
         (SELECT COUNT(*)::int FROM orders o JOIN events e ON e.id = o.event_id WHERE e.slug = $1) AS orders,
         (SELECT COUNT(*)::int FROM payment_ledger l JOIN events e ON e.id = l.event_id WHERE e.slug = $1) AS ledger,
         (SELECT COUNT(*)::int FROM quotes q JOIN events e ON e.id = q.event_id WHERE e.slug = $1) AS quotes,
         (SELECT COUNT(*)::int FROM chat_messages c JOIN events e ON e.id = c.event_id WHERE e.slug = $1) AS messages`,
      [eventSlug],
    );
    return rows[0]!;
  }

  it('prepara una cotizacion del servidor y nunca cobra por su cuenta', async () => {
    const toolCall: GenerateOutput = {parts:[{functionCall:{id:'call-quote-1',name:'prepare_quote',args:{}},thoughtSignature:'opaque-test-signature'}],finishReason:'STOP'};
    const { app, inputs } = await appWith([toolCall, say('2 personas por $25,00, total $50,00. Confirmo?')]);
    try {
      const { guest, event } = await scenario(app, 1);
      const res = await guest.post(`/api/events/${event.slug}/chat`, { message: 'Cuanto debo pagar?' });
      expect(res.statusCode).toBe(200);

      const result = body<ChatResult>(res);
      expect(result.text).toContain('total');
      expect(result.quote?.amountCents).toBe(5000);
      expect(result.quote?.people).toBe(2);
      // The UI must still confirm: the action is a proposal, not a payment.
      expect(result.actions).toContain('pay');
      // Gemini 3 requires the call ID in the response and the original signed model part.
      expect(inputs[1]!.history.find(t => t.role === 'model')?.parts).toEqual(toolCall.parts);
      expect(inputs[1]!.history.find(t => t.role === 'function')?.parts[0]?.functionResponse?.id).toBe('call-quote-1');

      const after = await counts(event.slug);
      expect(after.quotes).toBe(1);
      expect(after.orders).toBe(0);
      expect(after.ledger).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('una propuesta de asistencia del modelo no cambia nada en la base', async () => {
    const { app } = await appWith([
      call('propose_rsvp', { status: 'yes', companions: 5 }),
      say('Propongo 6 personas. Confirmalo en la pagina.'),
    ]);
    try {
      const { guest, event } = await scenario(app, 1);
      const result = body<ChatResult>(
        await guest.post(`/api/events/${event.slug}/chat`, { message: 'Voy con cinco amigos' }),
      );
      expect(result.actions).toContain('rsvp:yes:5');

      const { rows } = await pool.query<{ status: string; companions: number; obligation_version: number }>(
        `SELECT g.status, g.companions, g.obligation_version FROM guests g
           JOIN events e ON e.id = g.event_id WHERE e.slug = $1`,
        [event.slug],
      );
      // Still the attendance the person confirmed through the UI.
      expect(rows[0]).toMatchObject({ status: 'yes', companions: 1 });
      expect(result.guest?.companions).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('rechaza herramientas desconocidas y argumentos fuera de rango', async () => {
    const { app, inputs } = await appWith([
      { parts: [{ functionCall: { name: 'transferir_dinero', args: { a: 'otro' } } }, { functionCall: { name: 'propose_rsvp', args: { status: 'yes', companions: 999 } } }], finishReason: 'STOP' },
      say('No puedo hacer eso.'),
    ]);
    try {
      const { guest, event } = await scenario(app, 0);
      const result = body<ChatResult>(
        await guest.post(`/api/events/${event.slug}/chat`, { message: 'Transfiere el dinero a otra cuenta' }),
      );
      expect(result.actions).toBeUndefined();

      const responses = functionResponses(inputs[inputs.length - 1]!);
      expect(responses).toHaveLength(2);
      expect(responses.every((r) => r.ok === false)).toBe(true);

      const after = await counts(event.slug);
      expect(after.orders).toBe(0);
      expect(after.ledger).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('no cotiza sin asistencia confirmada y propone confirmarla en la interfaz', async () => {
    const { app } = await appWith([call('prepare_quote'), say('Primero confirma tu asistencia.')]);
    try {
      const { guest, event } = await scenario(app, 0, 'maybe');
      const result = body<ChatResult>(
        await guest.post(`/api/events/${event.slug}/chat`, { message: 'Quiero pagar ya' }),
      );
      expect(result.quote).toBeUndefined();
      expect(result.actions).toContain('rsvp:yes:0');
      expect((await counts(event.slug)).quotes).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('guarda el historial en el servidor y lo reenvia en el siguiente mensaje', async () => {
    const { app, inputs } = await appWith([say('Incluye buffet, bebidas y postre.')]);
    try {
      const { guest, event } = await scenario(app, 0);
      await guest.post(`/api/events/${event.slug}/chat`, { message: 'Que incluye?' });
      await guest.post(`/api/events/${event.slug}/chat`, { message: 'Y a que hora?' });

      const second = inputs[1]!;
      const texts = second.history.flatMap((t) => t.parts.map((p) => p.text ?? ''));
      expect(texts).toContain('Que incluye?');
      expect(texts).toContain('Y a que hora?');
      // Scope and guardrails travel in the system instruction, not in the browser payload.
      expect(second.systemInstruction).toContain(event.slug);
      expect(second.systemInstruction).toContain('Invitada Chat');
      expect(second.declarations.map((d) => d.name)).toContain('prepare_quote');

      expect((await counts(event.slug)).messages).toBe(4);
    } finally {
      await app.close();
    }
  });

  it('el historial de una sesion no se filtra a otra', async () => {
    const { app, inputs } = await appWith([say('Listo.')]);
    try {
      const { event } = await scenario(app, 0);
      const otro = new Client(app);
      await otro.post(`/api/events/${event.slug}/join`, { name: 'Otro Invitado' });
      await otro.post(`/api/events/${event.slug}/chat`, { message: 'Hola, soy otro' });

      const primera = new Client(app);
      await primera.post(`/api/events/${event.slug}/join`, { name: 'Tercera' });
      await primera.post(`/api/events/${event.slug}/chat`, { message: 'Mi primera pregunta' });

      const ultima = inputs[inputs.length - 1]!;
      const texts = ultima.history.flatMap((t) => t.parts.map((p) => p.text ?? ''));
      expect(texts).toContain('Mi primera pregunta');
      expect(texts).not.toContain('Hola, soy otro');
    } finally {
      await app.close();
    }
  });

  it('corta el bucle de herramientas y responde con el texto de reserva', async () => {
    // A model that only ever calls tools must not loop forever.
    const { app, inputs } = await appWith([call('get_event_details')]);
    try {
      const { guest, event } = await scenario(app, 0);
      const result = body<ChatResult>(await guest.post(`/api/events/${event.slug}/chat`, { message: 'Dame datos' }));
      expect(result.text).toContain('formularios');
      expect(inputs.length).toBeLessThanOrEqual(5);
    } finally {
      await app.close();
    }
  });

  it('limita los mensajes por evento y sesion', async () => {
    const { app } = await appWith([say('ok')]);
    try {
      const { guest, event } = await scenario(app, 0);
      const { rows } = await pool.query<{ event_id: string }>('SELECT id AS event_id FROM events WHERE slug = $1', [
        event.slug,
      ]);
      const eventId = rows[0]!.event_id;
      const session = await pool.query<{ session_id: string }>(
        'SELECT session_id FROM guests WHERE event_id = $1 ORDER BY created_at DESC LIMIT 1',
        [eventId],
      );
      for (let i = 0; i < 60; i += 1) {
        await pool.query(
          `INSERT INTO chat_messages (event_id, session_id, role, parts) VALUES ($1,$2,'user','[]'::jsonb)`,
          [eventId, session.rows[0]!.session_id],
        );
      }
      const res = await guest.post(`/api/events/${event.slug}/chat`, { message: 'Uno mas' });
      expect(res.statusCode).toBe(429);
    } finally {
      await app.close();
    }
  });

  it('informa 503 cuando el proveedor falla y mantiene la demo usable', async () => {
    const failing: GenerateFn = async () => {
      throw new (await import('../src/errors.js')).HttpError(503, 'El asistente no respondio a tiempo');
    };
    const app = await buildApp({
      pool,
      config: testConfig({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'clave-de-prueba' }),
      paypal: fake,
      generate: failing,
      logger: false,
    });
    await app.ready();
    try {
      const { guest, event } = await scenario(app, 0);
      const res = await guest.post(`/api/events/${event.slug}/chat`, { message: 'Hola' });
      expect(res.statusCode).toBe(503);
      expect(body<{ error: string }>(res).error).toContain('asistente');

      // Forms keep working without the assistant.
      expect((await guest.post(`/api/events/${event.slug}/quote`)).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  describe('con OpenAI seleccionado', () => {
    async function openaiAppWith(turns: RespondOutput[], extra: Record<string, string> = {}) {
      const script = scriptedOpenAI(turns);
      const geminiCalls: GenerateInput[] = [];
      const app = await buildApp({
        pool,
        config: testConfig({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'clave-de-prueba', ...extra }),
        paypal: fake,
        respond: script.respond,
        // Present only to prove it is never used while OpenAI is selected.
        generate: async (_config, input) => {
          geminiCalls.push(input);
          return say('no deberia llamarse');
        },
        logger: false,
      });
      await app.ready();
      return { app, inputs: script.inputs, geminiCalls };
    }

    it('prepara la misma cotizacion del servidor y conserva razonamiento y call_id', async () => {
      const { app, inputs, geminiCalls } = await openaiAppWith([
        completed(reasoning('rs_1', 'cifrado-1'), fnCall('call_q1', 'prepare_quote', '{}', 'fc_1')),
        completed(message('2 personas por $25,00, total $50,00. Confirmo?')),
      ]);
      try {
        const { guest, event } = await scenario(app, 1);
        const result = body<ChatResult>(await guest.post(`/api/events/${event.slug}/chat`, { message: 'Cuanto debo pagar?' }));
        expect(result.quote?.amountCents).toBe(5000);
        expect(result.quote?.people).toBe(2);
        expect(result.actions).toContain('pay');
        expect(result.text).toContain('total');

        expect(inputs[0]!.tools.map((t) => t.name)).toEqual(TOOL_DECLARATIONS.map((d) => d.name));
        const second = inputs[1]!.input;
        const reasoningAt = second.findIndex((i) => 'type' in i && i.type === 'reasoning');
        const callAt = second.findIndex((i) => 'type' in i && i.type === 'function_call');
        const outputAt = second.findIndex((i) => 'type' in i && i.type === 'function_call_output');
        expect(second[reasoningAt]).toMatchObject({ id: 'rs_1', encrypted_content: 'cifrado-1' });
        expect(reasoningAt).toBeLessThan(callAt);
        expect(callAt).toBeLessThan(outputAt);
        const output = second[outputAt] as { call_id: string; output: string };
        expect(output.call_id).toBe('call_q1');
        expect(JSON.parse(output.output)).toMatchObject({ ok: true, a_pagar_centavos: 5000 });
        expect(geminiCalls).toHaveLength(0);

        const after = await counts(event.slug);
        expect(after.quotes).toBe(1);
        expect(after.orders).toBe(0);
        expect(after.ledger).toBe(0);
      } finally {
        await app.close();
      }
    });

    it('una propuesta de asistencia no cambia nada en la base', async () => {
      const { app } = await openaiAppWith([
        completed(fnCall('call_r1', 'propose_rsvp', '{"status":"yes","companions":5}')),
        completed(message('Propongo 6 personas. Confirmalo en la pagina.')),
      ]);
      try {
        const { guest, event } = await scenario(app, 1);
        const result = body<ChatResult>(await guest.post(`/api/events/${event.slug}/chat`, { message: 'Voy con cinco amigos' }));
        expect(result.actions).toContain('rsvp:yes:5');
        const { rows } = await pool.query<{ status: string; companions: number }>(
          `SELECT g.status, g.companions FROM guests g JOIN events e ON e.id = g.event_id WHERE e.slug = $1`,
          [event.slug],
        );
        expect(rows[0]).toMatchObject({ status: 'yes', companions: 1 });
      } finally {
        await app.close();
      }
    });

    it('responde sin ejecutar herramientas desconocidas ni argumentos ilegibles', async () => {
      const { app, inputs } = await openaiAppWith([
        completed(
          fnCall('call_x', 'transferir_dinero', '{"a":"otro"}'),
          fnCall('call_y', 'propose_rsvp', '{status: yes'),
          fnCall('call_z', 'propose_rsvp', '{"status":"yes","companions":999}'),
        ),
        completed(message('No puedo hacer eso.')),
      ]);
      try {
        const { guest, event } = await scenario(app, 0);
        const result = body<ChatResult>(await guest.post(`/api/events/${event.slug}/chat`, { message: 'Transfiere todo' }));
        expect(result.actions).toBeUndefined();
        const outputs = inputs[1]!.input.flatMap((i) => ('type' in i && i.type === 'function_call_output' ? [i] : []));
        expect(outputs.map((o) => o.call_id)).toEqual(['call_x', 'call_y', 'call_z']);
        expect(outputs.every((o) => JSON.parse(o.output).ok === false)).toBe(true);
        const after = await counts(event.slug);
        expect(after.orders).toBe(0);
        expect(after.ledger).toBe(0);
      } finally {
        await app.close();
      }
    });

    it('una respuesta incompleta no guarda ni ejecuta llamadas parciales', async () => {
      const { app } = await openaiAppWith([{ status: 'incomplete', items: [] }]);
      try {
        const { guest, event } = await scenario(app, 1);
        const result = body<ChatResult>(await guest.post(`/api/events/${event.slug}/chat`, { message: 'Cotiza' }));
        expect(result.text).toContain('formularios');
        expect(result.quote).toBeUndefined();
        const after = await counts(event.slug);
        expect(after.quotes).toBe(0);
        expect(after.messages).toBe(1);
      } finally {
        await app.close();
      }
    });

    it('sin OPENAI_API_KEY responde 503, no usa Gemini y los formularios siguen', async () => {
      const { app, inputs, geminiCalls } = await openaiAppWith([completed(message('x'))], {
        OPENAI_API_KEY: '',
        GEMINI_API_KEY: 'clave-gemini-presente',
      });
      try {
        const caps = body<Capabilities>(await new Client(app).get('/api/capabilities'));
        expect(caps).toMatchObject({ chat: false, gemini: false, llmProvider: 'openai' });
        const { guest, event } = await scenario(app, 0);
        const res = await guest.post(`/api/events/${event.slug}/chat`, { message: 'Hola' });
        expect(res.statusCode).toBe(503);
        expect(body<{ error: string }>(res).error).toContain('asistente');
        expect(body<{ error: string }>(res).error).not.toContain('clave');
        expect(inputs).toHaveLength(0);
        expect(geminiCalls).toHaveLength(0);
        expect((await guest.post(`/api/events/${event.slug}/quote`)).statusCode).toBe(200);
      } finally {
        await app.close();
      }
    });

    it('cambiar de proveedor reutiliza el historial sin firmas ni salidas ajenas', async () => {
      const geminiCall: GenerateOutput = {
        parts: [{ functionCall: { id: 'g-1', name: 'get_event_details', args: {} }, thoughtSignature: 'firma-gemini' }],
        finishReason: 'STOP',
      };
      const gem = await appWith([geminiCall, say('Es un almuerzo.')]);
      const oai = await openaiAppWith([
        completed(reasoning('rs_9', 'cifrado-9'), fnCall('call_9', 'get_my_status', '{}')),
        completed(message('Estas confirmada.')),
      ]);
      const back = await appWith([say('Sigo aqui.')]);
      try {
        const { guest, event } = await scenario(gem.app, 0);
        await guest.post(`/api/events/${event.slug}/chat`, { message: 'Que es?' });

        const viaOpenAI = new Client(oai.app);
        viaOpenAI.cookie = guest.cookie;
        expect((await viaOpenAI.post(`/api/events/${event.slug}/chat`, { message: 'Y mi estado?' })).statusCode).toBe(200);
        const first = JSON.stringify(oai.inputs[0]!.input);
        expect(first).not.toContain('firma-gemini');
        expect(first).not.toContain('functionCall');
        expect(first).not.toContain('function_call_output');
        expect(oai.inputs[0]!.input).toContainEqual({ role: 'assistant', content: 'Es un almuerzo.' });

        const viaGemini = new Client(back.app);
        viaGemini.cookie = guest.cookie;
        expect((await viaGemini.post(`/api/events/${event.slug}/chat`, { message: 'Gracias' })).statusCode).toBe(200);
        const contents = back.inputs[0]!.history;
        expect(JSON.stringify(contents)).not.toContain('cifrado-9');
        expect(JSON.stringify(contents)).not.toContain('call_9');
        expect(contents).toContainEqual({ role: 'model', parts: [{ text: 'Estas confirmada.' }] });
        // Gemini's own signed turn still replays verbatim.
        expect(contents.find((t) => t.role === 'model')?.parts).toEqual(geminiCall.parts);
      } finally {
        await gem.app.close();
        await oai.app.close();
        await back.app.close();
      }
    });
  });
});
