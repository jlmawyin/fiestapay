import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Dashboard, FiestaEvent, OrderResult, Quote } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { FakePayPal } from './fake-paypal.js';
import { announceSkipWithoutDatabase, body, Client, DATABASE_URL, MERCHANT, testConfig } from './harness.js';

announceSkipWithoutDatabase('payment-activity.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

/**
 * Organizer-facing ledger/notification evidence. The dashboard must show exactly the verified
 * money of the authorized event, and a signed webhook must leave its closed receipt type in the
 * event audit log atomically with the deduplicated webhook id.
 */
describeDb('actividad de pagos y evidencia de avisos PayPal', () => {
  const schema = `fp_activity_${randomBytes(5).toString('hex')}`;
  let pool: Pool;
  let adminPool: Pool;
  let app: FastifyInstance;
  let fake: FakePayPal;
  let webhookSeq = 0;

  const nextWebhookId = (): string => `WHA-${++webhookSeq}-${randomBytes(3).toString('hex')}`;

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

  async function quoteAndOrder(client: Client, slug: string): Promise<OrderResult> {
    const quoteRes = await client.post(`/api/events/${slug}/quote`);
    expect(quoteRes.statusCode).toBe(200);
    const { quote } = body<{ quote: Quote }>(quoteRes);
    const orderRes = await client.post(`/api/events/${slug}/orders`, { quoteId: quote.id, confirmed: true });
    expect(orderRes.statusCode).toBe(200);
    return body<OrderResult>(orderRes);
  }

  const webhook = (
    client: Client,
    eventType: string,
    resource: Record<string, unknown>,
    id: string = nextWebhookId(),
  ) => client.post('/api/paypal/webhook', { id, event_type: eventType, resource });

  async function ledgerOf(eventId: string): Promise<{ kind: string; amount_cents: number; capture_id: string }[]> {
    const { rows } = await pool.query<{ kind: string; amount_cents: number; capture_id: string }>(
      'SELECT kind, amount_cents, capture_id FROM payment_ledger WHERE event_id = $1 ORDER BY created_at, kind',
      [eventId],
    );
    return rows;
  }

  async function receiptCount(eventId: string, action: string): Promise<number> {
    const { rows } = await pool.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM audit_log WHERE event_id = $1 AND action = $2',
      [eventId, action],
    );
    return rows[0]?.n ?? 0;
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

  it('muestra solo el libro verificado del evento autorizado, con centavos y tipos históricos', async () => {
    const { client: orgA, event: eventA } = await organizer();
    const guestA = await guestOn(eventA.slug, 'Ana Histórica', 1);
    const orderA = await quoteAndOrder(guestA, eventA.slug);
    await fake.captureOrder({ paypalOrderId: orderA.orderId, requestId: 'activity-a' });
    const captureIdA = fake.captureIdOf(orderA.orderId);

    // All three closed types succeed for event A: order completion, capture completion (a
    // redelivery of the same money), and a verified partial refund.
    expect((await webhook(guestA, 'CHECKOUT.ORDER.COMPLETED', { id: orderA.orderId })).statusCode).toBe(200);
    expect((await webhook(guestA, 'PAYMENT.CAPTURE.COMPLETED', {
      id: captureIdA,
      supplementary_data: { related_ids: { order_id: orderA.orderId } },
    })).statusCode).toBe(200);
    const refundA = fake.addRefund(captureIdA, 1200);
    expect((await webhook(guestA, 'PAYMENT.CAPTURE.REFUNDED', { id: refundA.id })).statusCode).toBe(200);

    // A second organizer has real money too; it must never leak into event A.
    const { client: orgB, event: eventB } = await organizer();
    const guestB = await guestOn(eventB.slug, 'Otra Persona', 0);
    const orderB = await quoteAndOrder(guestB, eventB.slug);
    expect((await guestB.post(`/api/orders/${orderB.orderId}/capture`)).statusCode).toBe(200);

    // Historical rows: the dashboard reads the ledger as recorded, not only today's activity.
    await pool.query(
      `UPDATE payment_ledger
          SET created_at = CASE kind
            WHEN 'capture' THEN '2024-01-02T03:04:05Z'::timestamptz
            ELSE '2024-02-03T04:05:06Z'::timestamptz
          END
        WHERE event_id = $1`,
      [eventA.id],
    );

    const res = await orgA.get(`/api/events/${eventA.slug}/dashboard`);
    expect(res.statusCode).toBe(200);
    const dash = body<Dashboard>(res);

    expect(dash.paymentActivity).toHaveLength(2);
    expect(dash.paymentActivity?.map((item) => ({
      kind: item.kind,
      guestName: item.guestName,
      amountCents: item.amountCents,
      captureId: item.captureId,
      createdAt: item.createdAt,
    }))).toEqual([
      {
        kind: 'refund',
        guestName: 'Ana Histórica',
        amountCents: 1200,
        captureId: captureIdA,
        createdAt: '2024-02-03T04:05:06.000Z',
      },
      {
        kind: 'capture',
        guestName: 'Ana Histórica',
        amountCents: 5000,
        captureId: captureIdA,
        createdAt: '2024-01-02T03:04:05.000Z',
      },
    ]);
    expect(dash.paymentActivity?.some((item) => item.guestName === 'Otra Persona')).toBe(false);
    // Guest counts and the existing orders DTO are preserved.
    expect(dash.guests).toHaveLength(1);
    expect(dash.guestTotals).toEqual({ people: 2, paidCents: 3800, dueCents: 1200 });
    expect(dash.payments).toHaveLength(1);
    expect(dash.payments?.[0]).toMatchObject({ guestName: 'Ana Histórica', amountCents: 5000, status: 'paid' });

    expect(dash.paypalNotifications).toHaveLength(3);
    expect(new Set(dash.paypalNotifications?.map((item) => item.type))).toEqual(new Set([
      'CHECKOUT.ORDER.COMPLETED',
      'PAYMENT.CAPTURE.COMPLETED',
      'PAYMENT.CAPTURE.REFUNDED',
    ]));
    for (const notification of dash.paypalNotifications ?? []) {
      expect(Number.isNaN(Date.parse(notification.receivedAt))).toBe(false);
    }
    expect(await ledgerOf(eventA.id)).toHaveLength(2);

    const wrongKey = new Client(app);
    wrongKey.authorize(eventA.slug, 'not-the-organizer-key');
    expect((await wrongKey.get(`/api/events/${eventA.slug}/dashboard`)).statusCode).toBe(403);
    expect((await new Client(app).get(`/api/events/${eventA.slug}/dashboard`)).statusCode).toBe(403);

    const dashB = body<Dashboard>(await orgB.get(`/api/events/${eventB.slug}/dashboard`));
    expect(dashB.paymentActivity).toHaveLength(1);
    expect(dashB.paymentActivity?.[0]).toMatchObject({ kind: 'capture', guestName: 'Otra Persona', amountCents: 2500 });
  });

  it('deduplica entregas concurrentes y repetidas del mismo aviso sin duplicar dinero ni evidencia', async () => {
    const { client: org, event } = await organizer();
    const guest = await guestOn(event.slug, 'Concurrente', 1);
    const order = await quoteAndOrder(guest, event.slug);
    await fake.captureOrder({ paypalOrderId: order.orderId, requestId: 'activity-concurrent' });
    const captureId = fake.captureIdOf(order.orderId);
    const hookId = `WH-CONCURRENT-${randomBytes(4).toString('hex')}`;
    const resource = {
      id: captureId,
      supplementary_data: { related_ids: { order_id: order.orderId } },
    };

    const [one, two] = await Promise.all([
      webhook(guest, 'PAYMENT.CAPTURE.COMPLETED', resource, hookId),
      webhook(guest, 'PAYMENT.CAPTURE.COMPLETED', resource, hookId),
    ]);
    expect(one.statusCode).toBe(200);
    expect(two.statusCode).toBe(200);

    const events = await pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM webhook_events WHERE id = $1', [hookId]);
    expect(events.rows[0]?.n).toBe(1);
    expect(await receiptCount(event.id, 'paypal_notification:PAYMENT.CAPTURE.COMPLETED')).toBe(1);

    const ledger = await pool.query<{ n: number; cents: string }>(
      `SELECT COUNT(*)::int AS n, COALESCE(SUM(amount_cents), 0)::text AS cents
         FROM payment_ledger
        WHERE event_id = $1 AND kind = 'capture'`,
      [event.id],
    );
    expect(ledger.rows[0]?.n).toBe(1);
    expect(Number(ledger.rows[0]?.cents)).toBe(5000);

    const repeated = await webhook(guest, 'PAYMENT.CAPTURE.COMPLETED', resource, hookId);
    expect(repeated.statusCode).toBe(200);
    expect(body<{ duplicate?: boolean }>(repeated).duplicate).toBe(true);
    expect(await receiptCount(event.id, 'paypal_notification:PAYMENT.CAPTURE.COMPLETED')).toBe(1);

    const dash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
    expect(dash.paymentActivity).toHaveLength(1);
    expect(dash.paymentActivity?.[0]).toMatchObject({ kind: 'capture', amountCents: 5000 });
    expect(dash.paypalNotifications).toHaveLength(1);
    // Webhook ids and provider payloads stay private; the capture reference is the
    // intentional reconciliation field in the DTO.
    expect(JSON.stringify(dash)).not.toContain(hookId);
  });

  it('no registra evidencia de un aviso rechazado y la guarda cuando el reenvío concilia', async () => {
    const { client: org, event } = await organizer();
    const guest = await guestOn(event.slug, 'Reenviada', 1);
    const order = await quoteAndOrder(guest, event.slug);

    // Invalid signature: rejected before any database write.
    fake.signatureValid = false;
    const rejectedId = `WH-INVALID-${randomBytes(4).toString('hex')}`;
    const rejected = await webhook(guest, 'PAYMENT.CAPTURE.COMPLETED', { id: 'CAP-NO' }, rejectedId);
    fake.signatureValid = true;
    expect(rejected.statusCode).toBe(400);
    expect((await pool.query('SELECT id FROM webhook_events WHERE id = $1', [rejectedId])).rows).toHaveLength(0);
    expect(await receiptCount(event.id, 'paypal_notification:PAYMENT.CAPTURE.COMPLETED')).toBe(0);

    // A refund that arrives before its capture is retried, then accepted on the same redelivery.
    await fake.captureOrder({ paypalOrderId: order.orderId, requestId: 'activity-redelivery' });
    const captureId = fake.captureIdOf(order.orderId);
    const refund = fake.addRefund(captureId, 1500);
    const refundHookId = `WH-REDELIVERY-${randomBytes(4).toString('hex')}`;

    const early = await webhook(guest, 'PAYMENT.CAPTURE.REFUNDED', { id: refund.id }, refundHookId);
    expect(early.statusCode).toBe(503);
    expect((await pool.query('SELECT id FROM webhook_events WHERE id = $1', [refundHookId])).rows).toHaveLength(0);
    expect(await receiptCount(event.id, 'paypal_notification:PAYMENT.CAPTURE.REFUNDED')).toBe(0);

    expect((await webhook(guest, 'PAYMENT.CAPTURE.COMPLETED', {
      id: captureId,
      supplementary_data: { related_ids: { order_id: order.orderId } },
    })).statusCode).toBe(200);
    expect((await webhook(guest, 'PAYMENT.CAPTURE.REFUNDED', { id: refund.id }, refundHookId)).statusCode).toBe(200);
    expect(await receiptCount(event.id, 'paypal_notification:PAYMENT.CAPTURE.COMPLETED')).toBe(1);
    expect(await receiptCount(event.id, 'paypal_notification:PAYMENT.CAPTURE.REFUNDED')).toBe(1);

    expect((await webhook(guest, 'PAYMENT.CAPTURE.REFUNDED', { id: refund.id }, refundHookId)).statusCode).toBe(200);
    expect(await receiptCount(event.id, 'paypal_notification:PAYMENT.CAPTURE.REFUNDED')).toBe(1);
    expect(await ledgerOf(event.id)).toEqual([
      { kind: 'capture', amount_cents: 5000, capture_id: captureId },
      { kind: 'refund', amount_cents: 1500, capture_id: captureId },
    ]);

    const dash = body<Dashboard>(await org.get(`/api/events/${event.slug}/dashboard`));
    expect(dash.paypalNotifications?.map((item) => item.type)).toEqual([
      'PAYMENT.CAPTURE.REFUNDED',
      'PAYMENT.CAPTURE.COMPLETED',
    ]);
  });
});
