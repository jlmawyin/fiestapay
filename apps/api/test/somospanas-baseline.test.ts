/**
 * Baseline Somos Panas (SP-1): fija por pruebas el comportamiento actual de FiestaPay antes de
 * cambiar producto. Depende del harness (`harness.ts`), de `FakePayPal`, de `buildApp`, de las
 * migraciones en Postgres y de `isAllowedOrigin` en `apps/api/src/lib/origin.ts`.
 */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { FiestaEvent, OrderResult, Quote } from '@fiestapay/shared';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { isAllowedOrigin } from '../src/lib/origin.js';
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

announceSkipWithoutDatabase('somospanas-baseline.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

/**
 * Comprueba que `isAllowedOrigin` solo acepta orígenes en la lista (coincidencia exacta tras normalizar)
 * y rechaza sufijos inventados.
 * Recibe `allowed: string[]`. No devuelve valor; cualquier incumplimiento falla la prueba vía `expect`.
 */
function assertExactOriginList(allowed: string[]): void {
  for (const entry of allowed) {
    expect(isAllowedOrigin({ origin: entry, allowed })).toBe(true);
    expect(isAllowedOrigin({ origin: `${entry}/`, allowed })).toBe(true);
  }
  expect(isAllowedOrigin({ origin: 'https://subdominio.somospanas.com', allowed })).toBe(false);
  expect(isAllowedOrigin({ origin: `${ORIGIN}evil`, allowed })).toBe(false);
}

describeDb('SP-1 red de seguridad — comportamiento actual', () => {
  const schema = `fp_sp1_${randomBytes(5).toString('hex')}`;
  let pool: Pool;
  let adminPool: Pool;
  let app: FastifyInstance;
  let fake: FakePayPal;

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

  it('el origen permitido es igualdad exacta contra la lista del servidor (sin subcadenas ni sufijos)', () => {
    const allowed = testConfig().allowedOrigins;
    expect(allowed.length).toBeGreaterThan(0);
    expect(allowed).toContain(ORIGIN);
    assertExactOriginList(allowed);
  });

  it('una mutación con origen desconocido recibe 403', async () => {
    const res = await new Client(app).post('/api/demo', {}, 'https://origen-desconocido.example');
    expect(res.statusCode).toBe(403);
    expect(body<{ error: string }>(res).error).toBeTruthy();
  });

  it('la cookie de sesión es HttpOnly y no lleva atributo Domain', async () => {
    const res = await new Client(app).post('/api/demo');
    expect(res.statusCode).toBe(200);
    const parsed = res.cookies.find((c) => c.name === 'fp_session');
    expect(parsed?.httpOnly).toBe(true);
    expect(parsed).not.toHaveProperty('domain');
    const raw = await app.inject({
      method: 'POST',
      url: '/api/demo',
      headers: { origin: ORIGIN },
    });
    const headerList = raw.headers['set-cookie'];
    const lines = Array.isArray(headerList) ? headerList : headerList ? [headerList] : [];
    const sessionLine = lines.find((line) => line.startsWith('fp_session='));
    expect(sessionLine).toBeTruthy();
    expect(sessionLine!.toLowerCase()).not.toContain('domain=');
  });

  it('GET /api/events sin sesión devuelve lista vacía', async () => {
    const res = await new Client(app).get('/api/events');
    expect(res.statusCode).toBe(200);
    expect(body<{ events: FiestaEvent[] }>(res).events).toEqual([]);
  });

  it('crear una orden pasa por el adaptador PayPal inyectado (FakePayPal), no por red real', async () => {
    const org = new Client(app);
    const demo = body<{ event: FiestaEvent }>(await org.post('/api/demo'));
    const guest = new Client(app);
    expect((await guest.post(`/api/events/${demo.event.slug}/join`, { name: 'Baseline Invitado' })).statusCode).toBe(200);
    expect((await guest.post(`/api/events/${demo.event.slug}/rsvp`, { status: 'yes', companions: 0 })).statusCode).toBe(200);

    const before = fake.createCalls.length;
    const quote = body<{ quote: Quote }>(await guest.post(`/api/events/${demo.event.slug}/quote`)).quote;
    const orderRes = await guest.post(`/api/events/${demo.event.slug}/orders`, { quoteId: quote.id, confirmed: true });
    expect(orderRes.statusCode).toBe(200);
    const order = body<OrderResult>(orderRes);
    expect(order.orderId).toBeTruthy();
    expect(order.approveUrl).toBeTruthy();
    expect(fake.createCalls.length).toBe(before + 1);
    expect(fake.createCalls[fake.createCalls.length - 1]!.amountCents).toBe(quote.amountCents);
  });

  it('GET /api/portal/events responde 404 en host legado (directorio solo en la raíz)', async () => {
    const res = await new Client(app).get('/api/portal/events');
    expect(res.statusCode).toBe(404);
  });
});