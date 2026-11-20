/**
 * Somos Panas SP-8 — proveedor de pago por sitio (`none` vs `paypal_sandbox` en el legado).
 * Depende de Postgres 16 aislado, `FakePayPal` (sin red) y migración 0013.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Capabilities, OrderResult, Quote } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { fundingForNewEvent } from '../src/domain/funding.js';
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

    const eventId = randomUUID();
    noneEventSlug = `evt-none-${randomBytes(4).toString('hex')}`;
    const starts = new Date(Date.now() + 86_400_000).toISOString();
    const ends = new Date(Date.now() + 90_000_000).toISOString();
    await pool.query(
      `INSERT INTO events (
         id, slug, tenant_id, organizer_session_id, generation, title, template, meal, description,
         starts_at, ends_at, location, price_cents, minimum_cents, funding_status
       ) VALUES ($1,$2,$3,$4,1,'Reunion SP-8','casa','cena','Sin PayPal',
         $5::timestamptz,$6::timestamptz,'Casa',2500,5000,'inactive')`,
      [eventId, noneEventSlug, noneTenantId, noneSessionId, starts, ends],
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
    const open = fundingForNewEvent(input, now);
    expect(open.status).toBe('open');
    const inactive = fundingForNewEvent(input, now, { paymentProvider: 'none' });
    expect(inactive.status).toBe('inactive');
    expect(inactive.deadline).not.toBeNull();
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