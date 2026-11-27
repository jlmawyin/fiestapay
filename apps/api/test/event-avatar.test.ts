/**
 * Avatar Napster con foto del organizador (NAP-F6s).
 * Depende de PostgreSQL 16, `migrate` y un fetch falso de Napster; sin red real.
 */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { FakePayPal } from './fake-paypal.js';
import { announceSkipWithoutDatabase, body, Client, DATABASE_URL, MERCHANT, testConfig } from './harness.js';

announceSkipWithoutDatabase('event-avatar.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03]);
const PNG_URL = `data:image/png;base64,${PNG.toString('base64')}`;
const eventInput = (title: string) => ({
  title,
  template: 'evento',
  meal: 'cena',
  description: 'Reunión con avatar propio',
  startsAt: '2026-12-20T19:00:00.000Z',
  endsAt: '2026-12-20T23:00:00.000Z',
  location: 'Quito',
  includes: ['Entrada'],
  priceCents: 1000,
  capacity: 10,
  goalCents: null,
  minimumCents: null,
  agenda: [],
});

function fakeNapster() {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname;
    const method = init?.method ?? 'GET';
    if (method === 'POST' && path === '/public/companions') {
      return new Response(JSON.stringify({ id: 'comp_new', status: 'pending' }), { status: 200 });
    }
    if (method === 'GET' && path === '/public/companions/comp_new') {
      return new Response(JSON.stringify({ id: 'comp_new', status: 'readyToUse' }), { status: 200 });
    }
    if (method === 'GET' && /^\/public\/agents\/agent-(es|en)$/.test(path)) {
      return new Response(
        JSON.stringify({
          id: path.endsWith('es') ? 'agent-es' : 'agent-en',
          voiceId: 'voz-demo',
          providerSettings: { instructions: 'base' },
          functions: ['fn_1'],
          faqCollections: ['faq_1'],
        }),
        { status: 200 },
      );
    }
    if (method === 'POST' && path === '/public/agents') {
      const payload = JSON.parse(String(init?.body ?? '{}')) as { name?: string };
      return new Response(JSON.stringify({ id: String(payload.name).endsWith('-es') ? 'agent-custom-es' : 'agent-custom-en' }), { status: 200 });
    }
    if (method === 'PUT' && path.endsWith('/channels/webrtc')) return new Response(null, { status: 204 });
    if (method === 'DELETE' && path.startsWith('/public/agents/')) return new Response(null, { status: 204 });
    if (method === 'POST' && path.endsWith('/connections')) {
      return new Response(JSON.stringify({ token: 'tok-custom', connection: { id: 'conn-custom' } }), { status: 200 });
    }
    return new Response(JSON.stringify({ error: 'unexpected' }), { status: 500 });
  });
}

describeDb('avatar con foto del organizador (NAP-F6s)', () => {
  const schema = `fp_test_${randomBytes(5).toString('hex')}`;
  let pool: Pool;
  let adminPool: Pool;
  let app: FastifyInstance;
  let fetchMock: ReturnType<typeof fakeNapster>;

  beforeAll(async () => {
    pool = createPool({ connectionString: DATABASE_URL!, schema });
    adminPool = createPool({ connectionString: DATABASE_URL!, max: 2 });
    await migrate(pool, { schema });
    fetchMock = fakeNapster();
    vi.stubGlobal('fetch', fetchMock);
    app = await buildApp({
      pool,
      config: testConfig({
        NAPSTER_ENABLED: 'true',
        NAPSTER_API_KEY: 'napster-secret',
        NAPSTER_API_BASE: 'https://napster.test',
        NAPSTER_AGENT_ID_ES: 'agent-es',
        NAPSTER_AGENT_ID_EN: 'agent-en',
      }),
      paypal: new FakePayPal(MERCHANT),
      logger: false,
    });
    await app.ready();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app?.close();
    await pool?.end();
    if (adminPool) {
      await adminPool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await adminPool.end();
    }
  });

  async function createOwnedEvent(client = new Client(app)) {
    const created = body<{ event: { id: string; slug: string }; adminKey: string }>(
      await client.post('/api/events', eventInput(`Reunión ${randomBytes(2).toString('hex')}`)),
    );
    client.authorize(created.event.slug, created.adminKey);
    return { client, ...created };
  }

  it('flujo uploaded→generating→ready, media y borrado de bytes', async () => {
    const { client, event } = await createOwnedEvent();
    const upload = await client.post(`/api/events/${event.slug}/avatar`, {
      consent: true,
      firstName: 'Ana',
      photo: PNG_URL,
    });
    expect(upload.statusCode).toBe(200);
    expect(body<{ status: string }>(upload).status).toBe('generating');

    const { rows } = await pool.query<{ photo_token: string; photo_bytes: Buffer | null }>(
      'SELECT photo_token, photo_bytes FROM event_avatars WHERE event_id = $1',
      [event.id],
    );
    const token = rows[0]!.photo_token;
    expect(rows[0]!.photo_bytes).not.toBeNull();

    const media = await app.inject({ method: 'GET', url: `/media/avatar/${token}` });
    expect(media.statusCode).toBe(200);
    expect(media.headers['content-type']).toContain('image/png');
    expect(media.headers['cache-control']).toBe('no-store');
    expect(media.rawPayload.equals(PNG)).toBe(true);

    const status = await client.get(`/api/events/${event.slug}/avatar`);
    expect(status.statusCode).toBe(200);
    expect(body<{ status: string; ready: boolean }>(status)).toMatchObject({ status: 'ready', ready: true });

    const after = await pool.query<{ photo_bytes: Buffer | null; agent_id_es: string; agent_id_en: string }>(
      'SELECT photo_bytes, agent_id_es, agent_id_en FROM event_avatars WHERE event_id = $1',
      [event.id],
    );
    expect(after.rows[0]!.photo_bytes).toBeNull();
    expect(after.rows[0]!.agent_id_es).toBe('agent-custom-es');
    expect(after.rows[0]!.agent_id_en).toBe('agent-custom-en');
    expect((await app.inject({ method: 'GET', url: `/media/avatar/${token}` })).statusCode).toBe(404);

    const session = await client.post('/api/avatar-session', { lang: 'es', eventSlug: event.slug });
    expect(session.statusCode).toBe(200);
    expect(body<{ agent: string }>(session).agent).toBe('custom');
    const called = fetchMock.mock.calls.some(([url]) => String(url).includes('/agents/agent-custom-es/connections'));
    expect(called).toBe(true);

    const deleted = await client.delete(`/api/events/${event.slug}/avatar`);
    expect(deleted.statusCode).toBe(204);
    const fallback = await client.post('/api/avatar-session', { lang: 'es', eventSlug: event.slug });
    expect(body<{ agent: string }>(fallback).agent).toBe('default');
    const deleteCalls = fetchMock.mock.calls.filter(([url, init]) => String(url).includes('/public/agents/agent-custom-') && init?.method === 'DELETE');
    expect(deleteCalls.length).toBe(2);
  });

  it('rechaza sin clave, sin consentimiento, foto inválida y foto mayor a 5 MB', async () => {
    const { client, event } = await createOwnedEvent();
    const path = `/api/events/${event.slug}/avatar`;
    const unauthorized = await new Client(app).post(path, { consent: true, firstName: 'Ana', photo: PNG_URL });
    expect(unauthorized.statusCode).toBe(403);

    expect((await client.post(path, { firstName: 'Ana', photo: PNG_URL })).statusCode).toBe(400);
    expect((await client.post(path, { consent: true, firstName: 'Ana', photo: 'data:image/png;base64,AAAA' })).statusCode).toBe(400);
    const big = Buffer.alloc(5 * 1024 * 1024 + 100, 1);
    big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
    const bigUrl = `data:image/jpeg;base64,${big.toString('base64')}`;
    expect((await client.post(path, { consent: true, firstName: 'Ana', photo: bigUrl })).statusCode).toBe(400);
  });

  it('limita a 40 eventos con avatar propio', async () => {
    const { client, event } = await createOwnedEvent();
    for (let i = 0; i < 40; i += 1) {
      const demo = body<{ event: { id: string } }>(await client.post('/api/demo', { kind: 'private' }));
      await pool.query(
        `INSERT INTO event_avatars (event_id, consent_at, first_name, photo_mime, photo_token, status)
         VALUES ($1, now(), 'Límite', 'image/png', $2, 'uploaded')`,
        [demo.event.id, randomBytes(16).toString('base64url')],
      );
    }
    const response = await client.post(`/api/events/${event.slug}/avatar`, {
      consent: true,
      firstName: 'Ana',
      photo: PNG_URL,
    });
    expect(response.statusCode).toBe(409);
    expect(body<{ error: string }>(response).error).toBe('avatar_limit');
  });
});
