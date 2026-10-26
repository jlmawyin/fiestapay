import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Dashboard, FiestaEvent, Quote } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { completeLeasedRefund, runFundingPass, startFundingLoop } from '../src/domain/funding-refunds.js';
import { setFundingClockForTests } from '../src/domain/funding.js';
import { convergeRefund } from '../src/domain/payments.js';
import { PayPalError } from '../src/paypal/types.js';
import { FakePayPal } from './fake-paypal.js';
import { announceSkipWithoutDatabase, body, Client, DATABASE_URL, MERCHANT, testConfig } from './harness.js';

announceSkipWithoutDatabase('funding.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

/**
 * The injectable clock stays after the real wall clock so a task's database
 * default next_attempt_at (real now) is already due. Deadlines are pinned in
 * SQL: the request schema compares dates with Date.now(), which is not the clock under test.
 */
const CLOCK_START = '2026-12-01T15:00:00.000Z';
const DEADLINE = '2026-12-01T16:00:00.000Z';
const START = '2026-12-15T18:00:00.000Z';
const END = '2026-12-15T22:00:00.000Z';
const CASE_MS = 60_000;

process.env.NODE_ENV = 'test';

interface FundingRow {
  id: string;
  funding_status: string;
  funding_deadline_at: Date | null;
  funding_basis_cents: number | null;
  funding_decided_at: Date | null;
  confirmed: boolean;
  closed_at: Date | null;
  price_cents: number;
  minimum_cents: number | null;
  title: string;
  purged_at: Date | null;
}

interface TaskRow {
  id: string;
  capture_id: string;
  amount_cents: number;
  request_id: string;
  request_body: string;
  status: string;
  paypal_refund_id: string | null;
  attempt_count: number;
  lease_token: string | null;
}

interface LedgerRow {
  kind: string;
  amount_cents: number;
  capture_id: string;
  external_id: string;
  created_at: Date;
}

describeDb('financiamiento con minimo y reembolso automatico', () => {
  const schema = `fp_fund_${randomBytes(4).toString('hex')}`;
  let pool: Pool;
  let adminPool: Pool;
  let app: FastifyInstance;
  let fake: FakePayPal;
  let clock = new Date(CLOCK_START);
  let webhookSeq = 0;

  const at = (iso: string): void => {
    clock = new Date(iso);
  };

  const pass = () => runFundingPass(pool, fake, { backoffMs: () => 0, leaseMs: 120_000, timeoutMs: 1_000 });

  function eventBody(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      title: 'Fondo',
      template: 'evento',
      meal: 'cena',
      description: 'Minimo',
      startsAt: START,
      endsAt: END,
      location: 'Quito',
      includes: ['Entrada'],
      priceCents: 2500,
      capacity: 8,
      goalCents: 10_000,
      minimumCents: 5000,
      agenda: [{ time: '18:00', title: 'Apertura' }],
      ...over,
    };
  }

  function inputFrom(event: FiestaEvent, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      title: event.title,
      template: event.template,
      meal: event.meal,
      description: event.description,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      location: event.location,
      includes: event.includes,
      agenda: event.agenda,
      priceCents: event.priceCents,
      capacity: event.capacity,
      goalCents: event.goalCents,
      minimumCents: event.minimumCents,
      ...extra,
    };
  }

  async function organizer(over: Record<string, unknown> = {}): Promise<{ client: Client; event: FiestaEvent }> {
    const client = new Client(app);
    const res = await client.post('/api/events', eventBody(over));
    expect(res.statusCode, res.body).toBe(200);
    return { client, event: body<{ event: FiestaEvent }>(res).event };
  }

  async function pinDeadline(slug: string, iso = DEADLINE): Promise<void> {
    const updated = await pool.query(
      `UPDATE events SET funding_deadline_at = $2::timestamptz
        WHERE slug = $1 AND funding_status = 'open'`,
      [slug, iso],
    );
    expect(updated.rowCount).toBe(1);
  }

  async function fundingOf(slug: string): Promise<FundingRow> {
    const { rows } = await pool.query<FundingRow>(
      `SELECT id, funding_status, funding_deadline_at, funding_basis_cents, funding_decided_at,
              confirmed, closed_at, price_cents, minimum_cents, title, purged_at
         FROM events WHERE slug = $1`,
      [slug],
    );
    const row = rows[0];
    if (!row) throw new Error(`sin evento ${slug}`);
    return row;
  }

  async function tasksOf(eventId: string): Promise<TaskRow[]> {
    const { rows } = await pool.query<TaskRow>(
      `SELECT id, capture_id, amount_cents, request_id, request_body, status, paypal_refund_id,
              attempt_count, lease_token
         FROM funding_refund_tasks WHERE event_id = $1 ORDER BY created_at, id`,
      [eventId],
    );
    return rows;
  }

  async function ledgerOf(eventId: string): Promise<LedgerRow[]> {
    const { rows } = await pool.query<LedgerRow>(
      `SELECT kind, amount_cents, capture_id, external_id, created_at
         FROM payment_ledger WHERE event_id = $1 ORDER BY created_at, kind`,
      [eventId],
    );
    return rows;
  }

  async function paypalOrderId(slug: string, guestName: string): Promise<string> {
    const { rows } = await pool.query<{ paypal_order_id: string }>(
      `SELECT o.paypal_order_id
         FROM orders o
         JOIN guests g ON g.id = o.guest_id
         JOIN events e ON e.id = g.event_id
        WHERE e.slug = $1 AND g.name = $2 AND o.paypal_order_id IS NOT NULL
        ORDER BY o.created_at DESC LIMIT 1`,
      [slug, guestName],
    );
    const id = rows[0]?.paypal_order_id;
    if (!id) throw new Error(`sin orden PayPal para ${guestName}`);
    return id;
  }

  async function pay(slug: string, name: string, companions = 0): Promise<{ guest: Client; paypalOrderId: string; captureId: string }> {
    const guest = new Client(app);
    expect((await guest.post(`/api/events/${slug}/join`, { name })).statusCode).toBe(200);
    expect((await guest.post(`/api/events/${slug}/rsvp`, { status: 'yes', companions })).statusCode).toBe(200);
    const quoted = await guest.post(`/api/events/${slug}/quote`);
    expect(quoted.statusCode, quoted.body).toBe(200);
    const quote = body<{ quote: Quote }>(quoted).quote;
    const ordered = await guest.post(`/api/events/${slug}/orders`, { quoteId: quote.id, confirmed: true });
    expect(ordered.statusCode, ordered.body).toBe(200);
    const paypalId = await paypalOrderId(slug, name);
    const captured = await guest.post(`/api/orders/${paypalId}/capture`);
    expect(captured.statusCode, captured.body).toBe(200);
    return { guest, paypalOrderId: paypalId, captureId: fake.captureIdOf(paypalId) };
  }

  async function dash(client: Client, slug: string): Promise<Dashboard> {
    const res = await client.get(`/api/events/${slug}/dashboard`);
    expect(res.statusCode, res.body).toBe(200);
    return body<Dashboard>(res);
  }

  async function postWebhook(resourceId: string, webhookId: string): Promise<{ statusCode: number; json: Record<string, unknown> }> {
    const raw = JSON.stringify({
      id: webhookId,
      event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: { id: resourceId },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/paypal/webhook',
      headers: {
        'content-type': 'application/json',
        'paypal-auth-algo': 'SHA256withRSA',
        'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT',
        'paypal-transmission-id': webhookId,
        'paypal-transmission-sig': 'sig',
        'paypal-transmission-time': '2026-12-01T16:00:00Z',
      },
      payload: raw,
    });
    return { statusCode: res.statusCode, json: res.json() as Record<string, unknown> };
  }

  async function waitForEventsLock(): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < 8_000) {
      const { rows } = await pool.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n
           FROM pg_locks l
           JOIN pg_class c ON c.oid = l.relation
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = $1 AND c.relname = 'events' AND NOT l.granted`,
        [schema],
      );
      if ((rows[0]?.n ?? 0) > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('la captura no quedo esperando el candado del evento');
  }

  beforeAll(async () => {
    pool = createPool({ connectionString: DATABASE_URL!, schema });
    adminPool = createPool({ connectionString: DATABASE_URL!, max: 2 });
    await migrate(pool, { schema });
    fake = new FakePayPal(MERCHANT);
    app = await buildApp({ pool, config: testConfig(), paypal: fake, logger: false });
    await app.ready();
  });

  beforeEach(async () => {
    clock = new Date(CLOCK_START);
    setFundingClockForTests(() => clock);
    fake.failRefund = null;
    fake.loseNextRefundResponse = false;
    fake.nextRefundStatus = 'COMPLETED';
    fake.refundGate = null;
    fake.captureGate = null;
    fake.createGate = null;
    fake.signatureValid = true;
    await pool.query(
      `UPDATE funding_refund_tasks SET status = 'rejected'
        WHERE status IN ('pending', 'leased', 'pending_provider')`,
    );
    await pool.query(
      `UPDATE events SET funding_deadline_at = $1::timestamptz
        WHERE funding_status = 'open' AND funding_deadline_at IS DISTINCT FROM $1::timestamptz`,
      [START],
    );
  });

  afterEach(() => {
    setFundingClockForTests(null);
  });

  afterAll(async () => {
    setFundingClockForTests(null);
    await app?.close();
    await pool?.end();
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await adminPool.end();
    }
  });

  it('arma el minimo nuevo, estima la comision antes de cobrar y no recarga al invitado', async () => {
    const { event } = await organizer();
    expect(event.fundingStatus).toBe('open');
    expect(event.fundingDeadlineAt).toBe(new Date(START).toISOString());
    expect(event.fundingBasisCents).toBeNull();
    expect(event.paidPeople).toBe(0);
    expect(event.refundSummary).toEqual({
      refundedCents: 0,
      pendingCents: 0,
      needsReviewCents: 0,
      outstandingCents: 0,
    });

    const idle = await organizer({ minimumCents: null, goalCents: null, title: 'Sin minimo' });
    expect(idle.event.fundingStatus).toBe('inactive');
    expect(idle.event.fundingDeadlineAt).toBeNull();

    const tooSoon = await new Client(app).post('/api/events', eventBody({ fundingDeadlineAt: '2026-12-01T12:00:00.000Z' }));
    expect(tooSoon.statusCode).toBe(400);

    const guest = new Client(app);
    expect((await guest.post(`/api/events/${event.slug}/join`, { name: 'Pareja' })).statusCode).toBe(200);
    expect((await guest.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 1 })).statusCode).toBe(200);
    const quoted = body<{ quote: Quote }>(await guest.post(`/api/events/${event.slug}/quote`)).quote;
    expect(quoted.people).toBe(2);
    expect(quoted.amountCents).toBe(5000);
    expect(quoted.feeEstimate).toMatchObject({
      estimate: true,
      feeCents: 300,
      netCents: 4700,
      rateBps: 540,
      fixedCents: 30,
      absorber: 'organizer',
      currency: 'USD',
    });
    expect(quoted.feeEstimate?.provenance).toContain('2026-09-28');

    const solo = new Client(app);
    expect((await solo.post(`/api/events/${idle.event.slug}/join`, { name: 'Solo' })).statusCode).toBe(200);
    expect((await solo.post(`/api/events/${idle.event.slug}/rsvp`, { status: 'yes', companions: 0 })).statusCode).toBe(200);
    const first = body<{ quote: Quote }>(await solo.post(`/api/events/${idle.event.slug}/quote`)).quote;
    expect(first.amountCents).toBe(2500);
    expect((await solo.post(`/api/events/${idle.event.slug}/orders`, { quoteId: first.id, confirmed: true })).statusCode).toBe(200);
    const paypalId = await paypalOrderId(idle.event.slug, 'Solo');
    expect((await solo.post(`/api/orders/${paypalId}/capture`)).statusCode).toBe(200);
    const again = body<{ quote: Quote }>(await solo.post(`/api/events/${idle.event.slug}/quote`)).quote;
    expect(again.amountCents).toBe(0);
    expect(again.feeEstimate).toMatchObject({ feeCents: 0, netCents: 0, estimate: true });
  }, CASE_MS);

  it('no cuenta a la fiesta completa cuando un reembolso parcial deja saldo por debajo de la cuota', async () => {
    const { client: org, event } = await organizer({ title: 'Cupo parcial', minimumCents: null, goalCents: null });
    const party = await pay(event.slug, 'Pareja', 1);
    const covered = await dash(org, event.slug);
    expect(covered.event.confirmedPeople).toBe(2);
    expect(covered.event.collectedCents).toBe(5000);
    expect(covered.event.paidPeople).toBe(2);

    const partial = fake.addRefund(party.captureId, 2500);
    expect((await convergeRefund(pool, fake, partial.id!)).applied).toBe(true);
    const short = await dash(org, event.slug);
    expect(short.event.collectedCents).toBe(2500);
    expect(short.event.confirmedPeople).toBe(2);
    expect(short.event.paidPeople).toBe(0);

    await pay(event.slug, 'Uno', 0);
    const mixed = await dash(org, event.slug);
    expect(mixed.event.collectedCents).toBe(5000);
    expect(mixed.event.paidPeople).toBe(1);
  }, CASE_MS);

  it('reembolsa el saldo verificado cuando el minimo no se alcanza y no lo presenta como devuelto antes', async () => {
    const { client: org, event } = await organizer();
    await pinDeadline(event.slug);
    const paid = await pay(event.slug, 'Ana');
    at(DEADLINE);
    const decided = await runFundingPass(pool, null, { backoffMs: () => 0 });
    expect(decided.decided).toBeGreaterThanOrEqual(1);
    const failed = await fundingOf(event.slug);
    expect(failed.funding_status).toBe('failed');
    expect(failed.funding_basis_cents).toBe(2500);
    expect(failed.confirmed).toBe(false);
    expect(failed.closed_at).not.toBeNull();
    const queued = await tasksOf(failed.id);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ amount_cents: 2500, request_body: '{}', status: 'pending', capture_id: paid.captureId });

    const mid = await dash(org, event.slug);
    expect(mid.event.confirmedPeople).toBe(1);
    expect(mid.event.paidPeople).toBe(1);
    expect(mid.event.collectedCents).toBe(2500);
    expect(mid.event.refundSummary).toMatchObject({
      refundedCents: 0,
      pendingCents: 2500,
      needsReviewCents: 0,
      outstandingCents: 2500,
    });
    expect((await paid.guest.post(`/api/events/${event.slug}/quote`)).statusCode).toBe(409);
    expect((await paid.guest.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 0 })).statusCode).toBe(409);
    expect((await org.post(`/api/events/${event.slug}/confirm`)).statusCode).toBe(409);
    const stillYes = await pool.query<{ status: string }>(
      `SELECT g.status FROM guests g JOIN events e ON e.id = g.event_id WHERE e.slug = $1 AND g.session_id IS NOT NULL`,
      [event.slug],
    );
    expect(stillYes.rows.every((row) => row.status === 'yes')).toBe(true);

    const done = await pass();
    expect(done.refunded).toBeGreaterThanOrEqual(1);
    const calls = fake.refundCaptureCalls.filter((call) => call.captureId === paid.captureId);
    expect(calls).toEqual([expect.objectContaining({ body: '{}', requestId: queued[0]!.request_id })]);
    const after = await dash(org, event.slug);
    expect(after.event.fundingStatus).toBe('failed');
    expect(after.event.paidPeople).toBe(0);
    expect(after.event.confirmedPeople).toBe(1);
    expect(after.event.collectedCents).toBe(0);
    expect(after.event.refundSummary).toMatchObject({
      refundedCents: 2500,
      pendingCents: 0,
      needsReviewCents: 0,
      outstandingCents: 0,
    });
    expect((await tasksOf(failed.id))[0]?.status).toBe('refunded');
    const rows = await ledgerOf(failed.id);
    expect(rows.filter((row) => row.kind === 'refund')).toHaveLength(1);
  }, CASE_MS);

  it('falla en USD 49.99, financia en USD 50 y no revierte un evento ya financiado', async () => {
    const short = await organizer({
      title: 'Casi',
      priceCents: 4999,
      capacity: 2,
      goalCents: null,
      minimumCents: 5000,
    });
    await pinDeadline(short.event.slug);
    await pay(short.event.slug, 'Casi');
    at(DEADLINE);
    await pass();
    const shortRow = await fundingOf(short.event.slug);
    expect(shortRow.funding_status).toBe('failed');
    expect(shortRow.funding_basis_cents).toBe(4999);
    expect(await tasksOf(shortRow.id)).toHaveLength(1);

    at(CLOCK_START);
    const exact = await organizer({
      title: 'Justo',
      priceCents: 5000,
      capacity: 1,
      goalCents: null,
      minimumCents: 5000,
    });
    await pinDeadline(exact.event.slug);
    const payer = await pay(exact.event.slug, 'Justo');
    at(DEADLINE);
    await pass();
    const funded = await fundingOf(exact.event.slug);
    expect(funded.funding_status).toBe('funded');
    expect(funded.funding_basis_cents).toBe(5000);
    expect(funded.confirmed).toBe(false);
    expect(await tasksOf(funded.id)).toHaveLength(0);

    const partial = fake.addRefund(payer.captureId, 2500);
    const applied = await convergeRefund(pool, fake, partial.id!);
    expect(applied.applied).toBe(true);
    const still = await fundingOf(exact.event.slug);
    expect(still.funding_status).toBe('funded');
    expect(still.funding_basis_cents).toBe(5000);
    expect((await dash(exact.client, exact.event.slug)).event.collectedCents).toBe(2500);
    const confirmed = await exact.client.post(`/api/events/${exact.event.slug}/confirm`);
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    expect(body<{ event: FiestaEvent }>(confirmed).event.confirmed).toBe(true);
    expect((await fundingOf(exact.event.slug)).funding_status).toBe('funded');
  }, CASE_MS);

  it('no decide un milisegundo antes y cierra en el instante exacto de la fecha limite', async () => {
    const { event } = await organizer({ title: 'Reloj' });
    await pinDeadline(event.slug);
    await pay(event.slug, 'Antes');
    at('2026-12-01T15:59:59.999Z');
    await pass();
    expect((await fundingOf(event.slug)).funding_status).toBe('open');
    expect((await fundingOf(event.slug)).funding_basis_cents).toBeNull();

    at(DEADLINE);
    await pass();
    const row = await fundingOf(event.slug);
    expect(row.funding_status).toBe('failed');
    expect(row.funding_basis_cents).toBe(2500);
    expect(row.funding_decided_at?.toISOString()).toBe(DEADLINE);
  }, CASE_MS);

  it('al soltar el candado usa el reloj nuevo y no cuenta la captura tardia como si hubiera llegado a tiempo', async () => {
    const { event } = await organizer({ title: 'Candado' });
    await pinDeadline(event.slug);
    const early = await pay(event.slug, 'Temprano');
    const lateGuest = new Client(app);
    expect((await lateGuest.post(`/api/events/${event.slug}/join`, { name: 'Tarde' })).statusCode).toBe(200);
    expect((await lateGuest.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 0 })).statusCode).toBe(200);
    const quote = body<{ quote: Quote }>(await lateGuest.post(`/api/events/${event.slug}/quote`)).quote;
    expect((await lateGuest.post(`/api/events/${event.slug}/orders`, { quoteId: quote.id, confirmed: true })).statusCode).toBe(200);
    const lateOrder = await paypalOrderId(event.slug, 'Tarde');
    const lateCapture = fake.forceCaptured(lateOrder);
    const capturesBefore = fake.captureCalls.filter((call) => call.paypalOrderId === lateOrder).length;

    const holder = await pool.connect();
    const capturing = lateGuest.post(`/api/orders/${lateOrder}/capture`);
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT id FROM events WHERE slug = $1 FOR UPDATE', [event.slug]);
      await waitForEventsLock();
      at(DEADLINE);
      await holder.query('COMMIT');
    } finally {
      holder.release();
    }

    const captured = await capturing;
    expect(captured.statusCode, captured.body).toBe(200);
    expect(fake.captureCalls.filter((call) => call.paypalOrderId === lateOrder)).toHaveLength(capturesBefore);
    const row = await fundingOf(event.slug);
    expect(row.funding_status).toBe('failed');
    expect(row.funding_basis_cents).toBe(2500);
    const money = await ledgerOf(row.id);
    const earlyRow = money.find((item) => item.capture_id === early.captureId && item.kind === 'capture');
    const lateRow = money.find((item) => item.capture_id === lateCapture && item.kind === 'capture');
    expect(earlyRow?.created_at.getTime()).toBeLessThan(new Date(DEADLINE).getTime());
    expect(lateRow?.created_at.toISOString()).toBe(DEADLINE);
    expect(lateRow?.amount_cents).toBe(2500);
    const tasks = await tasksOf(row.id);
    expect(tasks.map((task) => task.capture_id).sort()).toEqual([early.captureId, lateCapture].sort());

    await pass();
    const refunds = (await ledgerOf(row.id)).filter((item) => item.kind === 'refund');
    expect(refunds).toHaveLength(2);
    expect(refunds.reduce((sum, item) => sum + item.amount_cents, 0)).toBe(5000);
    expect((await fundingOf(event.slug)).funding_status).toBe('failed');
    expect((await fundingOf(event.slug)).funding_basis_cents).toBe(2500);
  }, CASE_MS);

  it('un segundo worker no vuelve a cobrar el reembolso que el primero ya reclamo', async () => {
    const { event } = await organizer({ title: 'Dos workers' });
    await pinDeadline(event.slug);
    const paid = await pay(event.slug, 'Uno');
    at(DEADLINE);
    const gate = fake.gateRefund();
    const first = pass();
    await gate.arrived;
    const second = await pass();
    expect(second.claimed).toBe(0);
    expect(fake.refundCaptureCalls.filter((call) => call.captureId === paid.captureId)).toHaveLength(1);
    gate.open();
    const done = await first;
    expect(done.refunded).toBe(1);
    const calls = fake.refundCaptureCalls.filter((call) => call.captureId === paid.captureId);
    expect(calls).toHaveLength(1);
    expect(new Set(calls.map((call) => call.requestId)).size).toBe(1);
    const row = await fundingOf(event.slug);
    expect((await ledgerOf(row.id)).filter((item) => item.kind === 'refund')).toHaveLength(1);
    expect((await tasksOf(row.id))[0]?.status).toBe('refunded');
  }, CASE_MS);

  it('reintenta el mismo PayPal-Request-Id cuando la respuesta se pierde despues de completar', async () => {
    const { event } = await organizer({ title: 'Timeout' });
    await pinDeadline(event.slug);
    const paid = await pay(event.slug, 'Timeout');
    at(DEADLINE);
    fake.loseNextRefundResponse = true;
    const first = await pass();
    expect(first.refunded).toBe(0);
    expect(first.pending).toBeGreaterThanOrEqual(1);
    const row = await fundingOf(event.slug);
    expect((await ledgerOf(row.id)).some((item) => item.kind === 'refund')).toBe(false);
    const queued = (await tasksOf(row.id)).find((task) => task.capture_id === paid.captureId);
    expect(queued?.status).toBe('pending');
    expect(queued?.request_body).toBe('{}');

    const second = await pass();
    expect(second.refunded).toBeGreaterThanOrEqual(1);
    const calls = fake.refundCaptureCalls.filter((call) => call.captureId === paid.captureId);
    expect(calls).toHaveLength(2);
    expect(new Set(calls.map((call) => call.requestId)).size).toBe(1);
    expect(calls.every((call) => call.body === '{}')).toBe(true);
    expect(calls[1]?.requestId).toBe(queued?.request_id);
    const refunds = (await ledgerOf(row.id)).filter((item) => item.kind === 'refund');
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.amount_cents).toBe(2500);
    expect((await tasksOf(row.id))[0]?.status).toBe('refunded');
  }, CASE_MS);

  it('espera un reembolso PENDING y lo cierra con getRefund, sin un segundo POST', async () => {
    const { event } = await organizer({ title: 'Pendiente' });
    await pinDeadline(event.slug);
    const paid = await pay(event.slug, 'Pendiente');
    at(DEADLINE);
    fake.nextRefundStatus = 'PENDING';
    const first = await pass();
    expect(first.refunded).toBe(0);
    expect(first.pending).toBeGreaterThanOrEqual(1);
    const row = await fundingOf(event.slug);
    const task = (await tasksOf(row.id))[0];
    expect(task?.status).toBe('pending_provider');
    expect(task?.paypal_refund_id).toBeTruthy();
    expect((await ledgerOf(row.id)).some((item) => item.kind === 'refund')).toBe(false);
    const posts = fake.refundCaptureCalls.filter((call) => call.captureId === paid.captureId).length;
    const lookups = fake.refundCalls.length;

    const stored = fake.refunds.get(task!.paypal_refund_id!);
    expect(stored?.status).toBe('PENDING');
    stored!.status = 'COMPLETED';
    const second = await pass();
    expect(second.refunded).toBeGreaterThanOrEqual(1);
    expect(fake.refundCaptureCalls.filter((call) => call.captureId === paid.captureId)).toHaveLength(posts);
    expect(fake.refundCalls.length).toBeGreaterThan(lookups);
    expect((await tasksOf(row.id))[0]?.status).toBe('refunded');
    expect((await ledgerOf(row.id)).filter((item) => item.kind === 'refund')).toHaveLength(1);
  }, CASE_MS);

  it('no da por cerrado un 422 ni una respuesta sin identificador de reembolso', async () => {
    const unknownBefore = await pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM payment_ledger');
    await expect(convergeRefund(pool, fake, 'REF-NO-EXISTE')).rejects.toBeInstanceOf(PayPalError);
    const unknownAfter = await pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM payment_ledger');
    expect(unknownAfter.rows[0]?.n).toBe(unknownBefore.rows[0]?.n);

    const rejected = await organizer({ title: '422' });
    await pinDeadline(rejected.event.slug);
    const rejectedPay = await pay(rejected.event.slug, 'Cuatro');
    at(DEADLINE);
    fake.failRefund = '422';
    const review = await pass();
    expect(review.review).toBeGreaterThanOrEqual(1);
    expect(review.refunded).toBe(0);
    const rejectedRow = await fundingOf(rejected.event.slug);
    const rejectedTask = (await tasksOf(rejectedRow.id)).find((task) => task.capture_id === rejectedPay.captureId);
    expect(rejectedTask?.status).toBe('needs_review');
    expect((await ledgerOf(rejectedRow.id)).some((item) => item.kind === 'refund')).toBe(false);
    const posts = fake.refundCaptureCalls.filter((call) => call.captureId === rejectedPay.captureId).length;
    fake.failRefund = null;
    await pass();
    expect(fake.refundCaptureCalls.filter((call) => call.captureId === rejectedPay.captureId)).toHaveLength(posts);
    expect((await tasksOf(rejectedRow.id))[0]?.status).toBe('needs_review');

    at(CLOCK_START);
    const missing = await organizer({ title: 'Sin id' });
    await pinDeadline(missing.event.slug);
    const missingPay = await pay(missing.event.slug, 'SinId');
    at(DEADLINE);
    fake.failRefund = 'missing-id';
    const retry = await pass();
    expect(retry.refunded).toBe(0);
    expect(retry.pending).toBeGreaterThanOrEqual(1);
    const missingRow = await fundingOf(missing.event.slug);
    const missingTask = (await tasksOf(missingRow.id)).find((task) => task.capture_id === missingPay.captureId);
    expect(missingTask?.status).toBe('pending');
    expect((await ledgerOf(missingRow.id)).some((item) => item.kind === 'refund')).toBe(false);
  }, CASE_MS);

  it('ajusta un reembolso manual previo y no cambia la solicitud ya enviada si el proveedor la rechaza', async () => {
    const { client: org, event } = await organizer({ title: 'Parcial' });
    await pinDeadline(event.slug);
    const paid = await pay(event.slug, 'Parcial');
    at(DEADLINE);
    await runFundingPass(pool, null);
    const eventRow = await fundingOf(event.slug);
    const manual = fake.addRefund(paid.captureId, 1000);
    expect((await convergeRefund(pool, fake, manual.id!)).applied).toBe(true);
    const resized = (await tasksOf(eventRow.id))[0];
    expect(resized?.status).toBe('pending');
    expect(resized?.amount_cents).toBe(1500);
    expect(resized?.request_body).toBe('{"amount":{"currency_code":"USD","value":"15.00"}}');
    const done = await pass();
    expect(done.refunded).toBeGreaterThanOrEqual(1);
    const posted = fake.refundCaptureCalls.filter((call) => call.captureId === paid.captureId);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ requestId: resized?.request_id, body: resized?.request_body });
    const money = await ledgerOf(eventRow.id);
    expect(money.filter((item) => item.kind === 'refund').reduce((sum, item) => sum + item.amount_cents, 0)).toBe(2500);

    at(CLOCK_START);
    const raced = await organizer({ title: 'Carrera' });
    await pinDeadline(raced.event.slug);
    const racedPay = await pay(raced.event.slug, 'Carrera');
    at(DEADLINE);
    const gate = fake.gateRefund();
    const running = pass();
    await gate.arrived;
    const partial = fake.addRefund(racedPay.captureId, 1000);
    expect((await convergeRefund(pool, fake, partial.id!)).applied).toBe(true);
    const racedRow = await fundingOf(raced.event.slug);
    const frozen = (await tasksOf(racedRow.id)).find((task) => task.status === 'leased');
    expect(frozen?.request_body).toBe('{}');
    expect(frozen?.amount_cents).toBe(2500);
    fake.failRefund = '422';
    gate.open();
    const outcome = await running;
    expect(outcome.review).toBeGreaterThanOrEqual(1);
    const reviewed = (await tasksOf(racedRow.id))[0];
    expect(reviewed?.status).toBe('needs_review');
    expect(reviewed?.request_body).toBe('{}');
    expect(reviewed?.request_id).toBe(frozen?.request_id);
    expect(await pool.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM funding_refund_tasks WHERE capture_id = $1',
      [racedPay.captureId],
    )).toMatchObject({ rows: [{ n: 1 }] });
    const summary = (await dash(raced.client, raced.event.slug)).event.refundSummary;
    expect(summary).toMatchObject({
      refundedCents: 1000,
      pendingCents: 0,
      needsReviewCents: 2500,
      outstandingCents: 1500,
    });
    const calls = fake.refundCaptureCalls.filter((call) => call.captureId === racedPay.captureId).length;
    await pass();
    expect(fake.refundCaptureCalls.filter((call) => call.captureId === racedPay.captureId)).toHaveLength(calls);
    expect((await tasksOf(racedRow.id))[0]?.status).toBe('needs_review');
    expect(org).toBeTruthy();
  }, CASE_MS);

  it('aplica una sola vez el webhook duplicado y no reembolsa de mas', async () => {
    const { event } = await organizer({ title: 'Webhook', minimumCents: null, goalCents: null });
    const paid = await pay(event.slug, 'Webhook');
    const refund = fake.addRefund(paid.captureId, 2500);
    const webhookId = `WH-FUND-${++webhookSeq}`;
    const early = await postWebhook(refund.id!, webhookId);
    expect(early.statusCode).toBe(200);
    const direct = await convergeRefund(pool, fake, refund.id!);
    expect(direct.duplicate).toBe(true);
    const again = await postWebhook(refund.id!, webhookId);
    expect(again.statusCode).toBe(200);
    expect(again.json.duplicate).toBe(true);
    const row = await fundingOf(event.slug);
    const refunds = (await ledgerOf(row.id)).filter((item) => item.kind === 'refund');
    expect(refunds).toHaveLength(1);

    const extra = fake.addRefund(paid.captureId, 100);
    const overflow = await convergeRefund(pool, fake, extra.id!);
    expect(overflow.applied).toBe(false);
    expect(overflow.duplicate).toBe(false);
    expect((await ledgerOf(row.id)).filter((item) => item.kind === 'refund')).toHaveLength(1);
    expect((await fundingOf(event.slug)).funding_status).toBe('inactive');
  }, CASE_MS);

  it('borra antes de la fecha limite y aun asi registra y reembolsa una captura tardia', async () => {
    const { client: org, event } = await organizer({ title: 'Borrado' });
    await pinDeadline(event.slug);
    const early = await pay(event.slug, 'Queda');
    const lateGuest = new Client(app);
    expect((await lateGuest.post(`/api/events/${event.slug}/join`, { name: 'Despues' })).statusCode).toBe(200);
    expect((await lateGuest.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 0 })).statusCode).toBe(200);
    const quote = body<{ quote: Quote }>(await lateGuest.post(`/api/events/${event.slug}/quote`)).quote;
    expect((await lateGuest.post(`/api/events/${event.slug}/orders`, { quoteId: quote.id, confirmed: true })).statusCode).toBe(200);
    const lateOrder = await paypalOrderId(event.slug, 'Despues');
    const removed = await org.delete(`/api/events/${event.slug}`);
    expect(removed.statusCode, removed.body).toBe(200);
    const tombstone = await fundingOf(event.slug);
    expect(tombstone.title).toBe('Eliminado');
    expect(tombstone.purged_at).not.toBeNull();
    expect(tombstone.funding_status).toBe('open');
    expect(tombstone.price_cents).toBe(2500);
    expect(tombstone.minimum_cents).toBe(5000);
    expect(tombstone.funding_deadline_at?.toISOString()).toBe(DEADLINE);

    const lateCapture = fake.forceCaptured(lateOrder);
    const capturesBefore = fake.captureCalls.filter((call) => call.paypalOrderId === lateOrder).length;
    at(DEADLINE);
    const captured = await lateGuest.post(`/api/orders/${lateOrder}/capture`);
    expect(captured.statusCode, captured.body).toBe(200);
    expect(fake.captureCalls.filter((call) => call.paypalOrderId === lateOrder)).toHaveLength(capturesBefore);
    const failed = await fundingOf(event.slug);
    expect(failed.funding_status).toBe('failed');
    expect(failed.funding_basis_cents).toBe(2500);
    expect(failed.price_cents).toBe(2500);
    expect(failed.minimum_cents).toBe(5000);
    const lateMoney = (await ledgerOf(failed.id)).find((item) => item.capture_id === lateCapture && item.kind === 'capture');
    expect(lateMoney?.created_at.toISOString()).toBe(DEADLINE);
    expect((await tasksOf(failed.id)).map((task) => task.capture_id).sort()).toEqual([early.captureId, lateCapture].sort());

    await pass();
    const refunds = (await ledgerOf(failed.id)).filter((item) => item.kind === 'refund');
    expect(refunds).toHaveLength(2);
    expect(refunds.reduce((sum, item) => sum + item.amount_cents, 0)).toBe(5000);
    expect((await tasksOf(failed.id)).every((task) => task.status === 'refunded')).toBe(true);
    expect((await fundingOf(event.slug)).funding_basis_cents).toBe(2500);
  }, CASE_MS);

  it('registra una captura que llega despues del fallo y no reabre la decision', async () => {
    const { event } = await organizer({ title: 'Tardia' });
    await pinDeadline(event.slug);
    await pay(event.slug, 'Primero');
    const second = new Client(app);
    expect((await second.post(`/api/events/${event.slug}/join`, { name: 'Segundo' })).statusCode).toBe(200);
    expect((await second.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 0 })).statusCode).toBe(200);
    const quote = body<{ quote: Quote }>(await second.post(`/api/events/${event.slug}/quote`)).quote;
    expect((await second.post(`/api/events/${event.slug}/orders`, { quoteId: quote.id, confirmed: true })).statusCode).toBe(200);
    const lateOrder = await paypalOrderId(event.slug, 'Segundo');
    at(DEADLINE);
    await pass();
    expect((await fundingOf(event.slug)).funding_status).toBe('failed');
    const lateCapture = fake.forceCaptured(lateOrder);
    const capturesBefore = fake.captureCalls.filter((call) => call.paypalOrderId === lateOrder).length;
    const captured = await second.post(`/api/orders/${lateOrder}/capture`);
    expect(captured.statusCode, captured.body).toBe(200);
    expect(fake.captureCalls.filter((call) => call.paypalOrderId === lateOrder)).toHaveLength(capturesBefore);
    const row = await fundingOf(event.slug);
    expect(row.funding_status).toBe('failed');
    expect(row.funding_basis_cents).toBe(2500);
    const lateMoney = (await ledgerOf(row.id)).find((item) => item.kind === 'capture' && item.capture_id === lateCapture);
    expect(lateMoney?.created_at.getTime()).toBeGreaterThanOrEqual(new Date(DEADLINE).getTime());
    expect((await tasksOf(row.id)).some((task) => task.capture_id === lateCapture && task.status === 'pending')).toBe(true);
    await pass();
    expect((await fundingOf(event.slug)).funding_basis_cents).toBe(2500);
    expect((await tasksOf(row.id)).every((task) => task.status === 'refunded')).toBe(true);
  }, CASE_MS);

  it('no toca un legado sin fecha limite, ni al editar el titulo ni al mover el reloj', async () => {
    const sessionId = randomUUID();
    const eventId = randomUUID();
    const guestId = randomUUID();
    const quoteId = randomUUID();
    const orderId = randomUUID();
    const captureId = `CAP-GOLD-${orderId.slice(0, 8)}`;
    const slug = `gold-${randomBytes(3).toString('hex')}`;
    await pool.query('INSERT INTO sessions (id, token_hash) VALUES ($1, $2)', [sessionId, randomBytes(32)]);
    await pool.query(
      `INSERT INTO events (id, slug, organizer_session_id, generation, title, template, meal, description,
         starts_at, location, includes, agenda, price_cents, capacity, goal_cents, minimum_cents)
       VALUES ($1,$2,$3,0,'Golden','casa','cena','Golden',$4::timestamptz,'Casa','[]'::jsonb,'[]'::jsonb,2500,4,10000,5000)`,
      [eventId, slug, sessionId, START],
    );
    await pool.query(
      `INSERT INTO guests (id, event_id, session_id, name, status, companions) VALUES ($1,$2,$3,'Golden','yes',1)`,
      [guestId, eventId, sessionId],
    );
    await pool.query(
      `INSERT INTO quotes (id, event_id, guest_id, obligation_version, people, unit_cents, total_cents, paid_cents, amount_cents, summary, expires_at)
       VALUES ($1,$2,$3,1,2,2500,5000,5000,0,'pagado', now() + interval '1 day')`,
      [quoteId, eventId, guestId],
    );
    await pool.query(
      `INSERT INTO orders (id, event_id, guest_id, quote_id, obligation_version, request_id, paypal_order_id, amount_cents, payee_merchant_id, status, capture_id)
       VALUES ($1,$2,$3,$4,1,$5,$6,5000,$7,'paid',$8)`,
      [orderId, eventId, guestId, quoteId, `fp-${orderId}`, `ORD-${captureId}`, MERCHANT, captureId],
    );
    await pool.query(
      `INSERT INTO payment_ledger (id, event_id, guest_id, order_id, kind, amount_cents, external_id, capture_id, created_at)
       VALUES ($1,$2,$3,$4,'capture',5000,$5,$5,'2026-06-01T12:00:00Z')`,
      [randomUUID(), eventId, guestId, orderId, captureId],
    );
    at('2027-01-01T00:00:00.000Z');
    await pass();
    const golden = await pool.query<FundingRow>(
      `SELECT id, funding_status, funding_deadline_at, funding_basis_cents, funding_decided_at,
              confirmed, closed_at, price_cents, minimum_cents, title, purged_at
         FROM events WHERE id = $1`,
      [eventId],
    );
    expect(golden.rows[0]).toMatchObject({
      funding_status: 'legacy',
      funding_deadline_at: null,
      funding_basis_cents: null,
      funding_decided_at: null,
      minimum_cents: 5000,
    });
    expect(await tasksOf(eventId)).toHaveLength(0);
    const money = await ledgerOf(eventId);
    expect(money).toHaveLength(1);
    expect(money[0]).toMatchObject({ kind: 'capture', amount_cents: 5000 });

    at(CLOCK_START);
    const { client, event } = await organizer({ title: 'Se volvera legado' });
    await pool.query(
      `UPDATE events
          SET funding_status = 'legacy', funding_deadline_at = NULL, funding_decided_at = NULL, funding_basis_cents = NULL
        WHERE id = $1`,
      [event.id],
    );
    const renamed = await client.put(`/api/events/${event.slug}`, inputFrom({ ...event, title: 'Titulo nuevo' }));
    expect(renamed.statusCode, renamed.body).toBe(200);
    const kept = body<{ event: FiestaEvent }>(renamed).event;
    expect(kept.title).toBe('Titulo nuevo');
    expect(kept.fundingStatus).toBe('legacy');
    expect(kept.fundingDeadlineAt).toBeNull();
    const opted = await client.put(
      `/api/events/${event.slug}`,
      inputFrom(kept, { fundingDeadlineAt: '2026-12-10T18:00:00.000Z' }),
    );
    expect(opted.statusCode).toBe(400);
    expect((await fundingOf(event.slug)).funding_status).toBe('legacy');
  }, CASE_MS);

  it('congela minimo y fecha limite cuando ya hay una orden y rechaza estado de pago enviado por el cliente', async () => {
    const before = await pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM events');
    const refused = await new Client(app).post('/api/events', eventBody({ funded: true, fundingStatus: 'funded' }));
    expect(refused.statusCode).toBe(400);
    const after = await pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM events');
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);

    const { client, event } = await organizer({ title: 'Congelado' });
    await pinDeadline(event.slug);
    const guest = new Client(app);
    expect((await guest.post(`/api/events/${event.slug}/join`, { name: 'Orden' })).statusCode).toBe(200);
    expect((await guest.post(`/api/events/${event.slug}/rsvp`, { status: 'yes', companions: 0 })).statusCode).toBe(200);
    const quote = body<{ quote: Quote }>(await guest.post(`/api/events/${event.slug}/quote`)).quote;
    const tainted = await guest.post(`/api/events/${event.slug}/orders`, {
      quoteId: quote.id,
      confirmed: true,
      fundingStatus: 'funded',
      paid: true,
    });
    expect(tainted.statusCode).toBe(400);
    expect((await guest.post(`/api/events/${event.slug}/orders`, { quoteId: quote.id, confirmed: true })).statusCode).toBe(200);

    const current = body<{ event: FiestaEvent }>(await client.get(`/api/events/${event.slug}`)).event;
    const deadlineMove = await client.put(
      `/api/events/${event.slug}`,
      inputFrom(current, { fundingDeadlineAt: '2026-12-10T18:00:00.000Z' }),
    );
    expect(deadlineMove.statusCode).toBe(409);
    const minimumMove = await client.put(`/api/events/${event.slug}`, inputFrom(current, { minimumCents: 7500 }));
    expect(minimumMove.statusCode).toBe(409);
    const titleOnly = await client.put(`/api/events/${event.slug}`, inputFrom({ ...current, title: 'Mismo trato' }));
    expect(titleOnly.statusCode, titleOnly.body).toBe(200);
    const stored = await fundingOf(event.slug);
    expect(stored.title).toBe('Mismo trato');
    expect(stored.funding_status).toBe('open');
    expect(stored.minimum_cents).toBe(5000);
    expect(stored.funding_deadline_at?.toISOString()).toBe(DEADLINE);
    expect(body<{ event: FiestaEvent }>(titleOnly).event.fundingBasisCents).toBeNull();
  }, CASE_MS);

  it('agrega la migracion sin borrar tareas y un token viejo no cierra el reembolso', async () => {
    const sql = await readFile(join(dirname(fileURLToPath(import.meta.url)), '../src/db/migrations/0007_funding.sql'), 'utf8');
    expect(sql).toContain('does not make an older application');
    expect(sql).toContain('Drain pending');
    expect(sql).not.toContain('ON DELETE CASCADE');
    expect(sql).toContain('no tested down-migration');

    const index = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND indexname = 'events_funding_due_idx'`,
      [schema],
    );
    expect(index.rows[0]?.indexdef ?? '').not.toMatch(/purged_at/i);
    expect(index.rows[0]?.indexdef).toContain("funding_status = 'open'");

    const fks = await pool.query(
      `SELECT c.conname
         FROM pg_constraint c
         JOIN pg_class r ON r.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = r.relnamespace
        WHERE n.nspname = $1 AND r.relname = 'funding_refund_tasks' AND c.contype = 'f'`,
      [schema],
    );
    expect(fks.rowCount).toBe(0);

    const fn = await pool.query<{ nspname: string }>(
      `SELECT n.nspname
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE p.proname = 'fiestapay_guard_funding_refund_task'`,
    );
    expect(fn.rows.map((row) => row.nspname)).toContain(schema);
    expect(fn.rows.some((row) => row.nspname === 'public')).toBe(false);

    const taskId = randomUUID();
    await expect(
      pool.query(
        `INSERT INTO funding_refund_tasks (
           id, event_id, order_id, guest_id, capture_id, amount_cents, request_id, request_body, status
         ) VALUES ($1,$2,$3,$4,'CAP-SIN-LIBRO',100,$5,'{}','refunded')`,
        [taskId, randomUUID(), randomUUID(), randomUUID(), `fp-rfd-${taskId}`],
      ),
    ).rejects.toThrow(/libro mayor/);

    const { event } = await organizer({ title: 'Cerco' });
    await pinDeadline(event.slug);
    const paid = await pay(event.slug, 'Cerco');
    at(DEADLINE);
    await runFundingPass(pool, null);
    const row = await fundingOf(event.slug);
    const task = (await tasksOf(row.id))[0];
    expect(task?.status).toBe('pending');
    const refundId = randomUUID();
    await pool.query(
      `INSERT INTO payment_ledger (id, event_id, guest_id, order_id, kind, amount_cents, external_id, capture_id)
       SELECT $1, event_id, guest_id, order_id, 'refund', amount_cents, $2, capture_id
         FROM payment_ledger WHERE capture_id = $3 AND kind = 'capture'`,
      [refundId, 'REF-CERCO', paid.captureId],
    );
    await pool.query(
      `UPDATE funding_refund_tasks
          SET status = 'leased', lease_token = 'token-a', lease_until = '2026-12-01T18:00:00Z', attempt_count = 1
        WHERE id = $1`,
      [task?.id],
    );
    expect(await completeLeasedRefund(pool, task!.id, 'token-b', 'REF-CERCO')).toBe(false);
    expect((await tasksOf(row.id))[0]?.status).toBe('leased');
    expect(await completeLeasedRefund(pool, task!.id, 'token-a', 'REF-CERCO')).toBe(true);
    expect((await tasksOf(row.id))[0]?.status).toBe('refunded');
    expect(await completeLeasedRefund(pool, task!.id, 'token-a', 'REF-CERCO')).toBe(false);
    expect((await tasksOf(row.id))[0]?.status).toBe('refunded');
    await expect(
      pool.query('UPDATE funding_refund_tasks SET request_body = $2 WHERE id = $1', [task?.id, '{"amount":{"currency_code":"USD","value":"1.00"}}']),
    ).rejects.toThrow(/inmutable/);

    const stop = startFundingLoop(pool, null, () => undefined, { intervalMs: 60_000, timeoutMs: 1_000 });
    await stop();
  }, CASE_MS);
});
