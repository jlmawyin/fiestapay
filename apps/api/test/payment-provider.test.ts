/**
 * Somos Panas SP-8 — proveedor de pago por sitio (`none` vs `paypal_sandbox` en el legado).
 * Depende de Postgres 16 aislado, `FakePayPal` (sin red) y migración 0013.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Capabilities, FiestaEvent, OrderResult, Quote } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { sha256 } from '../src/lib/ids.js';
import { decideDueEvents, fundingForNewEvent } from '../src/domain/funding.js';
import { runFundingPass } from '../src/domain/funding-refunds.js';
import { FakePayPal } from './fake-paypal.js';
import { announceSkipWithoutDatabase, body, Client, DATABASE_URL, MERCHANT, testConfig } from './harness.js';

announceSkipWithoutDatabase('payment-provider.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb('proveedor de pago por sitio (SP-8)', () => {
  const schema = `fp_payprov_${randomBytes(5).toString('hex')}`;
  let pool: Pool;
  let adminPool: Pool;
  let app: FastifyInstance;
  let fake: FakePayPal;
  let noneTenantId: string;
  let noneEventSlug: string;
  let noneSessionId: string;
  let noneEventId: string;
  const noneAdminKey = 'clave-sp8-none-admin';

  async function seedNoneSite(): Promise<void> {
    const legacy = await pool.query<{ id: string }>(`SELECT id FROM tenants WHERE slug = 'fiestapay' LIMIT 1`);
    expect(legacy.rows[0]?.id).toBeTruthy();

    const tenant = await pool.query<{ id: string }>(
      `INSERT INTO tenants (slug, kind, discoverable, payment_provider)
       VALUES ($1, 'group', false, 'none')
       RETURNING id`,
      [`grupo-${randomBytes(3).toString('hex')}`],
    );
    noneTenantId = tenant.rows[0]!.id;
    await pool.query(
      `INSERT INTO tenant_settings (
         tenant_id, display_name, tagline, about,
         color_cloudwhite, color_ink, color_ink_muted, color_blue, color_teal, color_yellow, color_coral
       ) VALUES ($1,'Grupo SP-8','','',
         '#F7FAFC','#12263A','#4A5D73','#125FE6','#0B8075','#FFC85A','#E85D4A')`,
      [noneTenantId],
    );

    noneSessionId = randomUUID();
    await pool.query('INSERT INTO sessions (id, token_hash) VALUES ($1, $2)', [noneSessionId, randomBytes(32)]);

    noneEventId = randomUUID();
    noneEventSlug = `evt-none-${randomBytes(4).toString('hex')}`;
    const starts = new Date(Date.now() + 86_400_000).toISOString();
    const ends = new Date(Date.now() + 90_000_000).toISOString();
    await pool.query(
      `INSERT INTO events (
         id, slug, tenant_id, organizer_session_id, generation, title, template, meal, description,
         starts_at, ends_at, location, price_cents, minimum_cents, funding_status, visibility, admin_key_hash
       ) VALUES ($1,$2,$3,$4,1,'Reunion SP-8','casa','cena','Sin PayPal',
         $5::timestamptz,$6::timestamptz,'Casa',2500,5000,'inactive','public',$7)`,
      [noneEventId, noneEventSlug, noneTenantId, noneSessionId, starts, ends, sha256(noneAdminKey)],
    );
  }

  beforeAll(async () => {
    pool = createPool({ connectionString: DATABASE_URL!, schema });
    adminPool = createPool({ connectionString: DATABASE_URL!, max: 2 });
    await migrate(pool, { schema });
    fake = new FakePayPal(MERCHANT);
    app = await buildApp({ pool, config: testConfig(), paypal: fake, logger: false });
    await app.ready();
    await seedNoneSite();
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await adminPool.end();
    }
  });

  it('fundingForNewEvent no deja funding_status open en sitios none', () => {
    const now = new Date('2026-12-01T12:00:00.000Z');
    const input = {
      title: 'x',
      template: 'casa' as const,
      meal: 'cena' as const,
      description: 'd',
      startsAt: '2026-12-15T18:00:00.000Z',
      endsAt: '2026-12-15T22:00:00.000Z',
      location: 'l',
      includes: [],
      agenda: [],
      priceCents: 2500,
      capacity: 50,
      goalCents: null,
      minimumCents: 10_000,
      fundingDeadlineAt: '2026-12-15T17:00:00.000Z',
    };
    const open = fundingForNewEvent(input, now, 'paypal_sandbox');
    expect(open.status).toBe('open');
    const inactive = fundingForNewEvent(input, now, 'none');
    expect(inactive.status).toBe('inactive');
    expect(inactive.deadline).toBeNull();
  });

  it('GET /api/events/:slug publica paymentProvider del tenant (SP8-D-2)', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/events/${noneEventSlug}` });
    expect(res.statusCode).toBe(200);
    const payload = res.json() as { event: FiestaEvent };
    expect(payload.event.paymentProvider).toBe('none');
  });

  it('PUT con mínimo en tenant none deja funding_status inactive (SP8-D-1)', async () => {
    const org = new Client(app);
    org.authorize(noneEventSlug, noneAdminKey);
    const getRes = await org.get(`/api/events/${noneEventSlug}`);
    if (getRes.statusCode !== 200) throw new Error(`GET falló ${getRes.statusCode}: ${getRes.body}`);
    const current = body<{ event: FiestaEvent }>(getRes).event;
    const starts = new Date(Date.now() + 86_400_000).toISOString();
    const ends = new Date(Date.now() + 90_000_000).toISOString();
  const deadline = new Date(Date.now() + 43_200_000).toISOString();
    const put = await org.put(`/api/events/${noneEventSlug}`, {
      title: current.title,
      template: current.template,
      meal: current.meal,
      description: current.description,
      startsAt: starts,
      endsAt: ends,
      location: current.location,
      includes: current.includes,
      agenda: current.agenda,
      priceCents: current.priceCents,
      capacity: current.capacity ?? 50,
      goalCents: current.goalCents,
      minimumCents: 5000,
      fundingDeadlineAt: deadline,
    });
    expect(put.statusCode, put.body).toBe(200);
    expect(body<{ event: FiestaEvent }>(put).event.paymentProvider).toBe('none');
    const row = await pool.query<{ funding_status: string }>(
      `SELECT funding_status FROM events WHERE id = $1`,
      [noneEventId],
    );
    expect(row.rows[0]?.funding_status).toBe('inactive');
  });

  async function resetNoneEventFunding(): Promise<void> {
    await pool.query(
      `UPDATE events SET funding_status = 'inactive', funding_deadline_at = NULL, minimum_cents = NULL, closed_at = NULL, confirmed = false
        WHERE id = $1`,
      [noneEventId],
    );
  }

  it('decideDueEvents ignora eventos none aunque figuren open (SP8-D-1)', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    await pool.query(
      `UPDATE events SET funding_status = 'open', funding_deadline_at = $2::timestamptz, minimum_cents = 5000 WHERE id = $1`,
      [noneEventId, past],
    );
    const decided = await decideDueEvents(pool, 10);
    expect(decided).toBe(0);
    const row = await pool.query<{ funding_status: string }>(`SELECT funding_status FROM events WHERE id = $1`, [
      noneEventId,
    ]);
    expect(row.rows[0]?.funding_status).toBe('open');
    await resetNoneEventFunding();
  });

  it('webhook de captura no aplica libro en tenant none (SP8-D-6)', async () => {
    const guestId = randomUUID();
    const guestSession = randomUUID();
    const quoteId = randomUUID();
    await pool.query('INSERT INTO sessions (id, token_hash) VALUES ($1, $2)', [guestSession, randomBytes(32)]);
    await pool.query(`INSERT INTO guests (id, event_id, session_id, name) VALUES ($1,$2,$3,'Webhook guest')`, [
      guestId,
      noneEventId,
      guestSession,
    ]);
    await pool.query(
      `INSERT INTO quotes (id, event_id, guest_id, obligation_version, people, unit_cents, total_cents,
         paid_cents, amount_cents, summary, expires_at)
       VALUES ($1,$2,$3,1,1,2500,2500,0,2500,'Cuenta',$4::timestamptz)`,
      [quoteId, noneEventId, guestId, new Date(Date.now() + 3_600_000).toISOString()],
    );
    const orderId = randomUUID();
    const paypalOrderId = `PAYPAL-NONE-${randomBytes(4).toString('hex')}`;
    await pool.query(
      `INSERT INTO orders (id, event_id, guest_id, quote_id, obligation_version, request_id,
         paypal_order_id, amount_cents, payee_merchant_id, status)
       SELECT $1, $2, g.id, q.id, 1, $3, $4, 2500, $5, 'approved'
         FROM guests g
         JOIN quotes q ON q.guest_id = g.id
        WHERE g.event_id = $2
        LIMIT 1`,
      [orderId, noneEventId, `req-${randomBytes(3).toString('hex')}`, paypalOrderId, MERCHANT],
    );
    const client = new Client(app);
    const webhookId = `WH-NONE-${randomBytes(3).toString('hex')}`;
    const res = await client.post(
      '/api/paypal/webhook',
      {
        id: webhookId,
        event_type: 'CHECKOUT.ORDER.COMPLETED',
        resource: { id: paypalOrderId },
      },
      null,
    );
    expect(res.statusCode).toBe(200);
    const ledger = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM payment_ledger WHERE order_id = $1`,
      [orderId],
    );
    expect(ledger.rows[0]?.n).toBe(0);
    await resetNoneEventFunding();
  });

  it('POST /rsvp en tenant none devuelve paymentProvider none (SP8-D-2)', async () => {
    const guest = new Client(app);
    expect((await guest.post(`/api/events/${noneEventSlug}/join`, { name: 'Rsvp SP8' })).statusCode).toBe(200);
    const res = await guest.post(`/api/events/${noneEventSlug}/rsvp`, { status: 'yes', companions: 0 });
    expect(res.statusCode).toBe(200);
    expect(body<{ event: FiestaEvent; guest: unknown }>(res).event.paymentProvider).toBe('none');
  });

  it('webhook DECLINED no concilia en tenant none (SP8-D-6)', async () => {
    const paypalOrderId = `PAYPAL-DECL-${randomBytes(4).toString('hex')}`;
    const orderId = randomUUID();
    const guestId = randomUUID();
    const guestSession = randomUUID();
    const quoteId = randomUUID();
    await pool.query('INSERT INTO sessions (id, token_hash) VALUES ($1, $2)', [guestSession, randomBytes(32)]);
    await pool.query(`INSERT INTO guests (id, event_id, session_id, name, status) VALUES ($1,$2,$3,'Decl guest','yes')`, [
      guestId,
      noneEventId,
      guestSession,
    ]);
    await pool.query(
      `INSERT INTO quotes (id, event_id, guest_id, obligation_version, people, unit_cents, total_cents,
         paid_cents, amount_cents, summary, expires_at)
       VALUES ($1,$2,$3,1,1,2500,2500,0,2500,'Cuenta',$4::timestamptz)`,
      [quoteId, noneEventId, guestId, new Date(Date.now() + 3_600_000).toISOString()],
    );
    await pool.query(
      `INSERT INTO orders (id, event_id, guest_id, quote_id, obligation_version, request_id,
         paypal_order_id, amount_cents, payee_merchant_id, status)
       VALUES ($1,$2,$3,$4,1,$5,$6,2500,$7,'capturing')`,
      [orderId, noneEventId, guestId, quoteId, `req-${randomBytes(3).toString('hex')}`, paypalOrderId, MERCHANT],
    );
    const captureId = `CAP-DECL-NONE-${randomBytes(3).toString('hex')}`;
    const client = new Client(app);
    const res = await client.post(
      '/api/paypal/webhook',
      {
        id: `WH-DECL-${randomBytes(3).toString('hex')}`,
        event_type: 'PAYMENT.CAPTURE.DECLINED',
        resource: {
          id: captureId,
          supplementary_data: { related_ids: { order_id: paypalOrderId } },
        },
      },
      null,
    );
    expect(res.statusCode).toBe(200);
    const ledger = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM payment_ledger WHERE order_id = $1`,
      [orderId],
    );
    expect(ledger.rows[0]?.n).toBe(0);
    const orderRow = await pool.query<{ status: string }>(`SELECT status FROM orders WHERE id = $1`, [orderId]);
    expect(orderRow.rows[0]?.status).toBe('capturing');
  });

  it('webhook REFUNDED no aplica libro en tenant none (SP8-D-6)', async () => {
    const paypalOrderId = `PAYPAL-RFD-${randomBytes(4).toString('hex')}`;
    const orderId = randomUUID();
    const guestId = randomUUID();
    const guestSession = randomUUID();
    const quoteId = randomUUID();
    const captureId = `CAP-RFD-NONE-${randomBytes(3).toString('hex')}`;
    await pool.query('INSERT INTO sessions (id, token_hash) VALUES ($1, $2)', [guestSession, randomBytes(32)]);
    await pool.query(`INSERT INTO guests (id, event_id, session_id, name, status) VALUES ($1,$2,$3,'Rfd guest','yes')`, [
      guestId,
      noneEventId,
      guestSession,
    ]);
    await pool.query(
      `INSERT INTO quotes (id, event_id, guest_id, obligation_version, people, unit_cents, total_cents,
         paid_cents, amount_cents, summary, expires_at)
       VALUES ($1,$2,$3,1,1,2500,2500,0,2500,'Cuenta',$4::timestamptz)`,
      [quoteId, noneEventId, guestId, new Date(Date.now() + 3_600_000).toISOString()],
    );
    await pool.query(
      `INSERT INTO orders (id, event_id, guest_id, quote_id, obligation_version, request_id,
         paypal_order_id, amount_cents, payee_merchant_id, status)
       VALUES ($1,$2,$3,$4,1,$5,$6,2500,$7,'paid')`,
      [orderId, noneEventId, guestId, quoteId, `req-${randomBytes(3).toString('hex')}`, paypalOrderId, MERCHANT],
    );
    const refund = fake.addRefund(captureId, 2500);
    const client = new Client(app);
    const res = await client.post(
      '/api/paypal/webhook',
      {
        id: `WH-RFD-${randomBytes(3).toString('hex')}`,
        event_type: 'PAYMENT.CAPTURE.REFUNDED',
        resource: {
          id: refund.id,
          supplementary_data: { related_ids: { order_id: paypalOrderId } },
        },
      },
      null,
    );
    expect(res.statusCode).toBe(200);
    const ledger = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM payment_ledger WHERE capture_id = $1`,
      [captureId],
    );
    expect(ledger.rows[0]?.n).toBe(0);
  });

  it('executeTask en tenant none no llama a PayPal (SP8-D-6)', async () => {
    const captureId = `CAP-EXEC-NONE-${randomBytes(3).toString('hex')}`;
    const orderId = randomUUID();
    const guestId = randomUUID();
    const guestSession = randomUUID();
    const quoteId = randomUUID();
    await pool.query('INSERT INTO sessions (id, token_hash) VALUES ($1, $2)', [guestSession, randomBytes(32)]);
    await pool.query(`INSERT INTO guests (id, event_id, session_id, name, status) VALUES ($1,$2,$3,'Worker','yes')`, [
      guestId,
      noneEventId,
      guestSession,
    ]);
    await pool.query(
      `INSERT INTO quotes (id, event_id, guest_id, obligation_version, people, unit_cents, total_cents,
         paid_cents, amount_cents, summary, expires_at)
       VALUES ($1,$2,$3,1,1,2500,2500,2500,0,'Cuenta',$4::timestamptz)`,
      [quoteId, noneEventId, guestId, new Date(Date.now() + 3_600_000).toISOString()],
    );
    await pool.query(
      `INSERT INTO orders (id, event_id, guest_id, quote_id, obligation_version, request_id,
         paypal_order_id, amount_cents, payee_merchant_id, status, capture_id)
       VALUES ($1,$2,$3,$4,1,$5,$6,2500,$7,'paid',$8)`,
      [
        orderId,
        noneEventId,
        guestId,
        quoteId,
        `req-${randomBytes(3).toString('hex')}`,
        `PAYPAL-EXEC-${randomBytes(3).toString('hex')}`,
        MERCHANT,
        captureId,
      ],
    );
    await pool.query(
      `INSERT INTO payment_ledger (id, event_id, guest_id, order_id, kind, amount_cents, external_id, capture_id)
       VALUES ($1,$2,$3,$4,'capture',2500,$5,$5)`,
      [randomUUID(), noneEventId, guestId, orderId, captureId],
    );
    const taskId = randomUUID();
    await pool.query(
      `INSERT INTO funding_refund_tasks (
         id, event_id, order_id, guest_id, capture_id, amount_cents, currency,
         request_id, request_body, status
       ) VALUES ($1,$2,$3,$4,$5,2500,'USD',$6,'{}','pending')`,
      [taskId, noneEventId, orderId, guestId, captureId, `fp-rfd-${taskId}`],
    );
    const beforeRefund = fake.refundCaptureCalls.length;
    const beforeGet = fake.refundCalls.length;
    const outcome = await runFundingPass(pool, fake, { batch: 5 });
    expect(outcome.review).toBeGreaterThanOrEqual(1);
    expect(fake.refundCaptureCalls.length).toBe(beforeRefund);
    expect(fake.refundCalls.length).toBe(beforeGet);
    const task = await pool.query<{ status: string }>(`SELECT status FROM funding_refund_tasks WHERE id = $1`, [taskId]);
    expect(task.rows[0]?.status).toBe('needs_review');
  });

  it('crear orden en sitio none responde 503 y no inserta en orders', async () => {
    const guest = new Client(app);
    expect((await guest.post(`/api/events/${noneEventSlug}/join`, { name: 'Ana None' })).statusCode).toBe(200);
    expect((await guest.post(`/api/events/${noneEventSlug}/rsvp`, { status: 'yes', companions: 0 })).statusCode).toBe(200);

    const quoteRes = await guest.post(`/api/events/${noneEventSlug}/quote`);
    expect(quoteRes.statusCode).toBe(200);
    const quote = body<{ quote: Quote }>(quoteRes).quote;

    const before = await pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM orders');
    const orderRes = await guest.post(`/api/events/${noneEventSlug}/orders`, { quoteId: quote.id, confirmed: true });
    expect(orderRes.statusCode).toBe(503);
    const after = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM orders`);
    expect(after.rows[0]?.n).toBe(before.rows[0]?.n);
  });

  it('GET /api/capabilities en raíz reporta paymentProvider none y paypal false', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/capabilities',
      headers: { host: 'somospanas.com' },
    });
    expect(res.statusCode).toBe(200);
    const caps = res.json() as Capabilities;
    expect(caps.paymentProvider).toBe('none');
    expect(caps.paypal).toBe(false);
    expect(caps.paypalClientId).toBeNull();
  });

  it('GET /api/capabilities en legado mantiene paypal sandbox', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/capabilities',
      headers: { host: 'fiestapay.somospanas.com' },
    });
    expect(res.statusCode).toBe(200);
    const caps = res.json() as Capabilities;
    expect(caps.paymentProvider).toBe('paypal_sandbox');
    expect(caps.paypal).toBe(true);
  });

  it('GET /api/demo/buyer solo responde en host legado', async () => {
    const root = await app.inject({ method: 'GET', url: '/api/demo/buyer', headers: { host: 'somospanas.com' } });
    expect(root.statusCode).toBe(404);
    const legacy = await app.inject({
      method: 'GET',
      url: '/api/demo/buyer',
      headers: { host: 'fiestapay.somospanas.com' },
    });
    expect(legacy.statusCode).toBe(200);
  });

  it('el legado sigue creando orden con el falso PayPal', async () => {
    const client = new Client(app);
    const demo = await client.post('/api/demo');
    expect(demo.statusCode).toBe(200);
    const slug = body<{ event: { slug: string } }>(demo).event.slug;
    const guest = new Client(app);
    await guest.post(`/api/events/${slug}/join`, { name: 'Payer Legacy' });
    await guest.post(`/api/events/${slug}/rsvp`, { status: 'yes', companions: 0 });
    const quote = body<{ quote: Quote }>(await guest.post(`/api/events/${slug}/quote`)).quote;
    const order = body<OrderResult>(
      await guest.post(`/api/events/${slug}/orders`, { quoteId: quote.id, confirmed: true }),
    );
    expect(order.orderId.length).toBeGreaterThan(0);
  });
});