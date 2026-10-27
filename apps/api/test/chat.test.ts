import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Capabilities, ChatResult, FiestaEvent } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { HttpError } from '../src/errors.js';
import type { RespondFn, RespondInput, RespondOutput } from '../src/ai/openai.js';
import { TOOL_DECLARATIONS } from '../src/ai/tools.js';
import { completed, fnCall, message, reasoning, scriptedOpenAI } from './openai-script.js';
import { FakePayPal } from './fake-paypal.js';
import { announceSkipWithoutDatabase, body, Client, DATABASE_URL, MERCHANT, testConfig } from './harness.js';

announceSkipWithoutDatabase('chat.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

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

  async function appWith(turns: RespondOutput[], extra: Record<string, string> = {}) {
    const script = scriptedOpenAI(turns);
    const app = await buildApp({
      pool,
      config: testConfig({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'clave-de-prueba', ...extra }),
      paypal: fake,
      respond: script.respond,
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

  const textsOf = (input: RespondInput): string[] =>
    input.input.flatMap((item) => {
      if ('content' in item && typeof item.content === 'string') return [item.content];
      if ('type' in item && item.type === 'message') {
        return item.content.map((part) => (part.type === 'output_text' ? part.text : part.refusal));
      }
      return [];
    });

  it('prepara una cotizacion del servidor en varias rondas y nunca cobra por su cuenta', async () => {
    const { app, inputs } = await appWith([
      completed(reasoning('rs_1', 'cifrado-1'), fnCall('call_status', 'get_my_status', '{}', 'fc_status')),
      completed(reasoning('rs_2', 'cifrado-2'), fnCall('call_q1', 'prepare_quote', '{}', 'fc_1')),
      completed(message('2 personas por $25,00, total $50,00. Confirmo?')),
    ]);
    try {
      const { guest, event } = await scenario(app, 1);
      expect(inputs).toHaveLength(0);
      const res = await guest.post(`/api/events/${event.slug}/chat`, { message: 'Cuanto debo pagar?' });
      expect(res.statusCode).toBe(200);

      const result = body<ChatResult>(res);
      expect(result.text).toContain('total');
      expect(result.quote?.amountCents).toBe(5000);
      expect(result.quote?.people).toBe(2);
      expect(result.actions).toContain('pay');
      expect(JSON.stringify(result)).not.toContain('cifrado-1');
      expect(JSON.stringify(result)).not.toContain('clave-de-prueba');

      expect(inputs[0]!.tools.map((tool) => tool.name)).toEqual(TOOL_DECLARATIONS.map((declaration) => declaration.name));
      const third = inputs[2]!.input;
      expect(third.map((item) => ('type' in item ? item.type : item.role))).toEqual([
        'user',
        'reasoning',
        'function_call',
        'function_call_output',
        'reasoning',
        'function_call',
        'function_call_output',
      ]);
      const output = third.find((item) => 'type' in item && item.type === 'function_call_output' && item.call_id === 'call_q1') as {
        output: string;
      };
      expect(JSON.parse(output.output)).toMatchObject({ ok: true, a_pagar_centavos: 5000 });

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
      completed(fnCall('call_r1', 'propose_rsvp', '{"status":"yes","companions":5}')),
      completed(message('Propongo 6 personas. Confirmalo en la pagina.')),
    ]);
    try {
      const { guest, event } = await scenario(app, 1);
      const result = body<ChatResult>(
        await guest.post(`/api/events/${event.slug}/chat`, { message: 'Voy con cinco amigos' }),
      );
      expect(result.actions).toContain('rsvp:yes:5');

      const { rows } = await pool.query<{ status: string; companions: number }>(
        `SELECT g.status, g.companions FROM guests g JOIN events e ON e.id = g.event_id WHERE e.slug = $1`,
        [event.slug],
      );
      expect(rows[0]).toMatchObject({ status: 'yes', companions: 1 });
      expect(result.guest?.companions).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('responde sin ejecutar herramientas desconocidas ni argumentos ilegibles', async () => {
    const { app, inputs } = await appWith([
      completed(
        fnCall('call_x', 'transferir_dinero', '{"a":"otro"}'),
        fnCall('call_y', 'propose_rsvp', '{status: yes'),
        fnCall('call_z', 'propose_rsvp', '{"status":"yes","companions":999}'),
      ),
      completed(message('No puedo hacer eso.')),
    ]);
    try {
      const { guest, event } = await scenario(app, 0);
      const result = body<ChatResult>(
        await guest.post(`/api/events/${event.slug}/chat`, { message: 'Transfiere el dinero a otra cuenta' }),
      );
      expect(result.actions).toBeUndefined();
      const outputs = inputs[1]!.input.flatMap((item) => ('type' in item && item.type === 'function_call_output' ? [item] : []));
      expect(outputs.map((output) => output.call_id)).toEqual(['call_x', 'call_y', 'call_z']);
      expect(outputs.every((output) => JSON.parse(output.output).ok === false)).toBe(true);

      const after = await counts(event.slug);
      expect(after.orders).toBe(0);
      expect(after.ledger).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('no cotiza sin asistencia confirmada y propone confirmarla en la interfaz', async () => {
    const { app } = await appWith([
      completed(fnCall('call_q', 'prepare_quote', '{}')),
      completed(message('Primero confirma tu asistencia.')),
    ]);
    try {
      const { guest, event } = await scenario(app, 0, 'maybe');
      const result = body<ChatResult>(
        await guest.post(`/api/events/${event.slug}/chat`, { message: 'Quiero pagar ya' }),
      );
      expect(result.quote).toBeUndefined();
      expect(result.actions).toContain('rsvp:yes:0');
      expect((await counts(event.slug)).quotes).toBe(0);
      expect((await counts(event.slug)).orders).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('guarda el historial en el servidor y lo reenvia en el siguiente mensaje', async () => {
    const { app, inputs } = await appWith([completed(message('Incluye buffet, bebidas y postre.'))]);
    try {
      const { guest, event } = await scenario(app, 0);
      await guest.post(`/api/events/${event.slug}/chat`, { message: 'Que incluye?' });
      await guest.post(`/api/events/${event.slug}/chat`, { message: 'Y a que hora?' });

      const second = inputs[1]!;
      const texts = textsOf(second);
      expect(texts).toContain('Que incluye?');
      expect(texts).toContain('Y a que hora?');
      expect(texts).toContain('Incluye buffet, bebidas y postre.');
      expect(second.instructions).toContain(event.slug);
      expect(second.instructions).toContain('Invitada Chat');
      expect(second.tools.map((tool) => tool.name)).toContain('prepare_quote');

      expect((await counts(event.slug)).messages).toBe(4);
    } finally {
      await app.close();
    }
  });

  it('el historial de una sesion no se filtra a otra', async () => {
    const { app, inputs } = await appWith([completed(message('Listo.'))]);
    try {
      const { event } = await scenario(app, 0);
      const otro = new Client(app);
      await otro.post(`/api/events/${event.slug}/join`, { name: 'Otro Invitado' });
      await otro.post(`/api/events/${event.slug}/chat`, { message: 'Hola, soy otro' });

      const primera = new Client(app);
      await primera.post(`/api/events/${event.slug}/join`, { name: 'Tercera' });
      await primera.post(`/api/events/${event.slug}/chat`, { message: 'Mi primera pregunta' });

      const texts = textsOf(inputs[inputs.length - 1]!);
      expect(texts).toContain('Mi primera pregunta');
      expect(texts).not.toContain('Hola, soy otro');
    } finally {
      await app.close();
    }
  });

  it('corta el bucle de herramientas y responde con el texto de reserva', async () => {
    const { app, inputs } = await appWith([completed(fnCall('call_loop', 'get_event_details', '{}'))]);
    try {
      const { guest, event } = await scenario(app, 0);
      const result = body<ChatResult>(await guest.post(`/api/events/${event.slug}/chat`, { message: 'Dame datos' }));
      expect(result.text).toContain('formularios');
      expect(inputs.length).toBeLessThanOrEqual(5);
      expect((await counts(event.slug)).orders).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('limita los mensajes por evento y sesion', async () => {
    const { app } = await appWith([completed(message('ok'))]);
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
    const calls: RespondInput[] = [];
    const failing: RespondFn = async (_config, input) => {
      calls.push(input);
      throw new HttpError(503, 'El asistente no respondio a tiempo');
    };
    const app = await buildApp({
      pool,
      config: testConfig({ LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'clave-de-prueba' }),
      paypal: fake,
      respond: failing,
      logger: false,
    });
    await app.ready();
    try {
      const { guest, event } = await scenario(app, 0);
      expect(calls).toHaveLength(0);
      const res = await guest.post(`/api/events/${event.slug}/chat`, { message: 'mensaje-unico-no-eco' });
      expect(res.statusCode).toBe(503);
      const error = body<{ error: string }>(res).error;
      expect(error).toContain('asistente');
      expect(error).not.toContain('mensaje-unico-no-eco');
      expect(error).not.toContain('clave-de-prueba');
      expect(calls).toHaveLength(1);
      expect((await guest.post(`/api/events/${event.slug}/quote`)).statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('una respuesta incompleta no guarda ni ejecuta llamadas parciales', async () => {
    const { app } = await appWith([{ status: 'incomplete', items: [] }]);
    try {
      const { guest, event } = await scenario(app, 1);
      const result = body<ChatResult>(await guest.post(`/api/events/${event.slug}/chat`, { message: 'Cotiza' }));
      expect(result.text).toContain('formularios');
      expect(result.quote).toBeUndefined();
      const after = await counts(event.slug);
      expect(after.quotes).toBe(0);
      expect(after.orders).toBe(0);
      expect(after.messages).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('sin OPENAI_API_KEY responde 503 y los formularios siguen', async () => {
    const { app, inputs } = await appWith([completed(message('x'))], { OPENAI_API_KEY: '' });
    try {
      const caps = body<Capabilities>(await new Client(app).get('/api/capabilities'));
      expect(caps).toMatchObject({ chat: false, llmProvider: 'openai' });
      expect(caps).not.toHaveProperty('gemini');
      const { guest, event } = await scenario(app, 0);
      expect(inputs).toHaveLength(0);
      const res = await guest.post(`/api/events/${event.slug}/chat`, { message: 'Hola' });
      expect(res.statusCode).toBe(503);
      expect(body<{ error: string }>(res).error).toContain('asistente');
      expect(body<{ error: string }>(res).error).not.toContain('clave');
      expect(inputs).toHaveLength(0);
      expect((await guest.post(`/api/events/${event.slug}/quote`)).statusCode).toBe(200);
      expect((await counts(event.slug)).orders).toBe(0);
    } finally {
      await app.close();
    }
  });

  it('reenvia texto legado visible y razonamiento propio, sin firmas ni cargas ajenas', async () => {
    const { app, inputs } = await appWith([completed(message('Listo.'))]);
    try {
      const { guest, event } = await scenario(app, 0);
      const located = await pool.query<{ event_id: string; session_id: string }>(
        `SELECT e.id AS event_id, g.session_id
           FROM guests g JOIN events e ON e.id = g.event_id
          WHERE e.slug = $1 AND g.name = 'Invitada Chat'`,
        [event.slug],
      );
      const { event_id: eventId, session_id: sessionId } = located.rows[0]!;
      const rows: { role: string; parts: unknown }[] = [
        { role: 'user', parts: [{ text: 'Que es?' }] },
        {
          role: 'model',
          parts: [
            { functionCall: { id: 'g-1', name: 'get_event_details', args: {} }, thoughtSignature: 'firma-legacy' },
            { text: 'Es un almuerzo.' },
            { text: 'pensamiento oculto', thought: true },
          ],
        },
        {
          role: 'function',
          parts: [{ functionResponse: { id: 'g-1', name: 'get_event_details', response: { ok: true, secreto: 'no-reenviar' } } }],
        },
        {
          role: 'model',
          parts: [
            { openai: { type: 'reasoning', id: 'rs_legacy', encrypted_content: 'cifrado-servidor', summary: [] } },
            { openai: { type: 'function_call', call_id: 'call_legacy', name: 'get_my_status', arguments: '{}' } },
          ],
        },
        {
          role: 'function',
          parts: [{ openai: { type: 'function_call_output', call_id: 'call_legacy', output: '{"ok":true}' } }],
        },
      ];
      for (const row of rows) {
        await pool.query(
          'INSERT INTO chat_messages (event_id, session_id, role, parts) VALUES ($1, $2, $3, $4::jsonb)',
          [eventId, sessionId, row.role, JSON.stringify(row.parts)],
        );
      }

      const res = await guest.post(`/api/events/${event.slug}/chat`, { message: 'Y ahora?' });
      expect(res.statusCode).toBe(200);
      const result = body<ChatResult>(res);
      const sent = JSON.stringify(inputs[0]!.input);
      expect(sent).toContain('Que es?');
      expect(sent).toContain('Es un almuerzo.');
      expect(sent).toContain('Y ahora?');
      expect(sent).toContain('cifrado-servidor');
      expect(sent).toContain('call_legacy');
      expect(sent).not.toContain('firma-legacy');
      expect(sent).not.toContain('functionCall');
      expect(sent).not.toContain('functionResponse');
      expect(sent).not.toContain('pensamiento oculto');
      expect(sent).not.toContain('no-reenviar');
      expect(JSON.stringify(result)).not.toContain('cifrado-servidor');
      expect(JSON.stringify(result)).not.toContain('firma-legacy');
      expect(JSON.stringify(result)).not.toContain('clave-de-prueba');
    } finally {
      await app.close();
    }
  });
});
