import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { usd, type Capabilities, type Dashboard, type FiestaEvent, type Guest, type OrderResult, type Quote } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { runTool } from '../src/ai/tools.js';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { findGuestBySession, getEventBySlug } from '../src/domain/read.js';
import { FakePayPal } from './fake-paypal.js';
import {
  announceSkipWithoutDatabase,
  body,
  Client,
  DATABASE_URL,
  MERCHANT,
  testConfig,
} from './harness.js';

announceSkipWithoutDatabase('api.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb('API FiestaPay sobre PostgreSQL', () => {
  const schema = `fp_test_${randomBytes(5).toString('hex')}`;
  let pool: Pool;
  let adminPool: Pool;
  let app: FastifyInstance;
  let fake: FakePayPal;
  let webhookSeq = 0;

  const nextWebhookId = (): string => `WH-${++webhookSeq}-${randomBytes(3).toString('hex')}`;

  async function captureWebhook(client: Client, paypalOrderId: string, captureId: string) {
    return client.post('/api/paypal/webhook', {
      id: nextWebhookId(),
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      resource: {
        id: captureId,
        amount: { currency_code: 'USD', value: '50.00' },
        supplementary_data: { related_ids: { order_id: paypalOrderId } },
      },
    });
  }

  async function ledgerCount(kind: 'capture' | 'refund', orderId?: string): Promise<number> {
    const sql = orderId
      ? `SELECT COUNT(*)::int AS n FROM payment_ledger WHERE kind = $1 AND order_id = (
           SELECT id FROM orders WHERE paypal_order_id = $2
         )`
      : 'SELECT COUNT(*)::int AS n FROM payment_ledger WHERE kind = $1';
    const { rows } = await pool.query<{ n: number }>(sql, orderId ? [kind, orderId] : [kind]);
    return rows[0]?.n ?? 0;
  }

  /** Organizer with the seeded demo event (USD 25 per person, goal 100, minimum 50). */
  async function organizer(): Promise<{ client: Client; event: FiestaEvent }> {
    const client = new Client(app);
    const res = await client.post('/api/demo');
    expect(res.statusCode).toBe(200);
    return { client, event: body<{ event: FiestaEvent }>(res).event };
  }

  async function guestOn(slug: string, name: string, companions = 0): Promise<Client> {
    const client = new Client(app);
    const joined = await client.post(`/api/events/${slug}/join`, { name });
    expect(joined.statusCode).toBe(200);
    const rsvp = await client.post(`/api/events/${slug}/rsvp`, { status: 'yes', companions });
    expect(rsvp.statusCode).toBe(200);
    return client;
  }

  async function quoteAndOrder(client: Client, slug: string): Promise<OrderResult> {
    const quoteRes = await client.post(`/api/events/${slug}/quote`);
    expect(quoteRes.statusCode).toBe(200);
    const { quote } = body<{ quote: Quote }>(quoteRes);
    const orderRes = await client.post(`/api/events/${slug}/orders`, { quoteId: quote.id, confirmed: true });
    expect(orderRes.statusCode).toBe(200);
    return body<OrderResult>(orderRes);
  }

  beforeAll(async () => {
    pool = createPool({ connectionString: DATABASE_URL!, schema });
    adminPool = createPool({ connectionString: DATABASE_URL!, max: 2 });
    await migrate(pool, { schema });
    fake = new FakePayPal(MERCHANT);
    app = await buildApp({ pool, config: testConfig(), paypal: fake, logger: false });
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

  describe('salud y capacidades honestas', () => {
    it('responde health y capacidades reales del servidor', async () => {
      const health = await new Client(app).get('/api/health');
      expect(health.statusCode).toBe(200);
      expect(body(health)).toEqual({ ok: true });

      const caps = body<Capabilities>(await new Client(app).get('/api/capabilities'));
      expect(caps.paypal).toBe(true);
      expect(caps.paypalClientId).toBe('sandbox-client-id');
      expect(caps.sandbox).toBe(true);
      // No AI key and no voice routes in this server: both must report false.
      expect(caps.gemini).toBe(false);
      expect(caps.chat).toBe(false);
      expect(caps.llmProvider).toBe('openai');
      expect(caps.voice).toBe(false);
    });

    it('devuelve 404 JSON para rutas de API inexistentes', async () => {
      const res = await new Client(app).get('/api/no-existe');
      expect(res.statusCode).toBe(404);
      expect(body<{ error: string }>(res).error).toBeTruthy();
    });
  });

  describe('origen, sesiones y aislamiento', () => {
    it('rechaza mutaciones sin origen o con origen ajeno, incluida la creacion de sesion', async () => {
      const sinOrigen = await new Client(app).post('/api/demo', {}, null);
      expect(sinOrigen.statusCode).toBe(403);

      const otroOrigen = await new Client(app).post('/api/demo', {}, 'https://atacante.example');
      expect(otroOrigen.statusCode).toBe(403);
    });

    it('entrega una cookie de sesion HttpOnly y SameSite=Lax', async () => {
      const client = new Client(app);
      const res = await client.post('/api/demo');
      const cookie = res.cookies.find((c) => c.name === 'fp_session');
      expect(cookie?.httpOnly).toBe(true);
      expect(String(cookie?.sameSite).toLowerCase()).toBe('lax');
      // The cookie value is random; the database only stores its hash.
      const { rows } = await pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM sessions');
      expect(rows[0]!.n).toBeGreaterThan(0);
    });

    it('lista solo los eventos del organizador y nunca los de otra sesion', async () => {
      const a = await organizer();
      const b = await organizer();
      expect(a.event.slug).not.toBe(b.event.slug);

      const mine = body<{ events: FiestaEvent[] }>(await a.client.get('/api/events')).events;
      expect(mine.map((e) => e.slug)).toContain(a.event.slug);
      expect(mine.map((e) => e.slug)).not.toContain(b.event.slug);

      const anonymous = body<{ events: FiestaEvent[] }>(await new Client(app).get('/api/events')).events;
      expect(anonymous).toEqual([]);
    });

    it('la invitacion publica no expone al organizador ni a otros invitados', async () => {
      const { client: org, event } = await organizer();
      await guestOn(event.slug, 'Invitada Ana', 1);

      const stranger = new Client(app);
      const view = body<{ event: FiestaEvent; guest: Guest | null }>(await stranger.get(`/api/events/${event.slug}`));
      expect(view.event.slug).toBe(event.slug);
      expect(view.guest).toBeNull();
      expect(Object.keys(view)).toEqual(['event', 'guest']);
      expect(JSON.stringify(view.event)).not.toContain('organizer');
      expect(JSON.stringify(view.event)).not.toContain('Invitada Ana');

      // The organizer sees their own dashboard; nobody else does.
      expect((await org.get(`/api/events/${event.slug}/dashboard`)).statusCode).toBe(200);
      expect((await stranger.get(`/api/events/${event.slug}/dashboard`)).statusCode).toBe(403);
    });

    it('el invitado no gana autoridad de organizador al conocer el slug', async () => {
      const { event } = await organizer();
      const guest = await guestOn(event.slug, 'Invitado Beto');

      const denied = await guest.get(`/api/events/${event.slug}/dashboard`);
      expect(denied.statusCode).toBe(403);
      // Errors are always {error: string} and nothing else.
      expect(Object.keys(body<Record<string, unknown>>(denied))).toEqual(['error']);
      expect((await guest.post(`/api/events/${event.slug}/confirm`)).statusCode).toBe(403);
      const owned = body<{ events: FiestaEvent[] }>(await guest.get('/api/events')).events;
      expect(owned).toEqual([]);
    });
  });

  describe('asistencia y cupo atomico', () => {
    async function eventWithCapacity(capacity: number): Promise<{ client: Client; event: FiestaEvent }> {
      const client = new Client(app);
      const res = await client.post('/api/events', {
        title: 'Charla con cupo',
        template: 'evento',
        meal: 'cena',
        description: 'Cupo limitado',
        startsAt: '2026-11-20T23:00:00.000Z',
        endsAt: '2026-11-21T03:00:00.000Z',
        location: 'Auditorio demo',
        includes: ['Entrada'],
        priceCents: 2500,
        capacity,
        goalCents: null,
        minimumCents: null,
        agenda: [{ time: '18:00', title: 'Apertura', speaker: 'Equipo' }],
      });
      expect(res.statusCode).toBe(200);
      return { client, event: body<{ event: FiestaEvent }>(res).event };
    }

    it('cuenta acompanantes en el cupo y admite al grupo completo o a ninguno', async () => {
      const { client: org, event } = await eventWithCapacity(3);

      const ana = await guestOn(event.slug, 'Ana', 2); // 3 personas: cupo lleno
      const beto = new Client(app);
      await beto.post(`/api/events/${event.slug}/join`, { name: 'Beto' });

      const rechazado = await beto.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 0 });
      expect(rechazado.statusCode).toBe(409);

      let dash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
      expect(dash.event.confirmedPeople).toBe(3);

      // Ana frees two seats; Beto's group of three still does not fit, his group of two does.
      expect((await ana.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 0 })).statusCode).toBe(200);
      expect((await beto.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 2 })).statusCode).toBe(409);

      dash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
      expect(dash.event.confirmedPeople).toBe(1);

      expect((await beto.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 1 })).statusCode).toBe(200);
      dash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
      expect(dash.event.confirmedPeople).toBe(3);
    });

    it('dos invitados que piden la ultima plaza a la vez no exceden el cupo', async () => {
      const { client: org, event } = await eventWithCapacity(2);
      const uno = new Client(app);
      const dos = new Client(app);
      await uno.post(`/api/events/${event.slug}/join`, { name: 'Uno' });
      await dos.post(`/api/events/${event.slug}/join`, { name: 'Dos' });

      const [a, b] = await Promise.all([
        uno.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 1 }),
        dos.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 1 }),
      ]);
      const codes = [a.statusCode, b.statusCode].sort();
      expect(codes).toEqual([200, 409]);

      const dash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
      expect(dash.event.confirmedPeople).toBe(2);
    });

    it('exige unirse antes de responder la asistencia', async () => {
      const { event } = await eventWithCapacity(5);
      const res = await new Client(app).post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 0 });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('cotizaciones calculadas en el servidor', () => {
    it('cobra la cuota completa por titular y acompanante', async () => {
      const { event } = await organizer();
      const guest = await guestOn(event.slug, 'Carla', 2);
      const { quote } = body<{ quote: Quote }>(await guest.post(`/api/events/${event.slug}/quote`));
      expect(quote.people).toBe(3);
      expect(quote.unitCents).toBe(2500);
      expect(quote.totalCents).toBe(7500);
      expect(quote.amountCents).toBe(7500);
      expect(quote.summary).toContain('3 personas');
      expect(new Date(quote.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('no cotiza sin asistencia confirmada', async () => {
      const { event } = await organizer();
      const client = new Client(app);
      await client.post(`/api/events/${event.slug}/join`, { name: 'Dudoso' });
      await client.post(`/api/events/${event.slug}/rsvp`, { status: 'maybe', companions: 0 });
      expect((await client.post(`/api/events/${event.slug}/quote`)).statusCode).toBe(409);
    });

    it('un cambio de asistencia invalida la cotizacion anterior', async () => {
      const { event } = await organizer();
      const guest = await guestOn(event.slug, 'Dani', 1);
      const { quote } = body<{ quote: Quote }>(await guest.post(`/api/events/${event.slug}/quote`));

      await guest.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 0 });
      const res = await guest.post(`/api/events/${event.slug}/orders`, { quoteId: quote.id, confirmed: true });
      expect(res.statusCode).toBe(409);
    });

    it('una cotizacion vencida no puede crear una orden', async () => {
      const { event } = await organizer();
      const guest = await guestOn(event.slug, 'Elsa', 0);
      const { quote } = body<{ quote: Quote }>(await guest.post(`/api/events/${event.slug}/quote`));
      await pool.query("UPDATE quotes SET expires_at = now() - interval '1 minute' WHERE id = $1", [quote.id]);

      const res = await guest.post(`/api/events/${event.slug}/orders`, { quoteId: quote.id, confirmed: true });
      expect(res.statusCode).toBe(409);
    });

    it('exige la confirmacion explicita del cuerpo para crear la orden', async () => {
      const { event } = await organizer();
      const guest = await guestOn(event.slug, 'Fabi', 0);
      const { quote } = body<{ quote: Quote }>(await guest.post(`/api/events/${event.slug}/quote`));
      const res = await guest.post(`/api/events/${event.slug}/orders`, { quoteId: quote.id, confirmed: false });
      expect(res.statusCode).toBe(400);
    });

    it('rechaza una cotizacion de otro invitado', async () => {
      const { event } = await organizer();
      const unoGuest = await guestOn(event.slug, 'Gabi', 0);
      const otroGuest = await guestOn(event.slug, 'Hugo', 0);
      const { quote } = body<{ quote: Quote }>(await unoGuest.post(`/api/events/${event.slug}/quote`));

      const res = await otroGuest.post(`/api/events/${event.slug}/orders`, { quoteId: quote.id, confirmed: true });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('pagos verificados y no duplicados', () => {
    it('captura una vez, suma al recaudado y alcanza el minimo', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Ines', 1);
      const order = await quoteAndOrder(guest, event.slug);
      expect(order.approveUrl).toContain('paypal.com');
      expect(order.status).toBe('created');

      const captured = await guest.post(`/api/orders/${order.orderId}/capture`);
      expect(captured.statusCode).toBe(200);
      const first = body<{ status: string; guest: Guest }>(captured);
      expect(first.status).toBe('paid');
      expect(first.guest.paidCents).toBe(5000);
      expect(first.guest.dueCents).toBe(0);

      const dash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
      expect(dash.event.collectedCents).toBe(5000);
      expect(dash.event.minimumReached).toBe(true);
      expect(dash.audit.map((a) => a.action)).toContain('payment_captured');
      expect(await ledgerCount('capture', order.orderId)).toBe(1);
    });

    it('un segundo intento de captura no cobra ni cuenta dos veces', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Jorge', 1);
      const order = await quoteAndOrder(guest, event.slug);

      const uno = await guest.post(`/api/orders/${order.orderId}/capture`);
      const dos = await guest.post(`/api/orders/${order.orderId}/capture`);
      expect(uno.statusCode).toBe(200);
      expect(dos.statusCode).toBe(200);
      expect(body<{ status: string }>(dos).status).toBe('paid');

      expect(await ledgerCount('capture', order.orderId)).toBe(1);
      const dash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
      expect(dash.event.collectedCents).toBe(5000);
    });

    it('la captura y el webhook convergen en un unico asiento', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Karla', 1);
      const order = await quoteAndOrder(guest, event.slug);
      await guest.post(`/api/orders/${order.orderId}/capture`);

      const hook = await captureWebhook(guest, order.orderId, fake.captureIdOf(order.orderId));
      expect(hook.statusCode).toBe(200);
      expect(await ledgerCount('capture', order.orderId)).toBe(1);

      const dash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
      expect(dash.event.collectedCents).toBe(5000);
    });

    it('un webhook con firma invalida no aplica nada', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Luis', 1);
      const order = await quoteAndOrder(guest, event.slug);

      fake.signatureValid = false;
      const hook = await captureWebhook(guest, order.orderId, 'CAP-FALSO');
      fake.signatureValid = true;
      expect(hook.statusCode).toBe(400);

      expect(await ledgerCount('capture', order.orderId)).toBe(0);
      const dash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
      expect(dash.event.collectedCents).toBe(0);
    });

    it('el webhook repetido de la misma captura no duplica el pago', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Marta', 1);
      const order = await quoteAndOrder(guest, event.slug);
      // Capture happens at PayPal without our callback seeing it.
      await fake.captureOrder({ paypalOrderId: order.orderId, requestId: 'externo' });
      const captureId = fake.captureIdOf(order.orderId);

      expect((await captureWebhook(guest, order.orderId, captureId)).statusCode).toBe(200);
      expect((await captureWebhook(guest, order.orderId, captureId)).statusCode).toBe(200);

      expect(await ledgerCount('capture', order.orderId)).toBe(1);
      const dash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
      expect(dash.event.collectedCents).toBe(5000);
    });

    it('CHECKOUT.ORDER.APPROVED no marca pagado', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Aprobada', 1);
      const order = await quoteAndOrder(guest, event.slug);

      const hook = await guest.post('/api/paypal/webhook', {
        id: nextWebhookId(),
        event_type: 'CHECKOUT.ORDER.APPROVED',
        resource: { id: order.orderId },
      });
      expect(hook.statusCode).toBe(200);

      const estado = body<{ status: string; guest: Guest }>(await guest.get(`/api/orders/${order.orderId}`));
      expect(estado.status).toBe('approved');
      expect(estado.guest.paidCents).toBe(0);
      expect(await ledgerCount('capture', order.orderId)).toBe(0);
      const dash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
      expect(dash.event.collectedCents).toBe(0);
    });

    it('una captura concurrente de una orden reemplazada se concilia una sola vez', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Concurrente', 1);
      const vieja = await quoteAndOrder(guest, event.slug);

      // The guest changes to one person, so the USD 50 attempt is superseded...
      await guest.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 0 });
      // ...but PayPal captures it anyway and tells us through a signed webhook.
      await fake.captureOrder({ paypalOrderId: vieja.orderId, requestId: 'externo' });
      const captureId = fake.captureIdOf(vieja.orderId);

      expect((await captureWebhook(guest, vieja.orderId, captureId)).statusCode).toBe(200);
      expect((await captureWebhook(guest, vieja.orderId, captureId)).statusCode).toBe(200);
      expect(await ledgerCount('capture', vieja.orderId)).toBe(1);

      const dash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
      expect(dash.event.collectedCents).toBe(5000);
      const concurrente = dash.guests.find((g) => g.name === 'Concurrente')!;
      // Paid more than owed: nothing due, no automatic refund, surplus left for humans.
      expect(concurrente.paidCents).toBe(5000);
      expect(concurrente.dueCents).toBe(0);
    });

    it('solo el invitado dueno puede capturar o consultar su orden', async () => {
      const { event } = await organizer();
      const guest = await guestOn(event.slug, 'Nora', 1);
      const otro = await guestOn(event.slug, 'Omar', 0);
      const order = await quoteAndOrder(guest, event.slug);

      expect((await otro.post(`/api/orders/${order.orderId}/capture`)).statusCode).toBe(403);
      expect((await otro.get(`/api/orders/${order.orderId}`)).statusCode).toBe(403);
      expect((await new Client(app).get(`/api/orders/${order.orderId}`)).statusCode).toBe(401);

      const own = body<{ status: string; guest: Guest }>(await guest.get(`/api/orders/${order.orderId}`));
      expect(own.status).toBe('created');
      expect(own.guest.paidCents).toBe(0);
    });

    it('no marca pagado si el importe capturado no coincide', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Pili', 1);
      const order = await quoteAndOrder(guest, event.slug);

      fake.tamper = { amountCents: 50 };
      const res = await guest.post(`/api/orders/${order.orderId}/capture`);
      fake.tamper = {};

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(await ledgerCount('capture', order.orderId)).toBe(0);
      const dash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
      expect(dash.event.collectedCents).toBe(0);
    });

    it('no marca pagado si el receptor no es el comercio configurado', async () => {
      const { event } = await organizer();
      const guest = await guestOn(event.slug, 'Quique', 1);
      const order = await quoteAndOrder(guest, event.slug);

      fake.tamper = { merchantId: 'COMERCIO-AJENO' };
      const res = await guest.post(`/api/orders/${order.orderId}/capture`);
      fake.tamper = {};

      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(await ledgerCount('capture', order.orderId)).toBe(0);
    });

    it('reutiliza la misma orden y el mismo request id tras un timeout al crear', async () => {
      const { event } = await organizer();
      const guest = await guestOn(event.slug, 'Rosa', 1);
      const quoteRes = await guest.post(`/api/events/${event.slug}/quote`);
      const { quote } = body<{ quote: Quote }>(quoteRes);

      const before = fake.createCalls.length;
      fake.failCreate = 'timeout';
      const fallo = await guest.post(`/api/events/${event.slug}/orders`, { quoteId: quote.id, confirmed: true });
      expect(fallo.statusCode).toBe(502);

      fake.failCreate = null;
      const reintento = await guest.post(`/api/events/${event.slug}/orders`, { quoteId: quote.id, confirmed: true });
      expect(reintento.statusCode).toBe(200);

      const calls = fake.createCalls.slice(before);
      expect(calls).toHaveLength(2);
      expect(calls[0]!.requestId).toBe(calls[1]!.requestId);

      const { rows } = await pool.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM orders WHERE guest_id = (
           SELECT g.id FROM guests g JOIN events e ON e.id = g.event_id
            WHERE e.slug = $1 AND g.name = 'Rosa')`,
        [event.slug],
      );
      expect(rows[0]!.n).toBe(1);
    });

    it('un timeout despues de capturar en PayPal se concilia como un unico pago', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Sara', 1);
      const order = await quoteAndOrder(guest, event.slug);

      fake.failCapture = 'captured-then-timeout';
      const primero = await guest.post(`/api/orders/${order.orderId}/capture`);
      fake.failCapture = null;

      expect(primero.statusCode).toBe(200);
      expect(body<{ status: string }>(primero).status).toBe('paid');
      expect(await ledgerCount('capture', order.orderId)).toBe(1);

      const dash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
      expect(dash.event.collectedCents).toBe(5000);
    });

    it('la consulta del dueno concilia una orden pagada fuera de la app', async () => {
      const { event } = await organizer();
      const guest = await guestOn(event.slug, 'Tomas', 1);
      const order = await quoteAndOrder(guest, event.slug);
      await fake.captureOrder({ paypalOrderId: order.orderId, requestId: 'externo' });

      const res = body<{ status: string; guest: Guest }>(await guest.get(`/api/orders/${order.orderId}`));
      expect(res.status).toBe('paid');
      expect(res.guest.paidCents).toBe(5000);
      expect(await ledgerCount('capture', order.orderId)).toBe(1);
    });

    it('cambiar de acompanantes reemplaza la orden abierta en lugar de abrir dos', async () => {
      const { event } = await organizer();
      const guest = await guestOn(event.slug, 'Ursula', 1);
      const primera = await quoteAndOrder(guest, event.slug);

      await guest.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 0 });
      const segunda = await quoteAndOrder(guest, event.slug);
      expect(segunda.orderId).not.toBe(primera.orderId);

      // Our flow refuses to capture the superseded attempt.
      expect((await guest.post(`/api/orders/${primera.orderId}/capture`)).statusCode).toBe(409);

      const captured = await guest.post(`/api/orders/${segunda.orderId}/capture`);
      expect(captured.statusCode).toBe(200);
      expect(body<{ guest: Guest }>(captured).guest.paidCents).toBe(2500);

      const { rows } = await pool.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM orders WHERE status IN ('intent','created','approved') AND guest_id = (
           SELECT g.id FROM guests g JOIN events e ON e.id = g.event_id
            WHERE e.slug = $1 AND g.name = 'Ursula')`,
        [event.slug],
      );
      expect(rows[0]!.n).toBe(0);
    });

    it('no vuelve a cobrar cuando ya no queda saldo', async () => {
      const { event } = await organizer();
      const guest = await guestOn(event.slug, 'Vera', 0);
      const order = await quoteAndOrder(guest, event.slug);
      expect((await guest.post(`/api/orders/${order.orderId}/capture`)).statusCode).toBe(200);

      const quoteRes = await guest.post(`/api/events/${event.slug}/quote`);
      const { quote } = body<{ quote: Quote }>(quoteRes);
      expect(quote.amountCents).toBe(0);
      const res = await guest.post(`/api/events/${event.slug}/orders`, { quoteId: quote.id, confirmed: true });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('reembolsos idempotentes', () => {
    it('resta una vez del recaudado y no se duplica al repetir el webhook', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Wendy', 1);
      const order = await quoteAndOrder(guest, event.slug);
      await guest.post(`/api/orders/${order.orderId}/capture`);
      const captureId = fake.captureIdOf(order.orderId);
      const refund = fake.addRefund(captureId, 2000);

      const resource = { id: refund.id, amount: refund.amount };
      const uno = await guest.post('/api/paypal/webhook', {
        id: nextWebhookId(),
        event_type: 'PAYMENT.CAPTURE.REFUNDED',
        resource,
      });
      const dos = await guest.post('/api/paypal/webhook', {
        id: nextWebhookId(),
        event_type: 'PAYMENT.CAPTURE.REFUNDED',
        resource,
      });
      expect(uno.statusCode).toBe(200);
      expect(dos.statusCode).toBe(200);

      expect(await ledgerCount('refund', order.orderId)).toBe(1);
      const dash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
      expect(dash.event.collectedCents).toBe(3000);
      expect(dash.event.minimumReached).toBe(false);
      const wendy = dash.guests.find((g) => g.name === 'Wendy')!;
      expect(wendy.paidCents).toBe(3000);
      expect(wendy.dueCents).toBe(2000);
    });

    it('rechaza un reembolso mayor que la captura y uno sin captura registrada', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Xavi', 1);
      const order = await quoteAndOrder(guest, event.slug);
      await guest.post(`/api/orders/${order.orderId}/capture`);
      const captureId = fake.captureIdOf(order.orderId);

      // Refunding more than was captured can never become valid: it is consumed and flagged.
      const excesivo = fake.addRefund(captureId, 9000);
      const rechazado = await guest.post('/api/paypal/webhook', {
        id: nextWebhookId(),
        event_type: 'PAYMENT.CAPTURE.REFUNDED',
        resource: { id: excesivo.id },
      });
      expect(rechazado.statusCode).toBe(200);

      // A refund whose capture we have not recorded may just be ahead of it: PayPal is asked to
      // redeliver instead of us swallowing the only notification we get.
      const huerfano = fake.addRefund('CAP-INEXISTENTE', 1000);
      const huerfanoId = nextWebhookId();
      const adelantado = await guest.post('/api/paypal/webhook', {
        id: huerfanoId,
        event_type: 'PAYMENT.CAPTURE.REFUNDED',
        resource: { id: huerfano.id },
      });
      expect(adelantado.statusCode).toBe(503);
      const recorded = await pool.query<{ id: string }>('SELECT id FROM webhook_events WHERE id = $1', [huerfanoId]);
      expect(recorded.rows).toHaveLength(0);

      expect(await ledgerCount('refund', order.orderId)).toBe(0);
      const dash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
      expect(dash.event.collectedCents).toBe(5000);
    });
  });

  describe('confirmacion del evento por el organizador', () => {
    it('exige el minimo configurado y lo habilita al alcanzarlo', async () => {
      const { client: org, event } = await organizer();
      expect((await org.post(`/api/events/${event.slug}/confirm`)).statusCode).toBe(409);

      const guest = await guestOn(event.slug, 'Yago', 1);
      const order = await quoteAndOrder(guest, event.slug);
      await guest.post(`/api/orders/${order.orderId}/capture`);

      const res = await org.post(`/api/events/${event.slug}/confirm`);
      expect(res.statusCode).toBe(200);
      expect(body<{ event: FiestaEvent }>(res).event.confirmed).toBe(true);
    });

    it('49,99 no alcanza un minimo de 50 y 50 si: frontera exacta 4999/5000 centavos', async () => {
      // Demo event: USD 25 per person, goal USD 100, minimum USD 50. Every amount below comes
      // from the public API flow and FakePayPal; nothing is written to the ledger by hand.
      const { client: org, event } = await organizer();
      expect(event.minimumCents).toBe(5000);
      expect(event.goalCents).toBe(10000);
      const guest = await guestOn(event.slug, 'Zoe', 1); // 2 personas: debe exactamente 5000

      // Read only: the guest session the chat/voice routes would resolve from the cookie.
      const { rows: sesion } = await pool.query<{ session_id: string }>(
        `SELECT g.session_id FROM guests g JOIN events e ON e.id = g.event_id
          WHERE e.slug = $1 AND g.name = 'Zoe'`,
        [event.slug],
      );
      const guestSessionId = sesion[0]!.session_id;

      /**
       * Recaudado must agree, to the cent, across the organizer dashboard, the public invitation
       * and the shared tool handler behind chat and voice. The tool runs first so the confirmed
       * flag read afterwards also proves the assistant never confirms the event.
       */
      async function progreso(expectedCents: number, minimumReached: boolean, confirmed: boolean) {
        const row = await getEventBySlug(pool, event.slug);
        const toolGuest = await findGuestBySession(pool, row.id, guestSessionId);
        expect(toolGuest).not.toBeNull();
        const tool = await runTool(
          { pool, sessionId: guestSessionId, event: row, guest: toolGuest, quoteTtlSeconds: testConfig().quoteTtlSeconds },
          'get_collection_progress',
          {},
        );
        // A read: no quote card and no proposed action, let alone a payment or a confirmation.
        expect(tool.quote).toBeUndefined();
        expect(tool.actions).toBeUndefined();
        expect(tool.response.recaudado_bruto_centavos).toBe(expectedCents);
        expect(tool.response.recaudado_bruto).toBe(usd(expectedCents));
        expect(tool.response.minimo_alcanzado).toBe(minimumReached);
        expect(tool.response.minimo).toBe(usd(5000));
        expect(tool.response.meta).toBe(usd(10000));
        expect(String(tool.response.nota)).toContain('antes de comisiones');

        const dash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
        const publico = body<{ event: FiestaEvent; guest: Guest | null }>(
          await new Client(app).get(`/api/events/${event.slug}`),
        );
        for (const view of [dash.event, publico.event]) {
          expect(view.collectedCents).toBe(expectedCents);
          expect(view.minimumReached).toBe(minimumReached);
          expect(view.minimumCents).toBe(5000);
          expect(view.goalCents).toBe(10000);
          expect(view.confirmed).toBe(confirmed);
        }
        return dash;
      }

      async function refundWebhook(webhookId: string, refund: { id?: string; amount?: unknown }) {
        return guest.post('/api/paypal/webhook', {
          id: webhookId,
          event_type: 'PAYMENT.CAPTURE.REFUNDED',
          resource: { id: refund.id, amount: refund.amount },
        });
      }

      // Estado 0: nada recaudado, no se puede confirmar.
      await progreso(0, false, false);
      expect((await org.post(`/api/events/${event.slug}/confirm`)).statusCode).toBe(409);

      // Estado 5000: captura verificada de 2 personas. Alcanza el minimo, pero sin confirmacion
      // humana del organizador el evento sigue sin confirmar.
      const primero = await quoteAndOrder(guest, event.slug);
      expect(fake.createCalls.at(-1)!.amountCents).toBe(5000);
      const capturado = await guest.post(`/api/orders/${primero.orderId}/capture`);
      expect(capturado.statusCode).toBe(200);
      expect(body<{ status: string; guest: Guest }>(capturado).guest.paidCents).toBe(5000);
      await progreso(5000, true, false);

      // Estado 4999: PayPal reembolsa 1 centavo; el webhook firmado lo aplica una sola vez.
      const refund = fake.addRefund(fake.captureIdOf(primero.orderId), 1);
      const refundHookId = nextWebhookId();
      expect((await refundWebhook(refundHookId, refund)).statusCode).toBe(200);
      // Redelivery with the same webhook id, and the same refund under a new webhook id.
      expect((await refundWebhook(refundHookId, refund)).statusCode).toBe(200);
      expect((await refundWebhook(nextWebhookId(), refund)).statusCode).toBe(200);
      expect(await ledgerCount('refund', primero.orderId)).toBe(1);

      const dash4999 = await progreso(4999, false, false);
      const zoe = dash4999.guests.find((g) => g.name === 'Zoe')!;
      expect(zoe.paidCents).toBe(4999);
      expect(zoe.dueCents).toBe(1);

      const rechazo = await org.post(`/api/events/${event.slug}/confirm`);
      expect(rechazo.statusCode).toBe(409);
      expect(Object.keys(body<Record<string, unknown>>(rechazo))).toEqual(['error']);

      // Nueva cotizacion por el saldo exacto de 1 centavo, calculada en el servidor.
      const quoteRes = await guest.post(`/api/events/${event.slug}/quote`);
      expect(quoteRes.statusCode).toBe(200);
      const { quote } = body<{ quote: Quote }>(quoteRes);
      expect(quote.totalCents).toBe(5000);
      expect(quote.paidCents).toBe(4999);
      expect(quote.amountCents).toBe(1);
      const orderRes = await guest.post(`/api/events/${event.slug}/orders`, { quoteId: quote.id, confirmed: true });
      expect(orderRes.statusCode).toBe(200);
      const saldo = body<OrderResult>(orderRes);
      expect(saldo.orderId).not.toBe(primero.orderId);
      expect(fake.createCalls.at(-1)!.amountCents).toBe(1);

      // APPROVED sin captura no cuenta: seguimos en 4999 y sin poder confirmar.
      const aprobado = await guest.post('/api/paypal/webhook', {
        id: nextWebhookId(),
        event_type: 'CHECKOUT.ORDER.APPROVED',
        resource: { id: saldo.orderId },
      });
      expect(aprobado.statusCode).toBe(200);
      const estado = body<{ status: string; guest: Guest }>(await guest.get(`/api/orders/${saldo.orderId}`));
      expect(estado.status).toBe('approved');
      expect(estado.guest.paidCents).toBe(4999);
      expect(await ledgerCount('capture', saldo.orderId)).toBe(0);
      await progreso(4999, false, false);
      expect((await org.post(`/api/events/${event.slug}/confirm`)).statusCode).toBe(409);

      // Estado 5000 otra vez: la captura simulada de 1 centavo alcanza el minimo exacto.
      const saldado = await guest.post(`/api/orders/${saldo.orderId}/capture`);
      expect(saldado.statusCode).toBe(200);
      const pagado = body<{ status: string; guest: Guest }>(saldado);
      expect(pagado.status).toBe('paid');
      expect(pagado.guest.paidCents).toBe(5000);
      expect(pagado.guest.dueCents).toBe(0);
      expect(await ledgerCount('capture', saldo.orderId)).toBe(1);
      expect(await ledgerCount('refund', primero.orderId)).toBe(1);
      await progreso(5000, true, false);

      // Solo la accion humana del organizador confirma; la meta de 10000 no la impide.
      const confirmado = await org.post(`/api/events/${event.slug}/confirm`);
      expect(confirmado.statusCode).toBe(200);
      const confirmedEvent = body<{ event: FiestaEvent }>(confirmado).event;
      expect(confirmedEvent.confirmed).toBe(true);
      expect(confirmedEvent.collectedCents).toBe(5000);
      expect(confirmedEvent.minimumReached).toBe(true);
      expect(confirmedEvent.goalCents).toBe(10000);
      const final = await progreso(5000, true, true);
      expect(final.audit.map((a) => a.action)).toContain('event_confirmed');
    });
  });

  describe('reinicio de demo por generaciones', () => {
    it('archiva la invitacion anterior, bloquea pagos nuevos y concilia capturas tardias', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Antigua', 1);
      const order = await quoteAndOrder(guest, event.slug);

      const reset = await org.post('/api/demo/reset');
      expect(reset.statusCode).toBe(200);
      const nuevo = body<{ event: FiestaEvent }>(reset).event;
      expect(nuevo.slug).not.toBe(event.slug);
      expect(nuevo.collectedCents).toBe(0);

      // The archived invitation cannot start a new payment.
      const quoteVieja = await guest.post(`/api/events/${event.slug}/quote`);
      expect(quoteVieja.statusCode).toBe(410);

      // An archived invitation never *starts* a new capture.
      const bloqueado = await guest.post(`/api/orders/${order.orderId}/capture`);
      expect(bloqueado.statusCode).toBe(409);
      expect(fake.captureCalls.filter((c) => c.paypalOrderId === order.orderId)).toHaveLength(0);

      // But a capture that was already in flight at PayPal is real money, and it still
      // reconciles against the old generation instead of being lost.
      await fake.captureOrder({ paypalOrderId: order.orderId, requestId: 'externo' });
      const captured = await guest.post(`/api/orders/${order.orderId}/capture`);
      expect(captured.statusCode).toBe(200);
      expect(await ledgerCount('capture', order.orderId)).toBe(1);

      const viejoDash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
      expect(viejoDash.event.collectedCents).toBe(5000);
      expect(viejoDash.guests.map((g) => g.name)).toContain('Antigua');

      const nuevoDash = body<Dashboard>(await org.get(`/api/events/${nuevo.slug}/dashboard`));
      expect(nuevoDash.event.collectedCents).toBe(0);
      expect(nuevoDash.guests).toEqual([]);
    });

    it('un reinicio solo afecta a la propia sesion', async () => {
      const a = await organizer();
      const b = await organizer();

      expect((await a.client.post('/api/demo/reset')).statusCode).toBe(200);

      const deB = body<{ event: FiestaEvent; guest: Guest | null }>(await b.client.get(`/api/events/${b.event.slug}`));
      expect(deB.event.slug).toBe(b.event.slug);
      const guest = await guestOn(b.event.slug, 'SigueViva');
      expect((await guest.post(`/api/events/${b.event.slug}/quote`)).statusCode).toBe(200);

      expect((await new Client(app).post('/api/demo/reset')).statusCode).toBe(401);
    });
  });

  describe('proveedores ausentes responden 503 honesto', () => {
    let bare: FastifyInstance;

    beforeAll(async () => {
      bare = await buildApp({
        pool,
        config: testConfig({
          PAYPAL_CLIENT_ID: undefined,
          PAYPAL_CLIENT_SECRET: undefined,
          PAYPAL_MERCHANT_ID: undefined,
          PAYPAL_WEBHOOK_ID: undefined,
        }),
        paypal: null,
        logger: false,
      });
      await bare.ready();
    });

    afterAll(async () => {
      await bare?.close();
    });

    it('declara las capacidades en falso y no finge pagos ni asistente', async () => {
      const client = new Client(bare);
      const caps = body<Capabilities>(await client.get('/api/capabilities'));
      expect(caps.paypal).toBe(false);
      expect(caps.paypalClientId).toBeNull();
      expect(caps.gemini).toBe(false);

      const { event } = body<{ event: FiestaEvent }>(await client.post('/api/demo'));
      const guest = new Client(bare);
      await guest.post(`/api/events/${event.slug}/join`, { name: 'SinPayPal' });
      await guest.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 0 });
      const { quote } = body<{ quote: Quote }>(await guest.post(`/api/events/${event.slug}/quote`));

      const order = await guest.post(`/api/events/${event.slug}/orders`, { quoteId: quote.id, confirmed: true });
      expect(order.statusCode).toBe(503);

      const webhook = await guest.post('/api/paypal/webhook', { id: 'WH-X', event_type: 'PAYMENT.CAPTURE.COMPLETED' });
      expect(webhook.statusCode).toBe(503);

      const chat = await guest.post(`/api/events/${event.slug}/chat`, { message: 'Que incluye?' });
      expect(chat.statusCode).toBe(503);
      expect(body<{ error: string }>(chat).error).toMatch(/Gemini|asistente/);
    });
  });

  describe('SPA servida desde web/dist', () => {
    let spa: FastifyInstance;
    let dir: string;

    beforeAll(async () => {
      dir = await mkdtemp(join(tmpdir(), 'fp-web-'));
      await writeFile(join(dir, 'index.html'), '<!doctype html><title>FiestaPay</title>');
      await mkdir(join(dir, 'assets'), { recursive: true });
      await writeFile(join(dir, 'assets', 'app.js'), 'console.log("fiestapay");');
      spa = await buildApp({
        pool,
        config: testConfig({ SERVE_WEB: '1', WEB_DIST_DIR: dir }),
        paypal: fake,
        logger: false,
      });
      await spa.ready();
    });

    afterAll(async () => {
      await spa?.close();
      await rm(dir, { recursive: true, force: true });
    });

    it('sirve index.html, los assets y las rutas del cliente', async () => {
      const root = await spa.inject({ method: 'GET', url: '/' });
      expect(root.statusCode).toBe(200);
      expect(root.body).toContain('FiestaPay');

      const asset = await spa.inject({ method: 'GET', url: '/assets/app.js' });
      expect(asset.statusCode).toBe(200);

      const deepLink = await spa.inject({ method: 'GET', url: '/e/comida-abc123' });
      expect(deepLink.statusCode).toBe(200);
      expect(deepLink.body).toContain('FiestaPay');
    });

    it('nunca devuelve HTML para rutas /api', async () => {
      const res = await spa.inject({ method: 'GET', url: '/api/no-existe' });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: 'Ruta no encontrada' });

      const health = await spa.inject({ method: 'GET', url: '/api/health' });
      expect(health.json()).toEqual({ ok: true });
    });
  });

  describe('limite de peticiones', () => {
    it('responde 429 cuando se exceden las peticiones de una ruta', async () => {
      const limited = await buildApp({
        pool,
        config: testConfig({ RATE_LIMIT: '1', RATE_LIMIT_MAX: '500' }),
        paypal: fake,
        logger: false,
      });
      await limited.ready();
      try {
        const client = new Client(limited);
        const codes: number[] = [];
        for (let i = 0; i < 22; i += 1) codes.push((await client.post('/api/demo')).statusCode);
        expect(codes).toContain(429);
      } finally {
        await limited.close();
      }
    });
  });

  describe('asistente de texto sin clave configurada', () => {
    it('devuelve 503 y la UI conserva los formularios', async () => {
      const { event } = await organizer();
      const guest = await guestOn(event.slug, 'Chat', 0);
      const res = await guest.post(`/api/events/${event.slug}/chat`, { message: 'Cuanto debo?' });
      expect(res.statusCode).toBe(503);
    });

    it('acota el tamano del mensaje', async () => {
      const { event } = await organizer();
      const guest = await guestOn(event.slug, 'ChatLargo', 0);
      const res = await guest.post(`/api/events/${event.slug}/chat`, { message: 'x'.repeat(2000) });
      expect(res.statusCode).toBe(400);
    });
  });
});
