import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FiestaEvent, Quote } from '@fiestapay/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { requestLocale } from '../src/lib/locale.js';
import { FakePayPal } from './fake-paypal.js';
import { announceSkipWithoutDatabase, body, Client, DATABASE_URL, MERCHANT, testConfig } from './harness.js';

announceSkipWithoutDatabase('demo-i18n.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

/** The API publishes isDemo; the shared contract does not declare it yet. */
type EventWithDemo = FiestaEvent & { isDemo: boolean };
type CreatedWithDemo = { event: EventWithDemo; adminKey: string | null };

const SPANISH_DEMO = {
  title: 'Almuerzo de demostración',
  template: 'comida',
  meal: 'almuerzo',
  description:
    'Comida ficticia de demostración para probar el panel del organizador y PayPal Sandbox. Ningún importe es un cobro real.',
  location: 'Salón Mirador de los Andes, Quito (lugar ficticio)',
  includes: ['Almuerzo de prueba', 'Bebida ficticia', 'Postre de ejemplo'],
  priceCents: 2500,
  capacity: 8,
  goalCents: 20000,
  minimumCents: 5000,
  organizerName: 'Equipo FiestaPay (demo)',
};

const SPANISH_AGENDA = [
  { time: '13:00', title: 'Bienvenida de demostración' },
  { time: '14:00', title: 'Almuerzo ficticio' },
  { time: '16:00', title: 'Cierre y prueba de PayPal Sandbox' },
];

const realEvent = (title: string) => ({
  title,
  template: 'evento',
  meal: 'cena',
  description: 'Encuentro real de prueba',
  startsAt: '2026-12-20T19:00:00.000Z',
  endsAt: '2026-12-20T23:00:00.000Z',
  location: 'Quito',
  includes: ['Entrada'],
  priceCents: 2500,
  capacity: 10,
  goalCents: null,
  minimumCents: null,
  agenda: [],
});

describe('requestLocale', () => {
  const headers = (value?: string | string[]) =>
    ({ headers: value === undefined ? {} : { 'x-fiesta-locale': value } }) as Parameters<typeof requestLocale>[0];

  it('lee la cabecera, normaliza variantes y cae a español', () => {
    expect(requestLocale(headers())).toBe('es');
    expect(requestLocale(headers('en'))).toBe('en');
    expect(requestLocale(headers('EN-us'))).toBe('en');
    expect(requestLocale(headers('fr'))).toBe('es');
    expect(requestLocale(headers(['en', 'es']))).toBe('en');
  });
});

describeDb('demos localizadas, listado con isDemo y reinicio aislado', () => {
  const schema = `fp_test_${randomBytes(5).toString('hex')}`;
  let pool: Pool;
  let adminPool: Pool;
  let app: FastifyInstance;

  const count = async (table: 'events' | 'guests' | 'orders' | 'payment_ledger'): Promise<number> => {
    const { rows } = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
    return rows[0]?.n ?? 0;
  };

  const rowCounts = async () => ({
    events: await count('events'),
    guests: await count('guests'),
    orders: await count('orders'),
    ledger: await count('payment_ledger'),
  });

  beforeAll(async () => {
    pool = createPool({ connectionString: DATABASE_URL!, schema });
    adminPool = createPool({ connectionString: DATABASE_URL!, max: 2 });
    await migrate(pool, { schema });
    app = await buildApp({ pool, config: testConfig(), paypal: new FakePayPal(MERCHANT), logger: false });
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

  it('cada kind acuña una demo nueva, en español exacto o en inglés traducido', async () => {
    const es = new Client(app);
    const first = body<CreatedWithDemo>(await es.post('/api/demo', { kind: 'private' }));
    expect(first.event.isDemo).toBe(true);
    expect(first.adminKey).toEqual(expect.any(String));
    expect(first.event).toMatchObject(SPANISH_DEMO);
    expect(first.event.agenda).toEqual(SPANISH_AGENDA);
    expect(Date.parse(first.event.startsAt)).toBeGreaterThan(Date.now());

    const second = body<CreatedWithDemo>(await es.post('/api/demo', { kind: 'private' }));
    expect(second.event.isDemo).toBe(true);
    expect(second.adminKey).toEqual(expect.any(String));
    expect(second.event.slug).not.toBe(first.event.slug);

    const payment = body<CreatedWithDemo>(await es.post('/api/demo', { kind: 'payment' }));
    expect(payment.event.isDemo).toBe(true);
    expect(payment.event.slug).not.toBe(first.event.slug);
    expect(payment.event.slug).not.toBe(second.event.slug);

    const en = new Client(app, 'en');
    const english = body<CreatedWithDemo>(await en.post('/api/demo', { kind: 'payment' }));
    expect(english.event.isDemo).toBe(true);
    expect(english.event.title).toBe('Demo lunch');
    expect(english.event.organizerName).toBe('FiestaPay team (demo)');
    expect(english.event.location).toContain('fictional place');
    expect(english.event.description).toContain('Fictional demo meal');
    expect(english.event.agenda[0]).toEqual({ time: '13:00', title: 'Demo welcome' });
    expect(english.event.priceCents).toBe(2500);
    expect(english.event.capacity).toBe(8);
  });

  it('sin cuerpo reutiliza la demo de la generación y un kind inválido responde 400', async () => {
    const client = new Client(app);
    const first = body<CreatedWithDemo>(await client.post('/api/demo'));
    const second = body<CreatedWithDemo>(await client.post('/api/demo', {}));

    expect(first.event.isDemo).toBe(true);
    expect(second.event.slug).toBe(first.event.slug);
    expect(second.adminKey).toBeNull();

    expect((await client.post('/api/demo', { kind: 'otro' })).statusCode).toBe(400);
    expect((await client.post('/api/demo', { kind: 'private', extra: true })).statusCode).toBe(400);
  });

  it('GET /api/events marca isDemo y solo lista eventos de la propia sesión', async () => {
    const owner = new Client(app);
    const demo = body<CreatedWithDemo>(await owner.post('/api/demo', { kind: 'private' })).event;
    const real = body<CreatedWithDemo>(await owner.post('/api/events', realEvent('Propia'))).event;
    const foreign = body<CreatedWithDemo>(await new Client(app).post('/api/demo', { kind: 'private' })).event;

    const list = body<{ events: EventWithDemo[] }>(await owner.get('/api/events'));
    const bySlug = new Map(list.events.map((event) => [event.slug, event]));

    expect(list.events.every((event) => typeof event.isDemo === 'boolean')).toBe(true);
    expect(bySlug.get(demo.slug)?.isDemo).toBe(true);
    expect(bySlug.get(real.slug)?.isDemo).toBe(false);
    expect(bySlug.has(foreign.slug)).toBe(false);
  });

  it('el reinicio archiva solo las demos de la sesión y conserva propias, ajenas y filas', async () => {
    const a = new Client(app);
    const b = new Client(app);
    const aDemo = body<CreatedWithDemo>(await a.post('/api/demo', { kind: 'private' })).event;
    const aReal = body<CreatedWithDemo>(await a.post('/api/events', realEvent('Propia A'))).event;
    const bDemo = body<CreatedWithDemo>(await b.post('/api/demo', { kind: 'private' })).event;
    const bReal = body<CreatedWithDemo>(await b.post('/api/events', realEvent('Propia B'))).event;

    // Real rows the reset must never touch: guest, open order and (when present) ledger.
    const guestA = new Client(app);
    expect((await guestA.post(`/api/events/${aReal.slug}/join`, { name: 'Ana' })).statusCode).toBe(200);
    expect((await guestA.post(`/api/events/${aReal.slug}/rsvp`, { status: 'yes', companions: 0 })).statusCode).toBe(200);
    const quote = body<{ quote: Quote }>(await guestA.post(`/api/events/${aReal.slug}/quote`));
    expect(
      (await guestA.post(`/api/events/${aReal.slug}/orders`, { quoteId: quote.quote.id, confirmed: true })).statusCode,
    ).toBe(200);

    const guestB = new Client(app);
    expect((await guestB.post(`/api/events/${bDemo.slug}/join`, { name: 'Bea' })).statusCode).toBe(200);
    expect((await guestB.post(`/api/events/${bDemo.slug}/rsvp`, { status: 'yes', companions: 0 })).statusCode).toBe(200);

    const before = await rowCounts();

    a.locale = 'en';
    const reset = await a.post('/api/demo/reset');
    expect(reset.statusCode).toBe(200);
    const replacement = body<CreatedWithDemo>(reset);
    expect(replacement.event.isDemo).toBe(true);
    expect(replacement.event.title).toBe('Demo lunch');
    expect(replacement.event.slug).not.toBe(aDemo.slug);

    // A's archived demo is gone from the public view; its own event and B's events survive.
    expect((await new Client(app).get(`/api/events/${aDemo.slug}`)).statusCode).toBe(410);
    expect(body<{ event: EventWithDemo }>(await new Client(app).get(`/api/events/${aReal.slug}`)).event).toMatchObject({
      slug: aReal.slug,
      isDemo: false,
    });
    expect(body<{ event: EventWithDemo }>(await new Client(app).get(`/api/events/${bDemo.slug}`)).event).toMatchObject({
      slug: bDemo.slug,
      isDemo: true,
    });
    expect(body<{ event: EventWithDemo }>(await new Client(app).get(`/api/events/${bReal.slug}`)).event).toMatchObject({
      slug: bReal.slug,
      isDemo: false,
    });

    const after = await rowCounts();
    expect(after.guests).toBe(before.guests);
    expect(after.orders).toBe(before.orders);
    expect(after.ledger).toBe(before.ledger);
    expect(after.events).toBe(before.events + 1);

    // B's demo still accepts the guest it already had.
    expect((await guestB.post(`/api/events/${bDemo.slug}/quote`)).statusCode).toBe(200);
  });

  it('el reinicio sin cabecera acuña la demo de reemplazo en español', async () => {
    const client = new Client(app);
    await client.post('/api/demo', { kind: 'private' });
    const reset = body<CreatedWithDemo>(await client.post('/api/demo/reset'));
    expect(reset.event.isDemo).toBe(true);
    expect(reset.event.title).toBe('Almuerzo de demostración');
    expect(reset.event.organizerName).toBe('Equipo FiestaPay (demo)');
  });
});
