import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig, type Config } from '../config.js';
import { migrate } from '../db/migrate.js';
import { createPool, type Pool } from '../db/pool.js';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
const ORIGIN = 'http://localhost:5173';

const BASE_ENV = {
  NODE_ENV: 'test',
  SERVE_WEB: '0',
  RATE_LIMIT: '0',
  PUBLIC_ORIGIN: ORIGIN,
  PAYPAL_CLIENT_ID: 'sandbox-client-id',
  PAYPAL_CLIENT_SECRET: 'merchant-secret-that-must-not-leak',
  PAYPAL_MERCHANT_ID: 'merchant-id-that-must-not-leak',
  PAYPAL_BASE_URL: 'https://api-m.sandbox.paypal.com',
  PAYPAL_DEMO_BUYER_PUBLIC: 'true',
  PAYPAL_DEMO_BUYER_EMAIL: 'personal.buyer.sandbox@example.test',
  PAYPAL_DEMO_BUYER_PASSWORD: '  Dedicated-Sandbox-Pass!  ',
  UNRELATED_SECRET: 'unrelated-value-that-must-not-leak',
} as const;

function configWith(overrides: Record<string, string | undefined> = {}): Config {
  return loadConfig({ ...BASE_ENV, ...overrides });
}

async function getBuyer(app: FastifyInstance, suffix = '') {
  return app.inject({
    method: 'GET',
    url: `/api/demo/buyer${suffix}`,
    headers: { origin: ORIGIN },
  });
}

describe.skipIf(databaseUrl.length === 0)('dedicated public Personal sandbox buyer (FP-DEMO-PAY-ENTRY-20261104)', () => {
  let pool: Pool;
  let adminPool: Pool;
  let schemaName: string;

  async function withApp(config: Config, fn: (app: FastifyInstance) => Promise<void>): Promise<void> {
    const app = await buildApp({ pool, config, logger: false });
    try {
      await fn(app);
    } finally {
      await app.close();
    }
  }

  beforeAll(async () => {
    schemaName = `demo_buyer_test_${randomUUID().replace(/-/g, '')}`;
    adminPool = createPool({ connectionString: databaseUrl });
    await adminPool.query(`CREATE SCHEMA "${schemaName}"`);
    pool = createPool({ connectionString: databaseUrl, schema: schemaName });
    await migrate(pool);
  });

  afterAll(async () => {
    await pool?.end();
    if (schemaName) await adminPool?.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await adminPool?.end();
  });

  it('returns only the opt-in dedicated buyer fields with sandbox and no-store', async () => {
    await withApp(configWith(), async (app) => {
      const response = await getBuyer(app);
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toContain('no-store');
      expect(response.json()).toEqual({
        available: true,
        sandbox: true,
        email: 'personal.buyer.sandbox@example.test',
        password: '  Dedicated-Sandbox-Pass!  ',
      });

      const raw = response.body;
      expect(raw).not.toContain(BASE_ENV.PAYPAL_CLIENT_SECRET);
      expect(raw).not.toContain(BASE_ENV.PAYPAL_MERCHANT_ID);
      expect(raw).not.toContain(BASE_ENV.UNRELATED_SECRET);
      expect(raw).not.toContain('merchant');
      expect(raw).not.toContain('client');
    });
  });

  it('is unavailable unless the explicit public opt-in and complete pair are present', async () => {
    const cases = [
      configWith({ PAYPAL_DEMO_BUYER_PUBLIC: undefined }),
      configWith({ PAYPAL_DEMO_BUYER_PUBLIC: 'false' }),
      configWith({ PAYPAL_DEMO_BUYER_EMAIL: undefined }),
      configWith({ PAYPAL_DEMO_BUYER_PASSWORD: undefined }),
      configWith({ PAYPAL_DEMO_BUYER_PASSWORD: '' }),
      configWith({ PAYPAL_DEMO_BUYER_PASSWORD: 'line-one\rline-two' }),
      configWith({ PAYPAL_DEMO_BUYER_PASSWORD: 'line-one\nline-two' }),
    ];
    for (const config of cases) {
      expect(config.demoBuyer).toBeNull();
      await withApp(config, async (app) => {
        const response = await getBuyer(app);
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ available: false, sandbox: true });
        expect(response.headers['cache-control']).toContain('no-store');
      });
    }
  });

  it('rejects a non-string password and never falls back to any merchant or unrelated variable', () => {
    const config = loadConfig({
      ...BASE_ENV,
      PAYPAL_DEMO_BUYER_PASSWORD: 12345,
    } as unknown as NodeJS.ProcessEnv);
    expect(config.demoBuyer).toBeNull();
    expect(config.paypal?.clientSecret).toBe(BASE_ENV.PAYPAL_CLIENT_SECRET);
    expect(config.demoBuyer).not.toEqual({ email: BASE_ENV.PAYPAL_DEMO_BUYER_EMAIL, password: '12345' });
  });

  it('fails closed when PayPal is absent, live, or not exact HTTPS sandbox host', async () => {
    const withoutPayPal = configWith({
      PAYPAL_CLIENT_ID: undefined,
      PAYPAL_CLIENT_SECRET: undefined,
      PAYPAL_MERCHANT_ID: undefined,
    });
    expect(withoutPayPal.paypal).toBeNull();

    const base = configWith();
    const live: Config = {
      ...base,
      paypal: base.paypal ? { ...base.paypal, baseUrl: 'https://api-m.paypal.com' } : null,
    };
    const httpSandbox: Config = {
      ...base,
      paypal: base.paypal ? { ...base.paypal, baseUrl: 'http://api-m.sandbox.paypal.com' } : null,
    };
    const prefixedHost: Config = {
      ...base,
      paypal: base.paypal ? { ...base.paypal, baseUrl: 'https://api-m.sandbox.paypal.com.example.test' } : null,
    };

    for (const config of [withoutPayPal, live, httpSandbox, prefixedHost]) {
      await withApp(config, async (app) => {
        const response = await getBuyer(app);
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ available: false, sandbox: true });
      });
    }
  });

  it('ignores query input and is rate limited to 10 GETs per minute and IP', async () => {
    await withApp(configWith({ RATE_LIMIT: '1' }), async (app) => {
      const first = await getBuyer(app, '?email=attacker%40example.test&password=stolen');
      expect(first.statusCode).toBe(200);
      expect(first.json()).toEqual({
        available: true,
        sandbox: true,
        email: 'personal.buyer.sandbox@example.test',
        password: '  Dedicated-Sandbox-Pass!  ',
      });

      for (let attempt = 0; attempt < 9; attempt += 1) {
        const response = await getBuyer(app);
        expect(response.statusCode).toBe(200);
      }
      const limited = await getBuyer(app);
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).not.toHaveProperty('password');
    });
  });
});
