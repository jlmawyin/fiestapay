import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Dashboard, FiestaEvent, Guest, OrderResult, Quote } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { FakePayPal } from './fake-paypal.js';
import { announceSkipWithoutDatabase, body, Client, DATABASE_URL, MERCHANT, ORIGIN, testConfig } from './harness.js';

announceSkipWithoutDatabase('payment-races.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

/**
 * Each case here walks a full guest journey (join, RSVP, quote, order, capture, webhooks), so
 * it issues far more round trips than a plain unit test. On a PostgreSQL reached through a slow
 * port forward that alone can pass the default 30s budget, which would report an environment
 * problem as a race failure. The races themselves never wait on time: they are driven by the
 * barriers in FakePayPal, so this budget only ever absorbs database latency.
 */
const RACE_TIMEOUT_MS = 150_000;
const race = (name: string, fn: () => Promise<void>) => it(name, fn, RACE_TIMEOUT_MS);

/**
 * Races and out-of-order notifications around money, driven by barriers inside the fake PayPal
 * adapter rather than by timers: each test pins one exact interleaving and is deterministic.
 *
 * The demo event is USD 25 per person, so a guest with one companion owes USD 50 and a guest
 * alone owes USD 25. "Two charges for one obligation" always shows up here as a ledger total
 * above the obligation, which is what these tests assert against.
 */
describeDb('carreras de pago y notificaciones fuera de orden', () => {
  const schema = `fp_race_${randomBytes(5).toString('hex')}`;
  let pool: Pool;
  let adminPool: Pool;
  let app: FastifyInstance;
  let fake: FakePayPal;
  let webhookSeq = 0;

  const nextWebhookId = (): string => `WHR-${++webhookSeq}-${randomBytes(3).toString('hex')}`;

  interface OrderSnapshot {
    id: string;
    status: string;
    paypal_order_id: string | null;
    approve_url: string | null;
    capture_id: string | null;
  }

  async function orderOf(slug: string, guestName: string): Promise<OrderSnapshot> {
    const { rows } = await pool.query<OrderSnapshot>(
      `SELECT o.id, o.status, o.paypal_order_id, o.approve_url, o.capture_id
         FROM orders o
         JOIN guests g ON g.id = o.guest_id
         JOIN events e ON e.id = g.event_id
        WHERE e.slug = $1 AND g.name = $2
        ORDER BY o.created_at DESC
        LIMIT 1`,
      [slug, guestName],
    );
    const row = rows[0];
    if (!row) throw new Error(`sin orden para ${guestName} en ${slug}`);
    return row;
  }

  async function orderCount(slug: string, guestName: string, statuses?: string[]): Promise<number> {
    const { rows } = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n
         FROM orders o
         JOIN guests g ON g.id = o.guest_id
         JOIN events e ON e.id = g.event_id
        WHERE e.slug = $1 AND g.name = $2
          AND ($3::text[] IS NULL OR o.status = ANY($3::text[]))`,
      [slug, guestName, statuses ?? null],
    );
    return rows[0]?.n ?? 0;
  }

  /** Ledger rows and their total for one PayPal order: the only record of real money. */
  async function ledger(kind: 'capture' | 'refund', paypalOrderId: string): Promise<{ rows: number; cents: number }> {
    const { rows } = await pool.query<{ n: number; cents: string | null }>(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(amount_cents), 0)::text AS cents
         FROM payment_ledger
        WHERE kind = $1 AND order_id = (SELECT id FROM orders WHERE paypal_order_id = $2)`,
      [kind, paypalOrderId],
    );
    return { rows: rows[0]?.n ?? 0, cents: Number(rows[0]?.cents ?? 0) };
  }

  async function auditOf(slug: string): Promise<string[]> {
    const { rows } = await pool.query<{ action: string }>(
      `SELECT a.action FROM audit_log a JOIN events e ON e.id = a.event_id WHERE e.slug = $1`,
      [slug],
    );
    return rows.map((r) => r.action);
  }

  async function webhookRecorded(id: string): Promise<boolean> {
    const { rows } = await pool.query<{ id: string }>('SELECT id FROM webhook_events WHERE id = $1', [id]);
    return rows.length > 0;
  }

  const webhook = (
    client: Client,
    eventType: string,
    resource: Record<string, unknown>,
    id: string = nextWebhookId(),
  ) => client.post('/api/paypal/webhook', { id, event_type: eventType, resource });

  const captureResource = (captureId: string, paypalOrderId: string) => ({
    id: captureId,
    supplementary_data: { related_ids: { order_id: paypalOrderId } },
  });

  async function collected(org: Client, slug: string): Promise<number> {
    return body<Dashboard>(await org.get(`/api/events/${slug}/dashboard`)).event.collectedCents;
  }

  async function organizer(): Promise<{ client: Client; event: FiestaEvent }> {
    const client = new Client(app);
    const res = await client.post('/api/demo');
    expect(res.statusCode).toBe(200);
    return { client, event: body<{ event: FiestaEvent }>(res).event };
  }

  async function guestOn(slug: string, name: string, companions = 0): Promise<Client> {
    const client = new Client(app);
    expect((await client.post(`/api/events/${slug}/join`, { name })).statusCode).toBe(200);
    expect((await client.post(`/api/events/${slug}/rsvp`, { status: 'yes', companions })).statusCode).toBe(200);
    return client;
  }

  async function liveQuote(client: Client, slug: string): Promise<Quote> {
    const res = await client.post(`/api/events/${slug}/quote`);
    expect(res.statusCode).toBe(200);
    return body<{ quote: Quote }>(res).quote;
  }

  async function quoteAndOrder(client: Client, slug: string): Promise<OrderResult> {
    const quote = await liveQuote(client, slug);
    const res = await client.post(`/api/events/${slug}/orders`, { quoteId: quote.id, confirmed: true });
    expect(res.statusCode).toBe(200);
    return body<OrderResult>(res);
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

  describe('creacion de orden mientras la obligacion cambia', () => {
    race('no revive una orden reemplazada cuando PayPal responde tarde', async () => {
      const { event } = await organizer();
      const guest = await guestOn(event.slug, 'Reemplazada', 1);
      const quote = await liveQuote(guest, event.slug);

      const gate = fake.gateCreate();
      const creating = guest.post(`/api/events/${event.slug}/orders`, { quoteId: quote.id, confirmed: true });
      await gate.arrived;

      // The party shrinks while the create call is out: USD 50 is no longer owed.
      expect((await guest.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 0 })).statusCode).toBe(200);
      gate.open();

      const res = await creating;
      expect(res.statusCode).toBe(409);
      expect(body<Record<string, unknown>>(res).approveUrl).toBeUndefined();

      const row = await orderOf(event.slug, 'Reemplazada');
      expect(row.status).toBe('superseded');
      // The PayPal id is kept even though the order is dead: it is the only handle we would
      // have to reconcile a capture that happens anyway.
      expect(row.paypal_order_id).not.toBeNull();
      expect(row.approve_url).toBeNull();

      const captured = await guest.post(`/api/orders/${row.paypal_order_id}/capture`);
      expect(captured.statusCode).toBe(409);
      expect(fake.captureCalls.filter((c) => c.paypalOrderId === row.paypal_order_id)).toHaveLength(0);
    });

    race('no deja una orden abierta en una invitacion archivada durante la creacion', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Archivada', 1);
      const quote = await liveQuote(guest, event.slug);

      const gate = fake.gateCreate();
      const creating = guest.post(`/api/events/${event.slug}/orders`, { quoteId: quote.id, confirmed: true });
      await gate.arrived;

      expect((await org.post('/api/demo/reset')).statusCode).toBe(200);
      gate.open();

      expect((await creating).statusCode).toBe(409);
      const row = await orderOf(event.slug, 'Archivada');
      expect(row.status).toBe('superseded');
      expect(row.paypal_order_id).not.toBeNull();
      expect(await orderCount(event.slug, 'Archivada', ['intent', 'created', 'approved', 'capturing'])).toBe(0);
    });

    race('un rechazo ambiguo de PayPal no marca fallida la orden y conserva el request id', async () => {
      const { event } = await organizer();
      const guest = await guestOn(event.slug, 'Ambigua', 0);
      const quote = await liveQuote(guest, event.slug);
      const before = fake.createCalls.length;

      // What PayPal answers when the same request/invoice id is already in use.
      fake.createFailures = ['duplicate-422'];
      const ambiguous = await guest.post(`/api/events/${event.slug}/orders`, { quoteId: quote.id, confirmed: true });
      expect(ambiguous.statusCode).toBe(502);
      expect((await orderOf(event.slug, 'Ambigua')).status).toBe('intent');

      const retry = await guest.post(`/api/events/${event.slug}/orders`, { quoteId: quote.id, confirmed: true });
      expect(retry.statusCode).toBe(200);
      expect((await orderOf(event.slug, 'Ambigua')).status).toBe('created');
      expect(await orderCount(event.slug, 'Ambigua')).toBe(1);

      const calls = fake.createCalls.slice(before);
      expect(calls).toHaveLength(2);
      expect(calls[0]!.requestId).toBe(calls[1]!.requestId);
    });

    race('dos creaciones simultaneas del mismo intento nunca producen una orden fallida ni dos ordenes', async () => {
      const { event } = await organizer();
      const guest = await guestOn(event.slug, 'Simultanea', 1);
      const quote = await liveQuote(guest, event.slug);

      // One of the two racing calls loses the idempotency check at PayPal.
      fake.createFailures = ['duplicate-429'];
      const payload = { quoteId: quote.id, confirmed: true };
      const [uno, dos] = await Promise.all([
        guest.post(`/api/events/${event.slug}/orders`, payload),
        guest.post(`/api/events/${event.slug}/orders`, payload),
      ]);
      fake.createFailures = [];

      // Either both callers see the single order, or the loser is told to retry — never a 500,
      // and never an order marked failed while the other call completed it.
      for (const res of [uno, dos]) expect([200, 502]).toContain(res.statusCode);
      expect([uno.statusCode, dos.statusCode]).toContain(200);
      expect(await orderCount(event.slug, 'Simultanea')).toBe(1);
      expect((await orderOf(event.slug, 'Simultanea')).status).toBe('created');
    });

    race('devuelve al pagador a la invitacion, no a una ruta que el front no sirve', async () => {
      const { event } = await organizer();
      const guest = await guestOn(event.slug, 'Retorno', 0);
      await quoteAndOrder(guest, event.slug);

      const call = fake.createCalls.at(-1)!;
      expect(call.returnUrl).toBe(`${ORIGIN}/e/${event.slug}?paypal=approved`);
      expect(call.cancelUrl).toBe(`${ORIGIN}/e/${event.slug}?paypal=cancelled`);
    });
  });

  describe('captura reclamada antes de la red', () => {
    race('congela la obligacion mientras la captura esta en vuelo', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'EnVuelo', 1);
      const order = await quoteAndOrder(guest, event.slug);

      const gate = fake.gateCapture();
      const capturing = guest.post(`/api/orders/${order.orderId}/capture`);
      await gate.arrived;

      // The claim is already durable, so the two moves that together double-charge are refused.
      const rsvp = await guest.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 0 });
      expect(rsvp.statusCode).toBe(409);

      const quote = await liveQuote(guest, event.slug);
      const second = await guest.post(`/api/events/${event.slug}/orders`, { quoteId: quote.id, confirmed: true });
      expect(second.statusCode).toBe(409);

      gate.open();
      expect((await capturing).statusCode).toBe(200);

      expect(await ledger('capture', order.orderId)).toEqual({ rows: 1, cents: 5000 });
      expect(await collected(org, event.slug)).toBe(5000);
      expect(await orderCount(event.slug, 'EnVuelo')).toBe(1);
    });

    race('un timeout deja la captura recuperable con el mismo request id, sin orden nueva', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Timeout', 1);
      const order = await quoteAndOrder(guest, event.slug);
      const createsBefore = fake.createCalls.length;

      fake.failCapture = 'timeout';
      const timedOut = await guest.post(`/api/orders/${order.orderId}/capture`);
      fake.failCapture = null;
      expect(timedOut.statusCode).toBe(502);
      expect((await orderOf(event.slug, 'Timeout')).status).toBe('capturing');

      // Uncertain money freezes the obligation instead of letting a second one open.
      expect((await guest.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 0 })).statusCode).toBe(409);

      const retried = await guest.post(`/api/orders/${order.orderId}/capture`);
      expect(retried.statusCode).toBe(200);

      const captureRequestIds = fake.captureCalls.filter((c) => c.paypalOrderId === order.orderId).map((c) => c.requestId);
      expect(captureRequestIds).toHaveLength(2);
      expect(new Set(captureRequestIds).size).toBe(1);
      expect(fake.createCalls).toHaveLength(createsBefore);
      expect(await ledger('capture', order.orderId)).toEqual({ rows: 1, cents: 5000 });
      expect(await collected(org, event.slug)).toBe(5000);
    });

    race('el tiempo transcurrido no libera una captura de resultado incierto', async () => {
      const { event } = await organizer();
      const guest = await guestOn(event.slug, 'Vencida', 1);
      const order = await quoteAndOrder(guest, event.slug);

      fake.failCapture = 'timeout';
      expect((await guest.post(`/api/orders/${order.orderId}/capture`)).statusCode).toBe(502);
      fake.failCapture = null;

      // A fresh claim is never released: another request may still be capturing right now.
      expect(body<{ status: string }>(await guest.get(`/api/orders/${order.orderId}`)).status).toBe('capturing');

      // Age the claim past the safety window instead of sleeping through it.
      await pool.query(`UPDATE orders SET updated_at = now() - interval '10 minutes' WHERE paypal_order_id = $1`, [
        order.orderId,
      ]);

      const read = body<{ status: string; guest: Guest }>(await guest.get(`/api/orders/${order.orderId}`));
      expect(read.status).toBe('capturing');
      expect(read.guest.paidCents).toBe(0);
      expect(await auditOf(event.slug)).not.toContain('payment_claim_released');
      expect((await guest.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 0 })).statusCode).toBe(409);
      // Recovery still uses the original capture request, never a second order.
      expect((await guest.post(`/api/orders/${order.orderId}/capture`)).statusCode).toBe(200);
    });
  });

  describe('capturas historicas de ordenes que ya no son la obligacion', () => {
    race('no inicia la captura de una orden reemplazada pero contabiliza la verificada una vez', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Historica', 1);
      const order = await quoteAndOrder(guest, event.slug);

      expect((await guest.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 0 })).statusCode).toBe(200);
      // PayPal captured the superseded attempt anyway.
      await fake.captureOrder({ paypalOrderId: order.orderId, requestId: 'externo' });

      const reconciled = await guest.post(`/api/orders/${order.orderId}/capture`);
      expect(reconciled.statusCode).toBe(200);
      // Our side never asked PayPal to capture: only the external call did.
      expect(fake.captureCalls.filter((c) => c.paypalOrderId === order.orderId)).toHaveLength(1);

      expect(await ledger('capture', order.orderId)).toEqual({ rows: 1, cents: 5000 });
      const actions = await auditOf(event.slug);
      expect(actions).toContain('payment_captured_stale_order');
      expect(actions).not.toContain('payment_captured');

      // Repeating it changes nothing.
      expect((await guest.post(`/api/orders/${order.orderId}/capture`)).statusCode).toBe(200);
      expect(await ledger('capture', order.orderId)).toEqual({ rows: 1, cents: 5000 });
      expect(await collected(org, event.slug)).toBe(5000);
    });

    race('una invitacion archivada no inicia pagos nuevos y la captura tardia cuenta en el evento viejo', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Vieja', 1);
      const order = await quoteAndOrder(guest, event.slug);

      const reset = await org.post('/api/demo/reset');
      expect(reset.statusCode).toBe(200);
      const nuevo = body<{ event: FiestaEvent }>(reset).event;

      const blocked = await guest.post(`/api/orders/${order.orderId}/capture`);
      expect(blocked.statusCode).toBe(409);
      expect(fake.captureCalls.filter((c) => c.paypalOrderId === order.orderId)).toHaveLength(0);

      // A capture that was already in flight at PayPal still reconciles, on the old event.
      await fake.captureOrder({ paypalOrderId: order.orderId, requestId: 'externo' });
      expect((await guest.post(`/api/orders/${order.orderId}/capture`)).statusCode).toBe(200);

      expect(await ledger('capture', order.orderId)).toEqual({ rows: 1, cents: 5000 });
      expect(await collected(org, event.slug)).toBe(5000);
      expect(await collected(org, nuevo.slug)).toBe(0);
      expect(await auditOf(event.slug)).toContain('payment_captured_stale_order');
    });
  });

  describe('webhooks fuera de orden se reintentan en vez de perderse', () => {
    race('un reembolso anterior a la captura pide reintento y se aplica al reenviarse', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Adelantado', 1);
      const order = await quoteAndOrder(guest, event.slug);

      await fake.captureOrder({ paypalOrderId: order.orderId, requestId: 'externo' });
      const captureId = fake.captureIdOf(order.orderId);
      const refund = fake.addRefund(captureId, 2000);
      const refundHookId = nextWebhookId();

      const early = await webhook(guest, 'PAYMENT.CAPTURE.REFUNDED', { id: refund.id }, refundHookId);
      expect(early.statusCode).toBe(503);
      expect(await webhookRecorded(refundHookId)).toBe(false);
      expect((await ledger('refund', order.orderId)).rows).toBe(0);

      // The capture notification catches up...
      const capture = await webhook(guest, 'PAYMENT.CAPTURE.COMPLETED', captureResource(captureId, order.orderId));
      expect(capture.statusCode).toBe(200);
      expect(await collected(org, event.slug)).toBe(5000);

      // ...and PayPal's redelivery of the very same notification now applies.
      const redelivered = await webhook(guest, 'PAYMENT.CAPTURE.REFUNDED', { id: refund.id }, refundHookId);
      expect(redelivered.statusCode).toBe(200);
      expect(await webhookRecorded(refundHookId)).toBe(true);
      expect(await ledger('refund', order.orderId)).toEqual({ rows: 1, cents: 2000 });
      expect(await collected(org, event.slug)).toBe(3000);
    });

    race('una captura ya reembolsada en PayPal se contabiliza por su importe original', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Parcial', 1);
      const order = await quoteAndOrder(guest, event.slug);

      await fake.captureOrder({ paypalOrderId: order.orderId, requestId: 'externo' });
      const captureId = fake.captureIdOf(order.orderId);
      const refund = fake.addRefund(captureId, 2000);

      // By the time the capture notification arrives, PayPal already shows it as refunded.
      fake.tamper = { captureStatus: 'PARTIALLY_REFUNDED' };
      const late = await webhook(guest, 'PAYMENT.CAPTURE.COMPLETED', captureResource(captureId, order.orderId));
      fake.tamper = {};

      expect(late.statusCode).toBe(200);
      expect(await ledger('capture', order.orderId)).toEqual({ rows: 1, cents: 5000 });
      expect(await collected(org, event.slug)).toBe(5000);

      expect((await webhook(guest, 'PAYMENT.CAPTURE.REFUNDED', { id: refund.id })).statusCode).toBe(200);
      expect(await collected(org, event.slug)).toBe(3000);
    });

    race('CHECKOUT.ORDER.COMPLETED se verifica con getOrder antes de contar', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Completada', 1);

      const unknownId = nextWebhookId();
      const unknown = await webhook(guest, 'CHECKOUT.ORDER.COMPLETED', { id: 'ORD-INEXISTENTE' }, unknownId);
      expect(unknown.statusCode).toBe(503);
      expect(await webhookRecorded(unknownId)).toBe(false);

      const order = await quoteAndOrder(guest, event.slug);
      const hookId = nextWebhookId();

      // Known order, but PayPal reports no capture yet: nothing is counted and nothing is lost.
      const premature = await webhook(guest, 'CHECKOUT.ORDER.COMPLETED', { id: order.orderId }, hookId);
      expect(premature.statusCode).toBe(503);
      expect(await webhookRecorded(hookId)).toBe(false);
      expect((await ledger('capture', order.orderId)).rows).toBe(0);
      expect(await collected(org, event.slug)).toBe(0);

      await fake.captureOrder({ paypalOrderId: order.orderId, requestId: 'externo' });
      const applied = await webhook(guest, 'CHECKOUT.ORDER.COMPLETED', { id: order.orderId }, hookId);
      expect(applied.statusCode).toBe(200);
      expect(await ledger('capture', order.orderId)).toEqual({ rows: 1, cents: 5000 });
      expect(await collected(org, event.slug)).toBe(5000);
    });

    race('PAYMENT.CAPTURE.DECLINED no marca pagado y concilia de forma segura', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Declinada', 1);
      const order = await quoteAndOrder(guest, event.slug);

      const declined = await webhook(guest, 'PAYMENT.CAPTURE.DECLINED', captureResource('CAP-RECHAZADA', order.orderId));
      expect(declined.statusCode).toBe(200);
      expect((await ledger('capture', order.orderId)).rows).toBe(0);
      expect((await orderOf(event.slug, 'Declinada')).status).toBe('created');
      expect(await collected(org, event.slug)).toBe(0);
      expect(await auditOf(event.slug)).toContain('payment_capture_declined');

      // An unknown order is a race, not a verdict: retried, not consumed.
      const orphanId = nextWebhookId();
      const orphan = await webhook(
        guest,
        'PAYMENT.CAPTURE.DECLINED',
        captureResource('CAP-HUERFANA', 'ORD-INEXISTENTE'),
        orphanId,
      );
      expect(orphan.statusCode).toBe(503);
      expect(await webhookRecorded(orphanId)).toBe(false);
    });

    race('un reverso no se lee como reembolso ni inventa un importe', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Reverso', 1);
      const order = await quoteAndOrder(guest, event.slug);
      expect((await guest.post(`/api/orders/${order.orderId}/capture`)).statusCode).toBe(200);

      const captureId = fake.captureIdOf(order.orderId);
      // A refund object exists for this capture; a reversal must not be resolved through it.
      const decoy = fake.addRefund(captureId, 1000);
      const lookupsBefore = fake.refundCalls.length;

      const reversed = await webhook(
        guest,
        'PAYMENT.CAPTURE.REVERSED',
        { id: decoy.id, supplementary_data: { related_ids: { order_id: order.orderId } } },
      );
      expect(reversed.statusCode).toBe(200);
      expect(fake.refundCalls.slice(lookupsBefore)).toEqual([]);
      expect((await ledger('refund', order.orderId)).rows).toBe(0);
      expect(await collected(org, event.slug)).toBe(5000);
      expect(await auditOf(event.slug)).toContain('payment_reversal_manual');
    });
  });

  describe('reembolsos duplicados y concurrentes', () => {
    race('un reembolso total reenviado con otro id de notificacion es un duplicado, no un exceso', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Duplicado', 1);
      const order = await quoteAndOrder(guest, event.slug);
      expect((await guest.post(`/api/orders/${order.orderId}/capture`)).statusCode).toBe(200);

      const refund = fake.addRefund(fake.captureIdOf(order.orderId), 5000);
      expect((await webhook(guest, 'PAYMENT.CAPTURE.REFUNDED', { id: refund.id })).statusCode).toBe(200);
      expect(await collected(org, event.slug)).toBe(0);

      // PayPal redelivers the same refund under a different notification id.
      const again = await webhook(guest, 'PAYMENT.CAPTURE.REFUNDED', { id: refund.id });
      expect(again.statusCode).toBe(200);
      expect(await ledger('refund', order.orderId)).toEqual({ rows: 1, cents: 5000 });
      expect(await collected(org, event.slug)).toBe(0);
      // A duplicate is not a rejection: nothing was flagged for reconciliation.
      expect(await auditOf(event.slug)).not.toContain('payment_webhook_rejected');
    });

    race('dos reembolsos distintos concurrentes no pueden superar lo capturado', async () => {
      const { client: org, event } = await organizer();
      const guest = await guestOn(event.slug, 'Concurrente', 1);
      const order = await quoteAndOrder(guest, event.slug);
      expect((await guest.post(`/api/orders/${order.orderId}/capture`)).statusCode).toBe(200);

      const captureId = fake.captureIdOf(order.orderId);
      const uno = fake.addRefund(captureId, 3000);
      const dos = fake.addRefund(captureId, 3000);

      const [a, b] = await Promise.all([
        webhook(guest, 'PAYMENT.CAPTURE.REFUNDED', { id: uno.id }),
        webhook(guest, 'PAYMENT.CAPTURE.REFUNDED', { id: dos.id }),
      ]);
      for (const res of [a, b]) expect(res.statusCode).toBe(200);

      const refunds = await ledger('refund', order.orderId);
      expect(refunds.rows).toBe(1);
      expect(refunds.cents).toBeLessThanOrEqual(5000);
      expect(await collected(org, event.slug)).toBe(2000);
      // The one that could not fit was flagged rather than silently dropped.
      expect(await auditOf(event.slug)).toContain('payment_webhook_rejected');
    });
  });
});
