/**
 * Servidor de sesiones de avatar Napster (NAP-F2), con fetch falso y sin red.
 * Depende de `buildApp`, el cliente Napster y un pool falso para la lectura de eventos.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import type { Pool } from '../src/db/pool.js';
import { createNapsterClient } from '../src/napster/client.js';
import { sha256 } from '../src/lib/ids.js';
import { testConfig } from './harness.js';

const KEY = 'napster-secret-key';
const ROOT_HOST = 'somospanas.com';
const ROOT_ORIGIN = 'https://somospanas.com';
const LEGACY_HOST = 'fiestapay.somospanas.com';
const LEGACY_ORIGIN = 'http://localhost:5173';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function successfulFetch(connectionId = 'conn-1') {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    jsonResponse(200, { token: 'ephemeral-token', connection: { id: connectionId } }),
  );
}

function eventRow(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: '00000000-0000-4000-8000-000000000001',
    slug: 'fiesta-privada',
    organizer_session_id: '00000000-0000-4000-8000-000000000002',
    generation: 1,
    archived: false,
    title: 'Fiesta privada',
    template: 'evento',
    meal: 'cena',
    description: 'Solo con código',
    starts_at: new Date(now.getTime() + 86_400_000),
    location: 'Casa',
    includes: [],
    agenda: [],
    price_cents: 1000,
    capacity: 10,
    goal_cents: null,
    minimum_cents: null,
    confirmed: false,
    created_at: now,
    ends_at: new Date(now.getTime() + 172_800_000),
    closed_at: null,
    purged_at: null,
    is_demo: false,
    admin_key_hash: null,
    access_code_hash: Buffer.from('hash'),
    funding_deadline_at: null,
    funding_status: 'inactive',
    funding_decided_at: null,
    funding_basis_cents: null,
    ...overrides,
  };
}

/** Pool mínimo: responde la lectura por slug y el tenant del evento. */
function fakePool(event = eventRow(), tenant: { tenant_id: string | null; visibility: string } = { tenant_id: null, visibility: 'public' }) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('FROM events WHERE slug')) return { rows: [event] };
      if (sql.includes('SELECT tenant_id, visibility FROM events')) return { rows: [tenant] };
      return { rows: [] };
    }),
  } as unknown as Pool;
}

/** Pool para el host de un sitio: tenant del host, evento y nombre visible. */
function sitePool(
  event: Record<string, unknown>,
  tenantId: string,
  displayName: string,
  portalRow: Record<string, unknown> | null = null,
  hostTenantId = tenantId,
) {
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes('JOIN tenants t ON t.id = e.tenant_id')) return { rows: portalRow ? [portalRow] : [] };
      if (sql.includes('FROM events WHERE slug')) return { rows: [event] };
      if (sql.includes('SELECT tenant_id, visibility FROM events')) return { rows: [{ tenant_id: tenantId, visibility: 'private' }] };
      if (sql.includes('SELECT id FROM tenants WHERE slug')) return { rows: [{ id: hostTenantId }] };
      if (sql.includes('SELECT display_name FROM tenant_settings')) return { rows: [{ display_name: displayName }] };
      if (sql.includes('SELECT modulo_asistente')) return { rows: [{ modulo_asistente: false }] };
      return { rows: [] };
    }),
  } as unknown as Pool;
}

function config(overrides: Record<string, string | undefined> = {}) {
  return testConfig({
    NAPSTER_ENABLED: 'true',
    NAPSTER_API_KEY: KEY,
    NAPSTER_API_BASE: 'https://napster.test',
    NAPSTER_AGENT_ID_ES: 'agent-es',
    NAPSTER_AGENT_ID_EN: 'agent-en',
    ...overrides,
  });
}

async function appWith(pool: Pool, overrides: Record<string, string | undefined> = {}): Promise<FastifyInstance> {
  return buildApp({ pool, config: config(overrides), logger: false });
}

async function post(
  app: FastifyInstance,
  url: string,
  payload: object,
  host = ROOT_HOST,
  origin = ROOT_ORIGIN,
  extraHeaders: Record<string, string> = {},
) {
  return app.inject({ method: 'POST', url, payload, headers: { host, origin, ...extraHeaders } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cliente Napster (NAP-F2)', () => {
  it('serializa dos conexiones con al menos 1 s usando reloj falso', async () => {
    const sleeps: number[] = [];
    const fetchImpl = successfulFetch();
    const client = createNapsterClient({
      apiKey: KEY,
      baseUrl: 'https://napster.test',
      fetchImpl,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      now: () => 0,
    });
    await client.createConnection('agent-es', { channelType: 'webrtc' });
    await client.createConnection('agent-es', { channelType: 'webrtc' });
    // NAP-F2-D4: con reloj falso la espera incluye margen; nunca baja de 1000 ms.
    expect(sleeps.length).toBeGreaterThan(0);
    for (const ms of sleeps) expect(ms).toBeGreaterThanOrEqual(1000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reintenta una vez un 429 y respeta Retry-After', async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { code: 'RequestRateLimitExceeded' }, { 'retry-after': '1' }))
      .mockResolvedValueOnce(jsonResponse(200, { token: 'tok', connection: { id: 'conn-429' } }));
    const client = createNapsterClient({
      apiKey: KEY,
      fetchImpl,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      now: () => 10,
    });
    const result = await client.createConnection('agent-es', {});
    expect(result.connectionId).toBe('conn-429');
    expect(sleeps).toContain(1000);
  });

  it('traduce 409/403/401 a errores tipados', async () => {
    const clientFor = (status: number) =>
      createNapsterClient({
        apiKey: KEY,
        fetchImpl: vi.fn(async () => jsonResponse(status, {})),
        sleep: async () => undefined,
        now: () => 20,
      });
    await expect(clientFor(409).createConnection('a', {})).rejects.toMatchObject({ kind: 'busy' });
    await expect(clientFor(403).createConnection('a', {})).rejects.toMatchObject({ kind: 'no_credits' });
    await expect(clientFor(401).createConnection('a', {})).rejects.toMatchObject({ kind: 'unauthorized' });
  });
});

describe('POST /api/avatar-session (NAP-F2)', () => {
  it('devuelve token y handle, elige agente por idioma y no filtra connectionId ni la clave', async () => {
    const fake = successfulFetch();
    vi.stubGlobal('fetch', fake);
    const app = await appWith(fakePool());
    const es = await post(app, '/api/avatar-session', { lang: 'es' });
    expect(es.statusCode).toBe(200);
    const esBody = es.json<Record<string, unknown>>();
    expect(esBody.visitor).toBe('public');
    expect(esBody.agent).toBe('default');
    expect(typeof esBody.token).toBe('string');
    expect(typeof esBody.handle).toBe('string');
    expect(es.body).not.toContain('connectionId');
    expect(es.body).not.toContain(KEY);

    const [url, init] = fake.mock.calls[0]!;
    expect(String(url)).toBe('https://napster.test/public/agents/agent-es/connections');
    expect((init as RequestInit).headers).toMatchObject({ 'X-Api-Key': KEY });
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ channelType: 'webrtc' });

    const en = await post(app, '/api/avatar-session', { lang: 'en' });
    expect(en.statusCode).toBe(200);
    expect(String(fake.mock.calls[1]![0])).toContain('/agents/agent-en/connections');
    await app.close();
  });

  it('en modo texto crea websocket + modality text y devuelve la URL del socket', async () => {
    const socketUrl = 'https://ws.napster.test/session?token=abc';
    const token = Buffer.from(JSON.stringify({ url: socketUrl })).toString('base64');
    const fake = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(200, { token, connection: { id: 'conn-text' } }),
    );
    vi.stubGlobal('fetch', fake);
    const app = await appWith(fakePool());
    const response = await post(app, '/api/avatar-session', { lang: 'es', mode: 'text' });
    expect(response.statusCode).toBe(200);
    expect(response.json<{ socketUrl: string }>().socketUrl).toBe(socketUrl);
    const body = JSON.parse(String((fake.mock.calls[0]![1] as RequestInit).body)) as Record<string, unknown>;
    expect(body).toMatchObject({ channelType: 'websocket', modality: 'text' });
    await app.close();
  });

  it('mapea busy, rate limit y no credits', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(409, { code: 'ConcurrentSessionLimitReached' })));
    const appBusy = await appWith(fakePool());
    expect((await post(appBusy, '/api/avatar-session', { lang: 'es' })).statusCode).toBe(409);
    // NAP-F4s: el modo texto comparte el mismo mapeo de errores del proveedor.
    expect((await post(appBusy, '/api/avatar-session', { lang: 'es', mode: 'text' })).statusCode).toBe(409);
    await appBusy.close();

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(429, {}, { 'retry-after': '1' }))
        .mockResolvedValueOnce(jsonResponse(429, {}, { 'retry-after': '1' })),
    );
    const appRate = await appWith(fakePool());
    const rate = await post(appRate, '/api/avatar-session', { lang: 'es' });
    expect(rate.statusCode).toBe(429);
    expect(rate.json<{ error: string }>().error).toBe('avatar_rate_limited');
    await appRate.close();

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(403, { code: 'InactiveSubscription' })));
    const appCredits = await appWith(fakePool());
    const credits = await post(appCredits, '/api/avatar-session', { lang: 'es' });
    expect(credits.statusCode).toBe(503);
    expect(credits.json<{ error: string }>().error).toBe('avatar_no_credits');
    await appCredits.close();
  });

  it('responde 503 avatar_disabled sin clave y no llama a Napster', async () => {
    const fetchMock = successfulFetch();
    vi.stubGlobal('fetch', fetchMock);
    const app = await appWith(fakePool(), { NAPSTER_ENABLED: 'false', NAPSTER_API_KEY: '' });
    const response = await post(app, '/api/avatar-session', { lang: 'es' });
    expect(response.statusCode).toBe(503);
    expect(response.json<{ error: string }>().error).toBe('avatar_disabled');
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('responde 503 avatar_disabled si falta el agentId del idioma', async () => {
    const fetchMock = successfulFetch();
    vi.stubGlobal('fetch', fetchMock);
    const app = await appWith(fakePool(), { NAPSTER_AGENT_ID_ES: '' });
    const response = await post(app, '/api/avatar-session', { lang: 'es' });
    expect(response.statusCode).toBe(503);
    expect(response.json<{ error: string }>().error).toBe('avatar_disabled');
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('un evento privado responde 404 event_not_found sin llamar a Napster', async () => {
    const fetchMock = successfulFetch();
    vi.stubGlobal('fetch', fetchMock);
    const app = await appWith(fakePool());
    const response = await post(
      app,
      '/api/avatar-session',
      { lang: 'es', eventSlug: 'fiesta-privada' },
      LEGACY_HOST,
      LEGACY_ORIGIN,
    );
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: string }>().error).toBe('event_not_found');
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('/end llama DELETE una vez y es idempotente', async () => {
    const fake = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/public/connections/')) return new Response(null, { status: 204 });
      return jsonResponse(200, { token: 'tok', connection: { id: 'conn-end' } });
    });
    vi.stubGlobal('fetch', fake);
    const app = await appWith(fakePool());
    const creada = await post(app, '/api/avatar-session', { lang: 'es' });
    const handle = creada.json<{ handle: string }>().handle;

    const primero = await post(app, '/api/avatar-session/end', { handle });
    expect(primero.statusCode).toBe(204);
    const segundo = await post(app, '/api/avatar-session/end', { handle });
    expect(segundo.statusCode).toBe(204);
    const deletes = fake.mock.calls.filter(([url]) => String(url).includes('/public/connections/'));
    expect(deletes).toHaveLength(1);
    expect(String(deletes[0]![0])).toContain('/public/connections/conn-end');
    await app.close();
  });

  it('reutiliza un cliente por app y separa dos conexiones al menos 1 s', async () => {
    // NAP-F2-D4: reloj falso determinista; el margen de la implementación debe dar ≥1000 ms.
    vi.useFakeTimers({ now: 10_000 });
    try {
      const tiempos: number[] = [];
      const fake = vi.fn(async () => {
        tiempos.push(Date.now());
        return jsonResponse(200, { token: 'tok', connection: { id: `conn-${tiempos.length}` } });
      });
      vi.stubGlobal('fetch', fake);
      const app = await appWith(fakePool());
      const primero = post(app, '/api/avatar-session', { lang: 'es' });
      await vi.advanceTimersByTimeAsync(2_000);
      expect((await primero).statusCode).toBe(200);
      const segundo = post(app, '/api/avatar-session', { lang: 'es' });
      await vi.advanceTimersByTimeAsync(2_000);
      expect((await segundo).statusCode).toBe(200);
      expect(tiempos).toHaveLength(2);
      expect(tiempos[1]! - tiempos[0]!).toBeGreaterThanOrEqual(1000);
      await app.close();
    } finally {
      vi.useRealTimers();
    }
  }, 15_000);

  it('en el host del sitio acepta un evento private sin código y lo saluda con su título', async () => {
    const fake = successfulFetch('conn-site');
    vi.stubGlobal('fetch', fake);
    const event = eventRow({ slug: 'asado-grupo', title: 'Asado del grupo', access_code_hash: null });
    const app = await appWith(sitePool(event, 'tenant-a', 'Grupo A'));
    const response = await post(
      app,
      '/api/avatar-session',
      { lang: 'es', eventSlug: 'asado-grupo' },
      'grupo-a.somospanas.com',
      'https://grupo-a.somospanas.com',
    );
    expect(response.statusCode).toBe(200);
    expect(response.json<{ visitor: string }>().visitor).toBe('guest');
    const body = JSON.parse(String((fake.mock.calls[0]![1] as RequestInit).body)) as {
      externalClientProfile: Record<string, unknown>;
      initialSpeech: string;
    };
    expect(body.externalClientProfile).toEqual({
      visitorType: 'guest',
      lang: 'es',
      eventTitle: 'Asado del grupo',
      siteName: 'Grupo A',
    });
    expect(body.initialSpeech).toContain('Asado del grupo');
    expect(body.initialSpeech).toContain('Grupo A');
    await app.close();
  });

  it('oculta en la raíz un evento private de grupo, sin llamar a Napster', async () => {
    const fetchMock = successfulFetch();
    vi.stubGlobal('fetch', fetchMock);
    const event = eventRow({ slug: 'privado-grupo', title: 'Privado', access_code_hash: null });
    const pool = sitePool(event, 'tenant-a', 'Grupo A', {
      tenant_kind: 'group',
      tenant_id: 'tenant-a',
      visibility: 'private',
    });
    const app = await appWith(pool);
    const response = await post(app, '/api/avatar-session', { lang: 'es', eventSlug: 'privado-grupo' });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: string }>().error).toBe('event_not_found');
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('rechaza un evento del sitio B pedido desde el host del sitio A', async () => {
    const fetchMock = successfulFetch();
    vi.stubGlobal('fetch', fetchMock);
    const event = eventRow({ slug: 'evento-b', title: 'Evento B', access_code_hash: null });
    const app = await appWith(sitePool(event, 'tenant-b', 'Grupo B', null, 'tenant-a'));
    const response = await post(
      app,
      '/api/avatar-session',
      { lang: 'es', eventSlug: 'evento-b' },
      'grupo-a.somospanas.com',
      'https://grupo-a.somospanas.com',
    );
    expect(response.statusCode).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('rechaza un evento con código de acceso sin desbloquear', async () => {
    const fetchMock = successfulFetch();
    vi.stubGlobal('fetch', fetchMock);
    const event = eventRow({ slug: 'con-codigo', title: 'Con código' });
    const app = await appWith(sitePool(event, 'tenant-a', 'Grupo A'));
    const response = await post(
      app,
      '/api/avatar-session',
      { lang: 'es', eventSlug: 'con-codigo' },
      'grupo-a.somospanas.com',
      'https://grupo-a.somospanas.com',
    );
    expect(response.statusCode).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('en el legado, intent=create usa el recorrido de creador', async () => {
    const fake = successfulFetch('conn-creator');
    vi.stubGlobal('fetch', fake);
    const app = await appWith(fakePool());
    const response = await post(
      app,
      '/api/avatar-session',
      { lang: 'es', intent: 'create' },
      LEGACY_HOST,
      LEGACY_ORIGIN,
    );
    expect(response.statusCode).toBe(200);
    expect(response.json<{ visitor: string }>().visitor).toBe('creator');
    const body = JSON.parse(String((fake.mock.calls[0]![1] as RequestInit).body)) as {
      externalClientProfile: Record<string, unknown>;
    };
    expect(body.externalClientProfile.visitorType).toBe('creator');
    await app.close();
  });

  it('en el legado, la clave válida del organizador abre el panel como creador', async () => {
    const clave = 'clave-organizador';
    const fake = successfulFetch('conn-panel');
    vi.stubGlobal('fetch', fake);
    const event = eventRow({
      slug: 'reunion-legado',
      title: 'Reunión del grupo',
      access_code_hash: null,
      admin_key_hash: sha256(clave),
    });
    const app = await appWith(fakePool(event));
    const response = await post(
      app,
      '/api/avatar-session',
      { lang: 'es', eventSlug: 'reunion-legado' },
      LEGACY_HOST,
      LEGACY_ORIGIN,
      { 'x-fiesta-admin-key': clave },
    );
    expect(response.statusCode).toBe(200);
    expect(response.json<{ visitor: string }>().visitor).toBe('creator');
    const body = JSON.parse(String((fake.mock.calls[0]![1] as RequestInit).body)) as {
      externalClientProfile: Record<string, unknown>;
    };
    expect(body.externalClientProfile).toMatchObject({
      visitorType: 'creator',
      eventTitle: 'Reunión del grupo',
    });
    await app.close();
  });

  it('en el legado, sin clave o con clave inválida el evento sigue siendo de invitado', async () => {
    const clave = 'clave-organizador';
    const fake = successfulFetch('conn-guest');
    vi.stubGlobal('fetch', fake);
    const event = eventRow({
      slug: 'reunion-legado',
      title: 'Reunión del grupo',
      access_code_hash: null,
      admin_key_hash: sha256(clave),
    });
    const app = await appWith(fakePool(event));
    const sinClave = await post(
      app,
      '/api/avatar-session',
      { lang: 'es', eventSlug: 'reunion-legado' },
      LEGACY_HOST,
      LEGACY_ORIGIN,
    );
    expect(sinClave.json<{ visitor: string }>().visitor).toBe('guest');
    const invalida = await post(
      app,
      '/api/avatar-session',
      { lang: 'es', eventSlug: 'reunion-legado' },
      LEGACY_HOST,
      LEGACY_ORIGIN,
      { 'x-fiesta-admin-key': 'clave-incorrecta' },
    );
    expect(invalida.statusCode).toBe(200);
    expect(invalida.json<{ visitor: string }>().visitor).toBe('guest');
    expect(invalida.body).not.toContain('clave-organizador');
    await app.close();
  });

  it('limita a 6 sesiones por IP cada 10 minutos', async () => {
    vi.stubGlobal('fetch', successfulFetch());
    const app = await appWith(fakePool());
    for (let i = 0; i < 6; i += 1) {
      expect((await post(app, '/api/avatar-session', { lang: 'es' })).statusCode).toBe(200);
    }
    const septima = await post(app, '/api/avatar-session', { lang: 'es' });
    expect(septima.statusCode).toBe(429);
    expect(septima.json<{ error: string }>().error).toBe('avatar_rate_limited');
    await app.close();
  }, 30_000);
});
