import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { Pool } from '../src/db/pool.js';
import { testConfig } from './harness.js';

/**
 * RSA-2048 signature from the official postback sample:
 * https://developer.paypal.com/api/rest/webhooks/rest/
 * verify-webhook-signature schema: transmission_sig maxLength 500, cert_url maxLength 500.
 */
const SIGNATURE =
  'ab2tJk1VCFm4EqdSuKqezr38rTdY3JeRQlw94V1xYAIQVgLScAFn2XLRAhtyo/1jp8RZPO80hLpWfbdvvwyxK1u6L6NX/bnr0vA1wpfkwbqDT/Z01YP2VvJiYQdhpf/yXosoIKwP+37pYdAhwCsIu2D5fJAaDXpM8A06SpZJkR4f5+k566PDVPP7RCED9Xny4Yo0WyVaFORkiDJkBLGhUUIoO7Jv5JP5RQmFqVxhwSAaf4YYy/2r21r5HMQgAIgtS7oHYRea43Ze03Zz0EWqJu/hvKBzKHqhcvUPF64hVg8Nk2yqjnW7ZHgBWoHil2SJ1xQzaq2vDCXv5gWDn5+TZA==';

/** Longer than the old 200 cap, still inside the official 500 cert_url maximum. */
const CERT_URL = `https://api.sandbox.paypal.com/v1/notifications/certs/CERT-${'a'.repeat(160)}`;
const TRANSMISSION_ID = 'db49fb10-1343-11ef-ac58-e32457403f67';
const TRANSMISSION_TIME = '2024-05-16T05:19:23Z';
const AUTH_ALGO = 'SHA256withRSA';

/**
 * Spacing is deliberate. Re-serializing the parsed object would not match these bytes,
 * and PayPal verification fails when the body is rewritten.
 */
const RAW_BODY =
  '{ "id" : "WH-HARMLESS-1" , "event_type" : "CUSTOMER.MANAGED-ACCOUNT.CREATED" , "resource" : { "id" : "ACCT-1" } }';

interface SqlCall {
  text: string;
  params: unknown[] | undefined;
}

interface FetchCall {
  url: string;
  body: string | undefined;
}

function recordingPool(): { pool: Pool; queries: SqlCall[] } {
  const queries: SqlCall[] = [];
  const pool = {
    query: async (text: string, params?: unknown[]) => {
      queries.push({ text, params });
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
  return { pool, queries };
}

function stubPayPal(status: 'SUCCESS' | 'FAILURE'): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      const body = typeof init?.body === 'string' ? init.body : undefined;
      calls.push({ url: href, body });
      if (href.endsWith('/v1/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 'tok-sandbox-test', expires_in: 3200 }), { status: 200 });
      }
      if (href.endsWith('/v1/notifications/verify-webhook-signature')) {
        return new Response(JSON.stringify({ verification_status: status }), { status: 200 });
      }
      throw new Error(`llamada PayPal no esperada: ${href}`);
    }),
  );
  return calls;
}

function paypalHeaders(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'content-type': 'application/json',
    'paypal-auth-algo': AUTH_ALGO,
    'paypal-cert-url': CERT_URL,
    'paypal-transmission-id': TRANSMISSION_ID,
    'paypal-transmission-sig': SIGNATURE,
    'paypal-transmission-time': TRANSMISSION_TIME,
    ...overrides,
  };
}

function assertNoMoney(queries: SqlCall[], calls: FetchCall[]): void {
  const sql = queries.map((q) => q.text).join('\n');
  expect(sql).not.toMatch(/orders|captures|payments|refunds|guests|quotes|rsvp/i);
  for (const call of calls) {
    expect(call.url).not.toMatch(/\/v2\/checkout\/orders|\/v2\/payments\//);
  }
}

describe('firma de webhook con encabezados reales', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    vi.unstubAllGlobals();
    if (app) await app.close();
    app = undefined;
  });

  it('mide la firma oficial en 344 y deja el cert_url entre 201 y 500', () => {
    expect(SIGNATURE.length).toBe(344);
    expect(CERT_URL.length).toBeGreaterThan(200);
    expect(CERT_URL.length).toBeLessThanOrEqual(500);
    expect(SIGNATURE.length).toBeGreaterThan(200);
  });

  it('acepta SUCCESS y reenvia la firma y el cuerpo crudo sin cambios', async () => {
    const calls = stubPayPal('SUCCESS');
    const { pool, queries } = recordingPool();
    app = await buildApp({ pool, config: testConfig(), logger: false });

    const res = await app.inject({
      method: 'POST',
      url: '/api/paypal/webhook',
      headers: paypalHeaders(),
      payload: RAW_BODY,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    const verify = calls.find((c) => c.url.endsWith('/v1/notifications/verify-webhook-signature'));
    expect(verify?.body).toBeTypeOf('string');
    const body = verify!.body!;
    expect(body.endsWith(`"webhook_event":${RAW_BODY}}`)).toBe(true);
    const parsed = JSON.parse(body) as {
      auth_algo: string;
      cert_url: string;
      transmission_id: string;
      transmission_sig: string;
      transmission_time: string;
      webhook_id: string;
    };
    expect(parsed.transmission_sig).toBe(SIGNATURE);
    expect(parsed.cert_url).toBe(CERT_URL);
    expect(parsed.auth_algo).toBe(AUTH_ALGO);
    expect(parsed.transmission_id).toBe(TRANSMISSION_ID);
    expect(parsed.transmission_time).toBe(TRANSMISSION_TIME);
    expect(parsed.webhook_id).toBe('WH-CONFIG');
    expect(calls.map((c) => c.url).every((url) => url.startsWith('https://api-m.sandbox.paypal.com/'))).toBe(true);

    expect(queries.map((q) => q.text)).toEqual([
      'SELECT id FROM webhook_events WHERE id = $1',
      'INSERT INTO webhook_events (id, event_type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING',
    ]);
    expect(queries[0]?.params).toEqual(['WH-HARMLESS-1']);
    expect(queries[1]?.params).toEqual(['WH-HARMLESS-1', 'CUSTOMER.MANAGED-ACCOUNT.CREATED']);
    assertNoMoney(queries, calls);
  });

  it('rechaza FAILURE de PayPal sin tocar la base', async () => {
    const calls = stubPayPal('FAILURE');
    const { pool, queries } = recordingPool();
    app = await buildApp({ pool, config: testConfig(), logger: false });

    const res = await app.inject({
      method: 'POST',
      url: '/api/paypal/webhook',
      headers: paypalHeaders(),
      payload: RAW_BODY,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Firma de webhook invalida' });
    expect(calls.some((c) => c.url.endsWith('/v1/notifications/verify-webhook-signature'))).toBe(true);
    const verify = calls.find((c) => c.url.endsWith('/v1/notifications/verify-webhook-signature'));
    expect(JSON.parse(verify!.body!).transmission_sig).toBe(SIGNATURE);
    expect(verify!.body!.endsWith(`"webhook_event":${RAW_BODY}}`)).toBe(true);
    expect(queries).toEqual([]);
    assertNoMoney(queries, calls);
  });

  it('rechaza firma ausente o por encima de 500 sin llamar a PayPal', async () => {
    const cases: Record<string, string>[] = [
      (() => {
        const headers = paypalHeaders();
        delete headers['paypal-transmission-sig'];
        return headers;
      })(),
      paypalHeaders({ 'paypal-transmission-sig': `${'A'.repeat(500)}=` }),
      paypalHeaders({ 'paypal-cert-url': `${CERT_URL}${'b'.repeat(500)}` }),
      paypalHeaders({ 'paypal-transmission-id': 'T'.repeat(201) }),
    ];

    for (const headers of cases) {
      const calls = stubPayPal('SUCCESS');
      const { pool, queries } = recordingPool();
      const local = await buildApp({ pool, config: testConfig(), logger: false });
      try {
        const res = await local.inject({
          method: 'POST',
          url: '/api/paypal/webhook',
          headers,
          payload: RAW_BODY,
        });
        expect(res.statusCode).toBe(400);
        expect(res.json()).toEqual({ error: 'Firma de webhook invalida' });
        expect(calls).toEqual([]);
        expect(queries).toEqual([]);
      } finally {
        await local.close();
      }
    }
  });

  it('acepta una firma de exactamente 500 caracteres y la reenvia igual', async () => {
    const signature = `${'A'.repeat(499)}+`;
    expect(signature.length).toBe(500);
    const calls = stubPayPal('SUCCESS');
    const { pool, queries } = recordingPool();
    app = await buildApp({ pool, config: testConfig(), logger: false });

    const res = await app.inject({
      method: 'POST',
      url: '/api/paypal/webhook',
      headers: paypalHeaders({ 'paypal-transmission-sig': signature }),
      payload: RAW_BODY,
    });

    expect(res.statusCode).toBe(200);
    const verify = calls.find((c) => c.url.endsWith('/v1/notifications/verify-webhook-signature'));
    expect(JSON.parse(verify!.body!).transmission_sig).toBe(signature);
    assertNoMoney(queries, calls);
  });
});
