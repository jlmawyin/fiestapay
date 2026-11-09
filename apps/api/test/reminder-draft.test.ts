import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatMoney, type CreatedEvent, type FiestaEvent, type ReminderDraftResult } from '@fiestapay/shared';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import type { RespondFn, RespondInput, RespondOutput } from '../src/ai/openai.js';
import { completed, message, scriptedOpenAI } from './openai-script.js';
import { FakePayPal } from './fake-paypal.js';
import {
  announceSkipWithoutDatabase,
  body,
  Client,
  DATABASE_URL,
  MERCHANT,
  ORIGIN,
  testConfig,
} from './harness.js';

announceSkipWithoutDatabase('reminder-draft.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

const answerMessages = (messages: string[]): RespondOutput =>
  completed(message(JSON.stringify({ messages })));

function eventInput(title: string) {
  const start = new Date(Date.now() + 7 * 86_400_000);
  const end = new Date(start.getTime() + 3 * 3_600_000);
  return {
    title,
    template: 'comida',
    meal: 'cena',
    description: 'Encuentro de prueba',
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    location: 'Quito',
    includes: ['Cena'],
    priceCents: 2500,
    capacity: 40,
    goalCents: null,
    minimumCents: null,
    agenda: [],
  };
}

describeDb('borradores de recordatorio', () => {
  const schema = `fp_remind_${randomBytes(5).toString('hex')}`;
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

  async function withApp(
    fn: (app: FastifyInstance, inputs: RespondInput[]) => Promise<void>,
    options: { turns?: RespondOutput[]; respond?: RespondFn; env?: Record<string, string | undefined> } = {},
  ) {
    const script = scriptedOpenAI(options.turns ?? [answerMessages(['Todo listo.'])]);
    const respond: RespondFn = options.respond ?? ((config, input) => script.respond(config, input));
    const app = await buildApp({
      pool,
      config: testConfig({
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'clave-de-prueba',
        ...options.env,
      }),
      paypal: fake,
      respond,
      logger: false,
    });
    await app.ready();
    try {
      await fn(app, script.inputs);
    } finally {
      await app.close();
    }
  }

  async function organizer(
    app: FastifyInstance,
    title: string,
    locale?: 'es' | 'en',
  ): Promise<{ client: Client; event: FiestaEvent; key: string }> {
    const client = new Client(app, locale);
    const response = await client.post('/api/events', eventInput(title));
    expect(response.statusCode, response.body).toBe(200);
    const created = body<CreatedEvent>(response);
    expect(created.adminKey).toBeTruthy();
    client.authorize(created.event.slug, created.adminKey!);
    return { client, event: created.event, key: created.adminKey! };
  }

  async function eventIdOf(slug: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>('SELECT id FROM events WHERE slug = $1', [slug]);
    return rows[0]!.id;
  }

  async function seedGuest(
    eventId: string,
    name: string,
    status: 'yes' | 'no' | 'maybe',
    companions: number,
    paidCents: number,
    order = 0,
  ): Promise<string> {
    const sessionId = randomUUID();
    const guestId = randomUUID();
    await pool.query('INSERT INTO sessions (id, token_hash) VALUES ($1, $2)', [sessionId, randomBytes(32)]);
    await pool.query(
      `INSERT INTO guests (id, event_id, session_id, name, status, companions, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 * interval '1 millisecond'))`,
      [guestId, eventId, sessionId, name, status, companions, order],
    );
    if (paidCents > 0) {
      const quoteId = randomUUID();
      const orderId = randomUUID();
      const captureId = `CAP-${guestId.slice(0, 8)}`;
      const total = 2500 * (1 + companions);
      await pool.query(
        `INSERT INTO quotes (id, event_id, guest_id, obligation_version, people, unit_cents, total_cents,
           paid_cents, amount_cents, summary, expires_at)
         VALUES ($1,$2,$3,1,$4,2500,$5,$6,0,'pagado', now() + interval '1 day')`,
        [quoteId, eventId, guestId, 1 + companions, total, paidCents],
      );
      await pool.query(
        `INSERT INTO orders (id, event_id, guest_id, quote_id, obligation_version, request_id,
           paypal_order_id, amount_cents, payee_merchant_id, status, capture_id)
         VALUES ($1,$2,$3,$4,1,$5,$6,$7,$8,'paid',$9)`,
        [orderId, eventId, guestId, quoteId, `fp-${orderId}`, `ORD-${orderId}`, paidCents, MERCHANT, captureId],
      );
      await pool.query(
        `INSERT INTO payment_ledger (id, event_id, guest_id, order_id, kind, amount_cents, external_id, capture_id)
         VALUES ($1,$2,$3,$4,'capture',$5,$6,$6)`,
        [randomUUID(), eventId, guestId, orderId, paidCents, captureId],
      );
    }
    return guestId;
  }

  async function aiRequestCount(eventId: string): Promise<number> {
    const { rows } = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM ai_requests WHERE event_id = $1', [
      eventId,
    ]);
    return rows[0]!.n;
  }

  it('exige la clave del organizador: 403 sin clave o con la clave de otro evento', async () => {
    await withApp(async (app, inputs) => {
      const first = await organizer(app, 'Evento con clave');
      const second = await organizer(app, 'Otro evento');

      const noKey = await new Client(app).post(`/api/events/${first.event.slug}/reminders/draft`, { tone: 'amable' });
      expect(noKey.statusCode).toBe(403);

      const wrongKey = new Client(app);
      wrongKey.authorize(first.event.slug, second.key);
      const foreign = await wrongKey.post(`/api/events/${first.event.slug}/reminders/draft`, { tone: 'amable' });
      expect(foreign.statusCode).toBe(403);

      expect(inputs).toHaveLength(0);
      expect(await aiRequestCount(await eventIdOf(first.event.slug))).toBe(0);
    });
  });

  it('solo incluye invitados yes con saldo > 0 y usa importes y enlace del servidor', async () => {
    await withApp(
      async (app, inputs) => {
        const { client, event } = await organizer(app, 'Cena de vecinos');
        const eventId = await eventIdOf(event.slug);
        const owing = await seedGuest(eventId, 'Ana', 'yes', 0, 0, 1);
        const owingTwo = await seedGuest(eventId, 'Beto', 'yes', 1, 0, 2);
        await seedGuest(eventId, 'Carla', 'maybe', 0, 0, 3);
        await seedGuest(eventId, 'Diego', 'yes', 0, 2500, 4);

        const response = await client.post(`/api/events/${event.slug}/reminders/draft`, { tone: 'amable' });
        expect(response.statusCode, response.body).toBe(200);
        const result = body<ReminderDraftResult>(response);
        expect(result.source).toBe('ai');
        expect(result.truncated).toBe(false);
        expect(result.drafts.map((draft) => draft.guestId)).toEqual([owing, owingTwo]);

        const link = `${ORIGIN}/e/${event.slug}`;
        expect(result.drafts[0]).toEqual({
          guestId: owing,
          alias: 'Ana',
          dueCents: 2500,
          message: `Hola Ana: Espero que puedas acompañarnos pronto. Saldo pendiente: ${formatMoney(2500, 'es')}. Invitación: ${link}`,
        });
        expect(result.drafts[1]!.dueCents).toBe(5000);
        expect(result.drafts[1]!.message).toContain('Hola Beto:');
        expect(result.drafts[1]!.message).toContain(formatMoney(5000, 'es'));
        expect(result.drafts[1]!.message).toContain(link);

        expect(inputs).toHaveLength(1);
        expect(inputs[0]!.tools).toEqual([]);
        expect(await aiRequestCount(eventId)).toBe(1);
      },
      {
        turns: [
          answerMessages([
            'Espero que puedas acompañarnos pronto.',
            'Tu aporte hace la diferencia.',
          ]),
        ],
      },
    );
  });

  it('descarta cifras y enlaces de la IA y usa la plantilla por reglas', async () => {
    await withApp(
      async (app) => {
        const { client, event } = await organizer(app, 'Cumpleaños');
        const eventId = await eventIdOf(event.slug);
        const guestId = await seedGuest(eventId, 'Ana', 'yes', 0, 0, 1);

        const response = await client.post(`/api/events/${event.slug}/reminders/draft`, { tone: 'divertido' });
        expect(response.statusCode, response.body).toBe(200);
        const result = body<ReminderDraftResult>(response);
        expect(result.source).toBe('rules');
        expect(result.drafts).toHaveLength(1);
        expect(result.drafts[0]!.guestId).toBe(guestId);
        expect(result.drafts[0]!.dueCents).toBe(2500);
        expect(result.drafts[0]!.message).toContain(formatMoney(2500, 'es'));
        expect(result.drafts[0]!.message).toContain(`${ORIGIN}/e/${event.slug}`);
        expect(result.drafts[0]!.message).not.toContain('999');
        expect(result.drafts[0]!.message).not.toContain('evil');
        expect(result.drafts[0]!.message).toContain('¡Tu parte de la fiesta todavía te está esperando!');
      },
      { turns: [answerMessages(['Paga $999 en https://evil.example ahora'])] },
    );
  });

  it('limita a 20 invitados por llamada y marca truncated', async () => {
    await withApp(
      async (app) => {
        const { client, event } = await organizer(app, 'Evento grande');
        const eventId = await eventIdOf(event.slug);
        const ids: string[] = [];
        for (let index = 1; index <= 21; index += 1) {
          ids.push(await seedGuest(eventId, `G${String(index).padStart(2, '0')}`, 'yes', 0, 0, index));
        }

        const response = await client.post(`/api/events/${event.slug}/reminders/draft`, { tone: 'formal' });
        expect(response.statusCode, response.body).toBe(200);
        const result = body<ReminderDraftResult>(response);
        expect(result.truncated).toBe(true);
        expect(result.drafts).toHaveLength(20);
        expect(result.drafts.map((draft) => draft.guestId)).toEqual(ids.slice(0, 20));
        expect(result.source).toBe('rules');
        expect(await aiRequestCount(eventId)).toBe(1);
      },
      {
        respond: async () => {
          throw new Error('proveedor caido');
        },
      },
    );
  });

  it('responde en inglés y cae a la plantilla por tono cuando la IA falla', async () => {
    await withApp(
      async (app) => {
        const { client, event } = await organizer(app, 'Team dinner', 'en');
        const eventId = await eventIdOf(event.slug);
        const guestId = await seedGuest(eventId, 'Ann', 'yes', 0, 0, 1);

        const response = await client.post(`/api/events/${event.slug}/reminders/draft`, { tone: 'formal' });
        expect(response.statusCode, response.body).toBe(200);
        const result = body<ReminderDraftResult>(response);
        expect(result.source).toBe('rules');
        expect(result.drafts[0]).toEqual({
          guestId,
          alias: 'Ann',
          dueCents: 2500,
          message: `Hi Ann: We respectfully remind you that you have an outstanding balance. Balance due: ${formatMoney(2500, 'en')}. Invitation: ${ORIGIN}/e/${event.slug}`,
        });
      },
      {
        env: { OPENAI_API_KEY: undefined },
      },
    );
  });

  it('rechaza un tono fuera del contrato', async () => {
    await withApp(async (app) => {
      const { client, event } = await organizer(app, 'Evento');
      const response = await client.post(`/api/events/${event.slug}/reminders/draft`, { tone: 'grosero' });
      expect(response.statusCode).toBe(400);
      expect((await client.post(`/api/events/${event.slug}/reminders/draft`, { tone: 'amable', extra: true })).statusCode).toBe(400);
    });
  });
});
