/**
 * SP-2: clasificación por `Host`, enrutamiento temprano y origen acoplado al host.
 * Pruebas unitarias sin Postgres y de inyección con `buildApp` (webhook y mutaciones).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { Pool } from '../src/db/pool.js';
import {
  classifyHost,
  isHostRoutable,
  isOriginAllowedForHost,
  normalizeHostHeader,
} from '../src/lib/host.js';
import { ORIGIN, testConfig } from './harness.js';

const SIGNATURE =
  'ab2tJk1VCFm4EqdSuKqezr38rTdY3JeRQlw94V1xYAIQVgLScAFn2XLRAhtyo/1jp8RZPO80hLpWfbdvvwyxK1u6L6NX/bnr0vA1wpfkwbqDT/Z01YP2VvJiYQdhpf/yXosoIKwP+37pYdAhwCsIu2D5fJAaDXpM8A06SpZJkR4f5+k566PDVPP7RCED9Xny4Yo0WyVaFORkiDJkBLGhUUIoO7Jv5JP5RQmFqVxhwSAaf4YYy/2r21r5HMQgAIgtS7oHYRea43Ze03Zz0EWqJu/hvKBzKHqhcvUPF64hVg8Nk2yqjnW7ZHgBWoHil2SJ1xQzaq2vDCXv5gWDn5+TZA==';
const CERT_URL = `https://api.sandbox.paypal.com/v1/notifications/certs/CERT-${'a'.repeat(160)}`;
const RAW_BODY =
  '{ "id" : "WH-SP2-1" , "event_type" : "CUSTOMER.MANAGED-ACCOUNT.CREATED" , "resource" : { "id" : "ACCT-1" } }';

function recordingPool(): Pool {
  return {
    query: async () => ({ rows: [], rowCount: 0 }),
  } as unknown as Pool;
}

describe('normalizeHostHeader', () => {
  it('quita puerto y normaliza mayúsculas', () => {
    expect(normalizeHostHeader('SOMOSPANAS.COM:443')).toBe('somospanas.com');
    expect(normalizeHostHeader('Grupo.SomosPanas.com:3000')).toBe('grupo.somospanas.com');
  });

  it('soporta IPv6 con puerto entre corchetes', () => {
    expect(normalizeHostHeader('[::1]:3000')).toBe('::1');
  });
});

describe('classifyHost', () => {
  it('trata ausencia y local como legado en pruebas', () => {
    expect(classifyHost(undefined, { env: 'test' })).toMatchObject({ kind: 'legacy' });
    expect(classifyHost('localhost', { env: 'test' })).toMatchObject({ kind: 'legacy', hostname: 'localhost' });
    expect(classifyHost('127.0.0.1:5173', { env: 'development' })).toMatchObject({ kind: 'legacy' });
  });

  it('clasifica el legado de producción, la raíz y un sitio de grupo', () => {
    expect(classifyHost('fiestapay.somospanas.com', { env: 'production' })).toMatchObject({ kind: 'legacy' });
    expect(classifyHost('somospanas.com', { env: 'production' })).toMatchObject({ kind: 'root' });
    expect(classifyHost('www.somospanas.com', { env: 'production' })).toMatchObject({ kind: 'root' });
    expect(classifyHost('grupo.somospanas.com', { env: 'production' })).toMatchObject({
      kind: 'site',
      slug: 'grupo',
    });
  });

  it('marca inválidos: otro dominio, subdominio anidado y etiquetas reservadas', () => {
    expect(classifyHost('evil.example', { env: 'production' }).kind).toBe('invalid');
    expect(classifyHost('a.b.somospanas.com', { env: 'production' }).kind).toBe('invalid');
    expect(classifyHost('api.somospanas.com', { env: 'production' }).kind).toBe('invalid');
    expect(classifyHost('FIESTAPAY.SOMOSPANAS.COM:443', { env: 'production' }).kind).toBe('legacy');
  });

  it('en producción, host ausente es inválido', () => {
    expect(classifyHost(undefined, { env: 'production' }).kind).toBe('invalid');
  });

  it('en producción, localhost y 127.0.0.1 no son legado (D-1)', () => {
    expect(classifyHost('127.0.0.1:3000', { env: 'production' }).kind).toBe('invalid');
    expect(classifyHost('localhost', { env: 'production' }).kind).toBe('invalid');
  });
});

describe('isHostRoutable (antes de SP-3)', () => {
  it('solo raíz y legado enrutan; los sitios de grupo responden 404', () => {
    expect(isHostRoutable(classifyHost('somospanas.com', { env: 'production' }))).toBe(true);
    expect(isHostRoutable(classifyHost('grupo.somospanas.com', { env: 'production' }))).toBe(false);
  });
});

describe('origen por host', () => {
  const legacyAllowed = testConfig().allowedOrigins;

  it('el legado sigue la lista del servidor', () => {
    const legacy = classifyHost(undefined, { env: 'test' });
    expect(isOriginAllowedForHost(legacy, { origin: ORIGIN }, legacyAllowed)).toBe(true);
    expect(isOriginAllowedForHost(legacy, { origin: 'https://subdominio.somospanas.com' }, legacyAllowed)).toBe(
      false,
    );
  });

  it('la raíz no acepta el origen del legado', () => {
    const root = classifyHost('somospanas.com', { env: 'production' });
    expect(isOriginAllowedForHost(root, { origin: 'https://somospanas.com' }, legacyAllowed)).toBe(true);
    expect(isOriginAllowedForHost(root, { origin: ORIGIN }, legacyAllowed)).toBe(false);
  });
});

describe('hook en buildApp', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (app) await app.close();
    app = undefined;
  });

  it('sitio inexistente: 404 aunque el cliente envíe X-Forwarded-Host del legado', async () => {
    app = await buildApp({ pool: recordingPool(), config: testConfig(), logger: false });
    const res = await app.inject({
      method: 'GET',
      url: '/api/events',
      headers: {
        host: 'grupo.somospanas.com',
        'x-forwarded-host': 'fiestapay.somospanas.com',
      },
    });
    expect(res.statusCode).toBe(404);
  });

  it('mutación en raíz con origen del legado recibe 403', async () => {
    app = await buildApp({ pool: recordingPool(), config: testConfig(), logger: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/demo',
      headers: { host: 'somospanas.com', origin: ORIGIN },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('webhook sin Origin en host legado sigue verificando la firma', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, _init?: RequestInit) => {
        const href = String(url);
        if (href.endsWith('/v1/oauth2/token')) {
          return new Response(JSON.stringify({ access_token: 'tok-sandbox-test', expires_in: 3200 }), { status: 200 });
        }
        if (href.endsWith('/v1/notifications/verify-webhook-signature')) {
          return new Response(JSON.stringify({ verification_status: 'SUCCESS' }), { status: 200 });
        }
        throw new Error(`llamada PayPal no esperada: ${href}`);
      }),
    );
    const pool = {
      query: async (text: string) => {
        if (text.includes('INSERT')) return { rows: [], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Pool;
    app = await buildApp({ pool, config: testConfig(), logger: false });
    const res = await app.inject({
      method: 'POST',
      url: '/api/paypal/webhook',
      headers: {
        host: 'fiestapay.somospanas.com',
        'content-type': 'application/json',
        'paypal-auth-algo': 'SHA256withRSA',
        'paypal-cert-url': CERT_URL,
        'paypal-transmission-id': 'db49fb10-1343-11ef-ac58-e32457403f67',
        'paypal-transmission-sig': SIGNATURE,
        'paypal-transmission-time': '2024-05-16T05:19:23Z',
      },
      payload: RAW_BODY,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  // D-1: el sondeo del contenedor usa Host local en producción sin abrir el legado a esos nombres.
  describe('producción — exención /api/health (D-1)', () => {
    const prodConfig = () =>
      testConfig({
        NODE_ENV: 'production',
        PUBLIC_ORIGIN: 'https://fiestapay.somospanas.com',
        ALLOWED_ORIGINS: 'https://fiestapay.somospanas.com',
      });

    const internalHosts = ['127.0.0.1:3000', 'localhost', 'fiestapay-api:3000'] as const;

    beforeEach(async () => {
      app = await buildApp({ pool: recordingPool(), config: prodConfig(), logger: false });
    });

    for (const host of internalHosts) {
      it(`GET /api/health con Host ${host} responde 200`, async () => {
        const res = await app!.inject({
          method: 'GET',
          url: '/api/health',
          headers: { host },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ ok: true });
      });

      it(`GET /api/events con Host ${host} responde 404`, async () => {
        const res = await app!.inject({
          method: 'GET',
          url: '/api/events',
          headers: { host },
        });
        expect(res.statusCode).toBe(404);
      });
    }

    it('HEAD /api/health con Host 127.0.0.1:3000 responde sin 404', async () => {
      const res = await app!.inject({
        method: 'HEAD',
        url: '/api/health',
        headers: { host: '127.0.0.1:3000' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('legado sigue enrutable: GET /api/health y GET /api/events', async () => {
      const health = await app!.inject({
        method: 'GET',
        url: '/api/health',
        headers: { host: 'fiestapay.somospanas.com' },
      });
      expect(health.statusCode).toBe(200);

      const events = await app!.inject({
        method: 'GET',
        url: '/api/events',
        headers: { host: 'fiestapay.somospanas.com' },
      });
      expect(events.statusCode).toBe(200);
    });

    it('raíz sigue enrutable: GET /api/health en somospanas.com', async () => {
      const res = await app!.inject({
        method: 'GET',
        url: '/api/health',
        headers: { host: 'somospanas.com' },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});