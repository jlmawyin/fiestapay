/**
 * SP-6 — listado público en la raíz y visibilidad de eventos por admin de sitio.
 * Depende de Postgres 16 (`DATABASE_URL`), migraciones 0013–0014.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import type { EmailAdapter, EmailSendResult, OutboundEmail } from '../src/email/types.js';
import { hashPassword, hmacEmailHash, resolveEmailHmacKey } from '../src/domain/accounts.js';
import { announceSkipWithoutDatabase, DATABASE_URL, testConfig } from './harness.js';
import { FakePayPal } from './fake-paypal.js';

announceSkipWithoutDatabase('portal-listing.test');
if (!DATABASE_URL) {
  throw new Error('portal-listing.test requiere DATABASE_URL (Postgres 16 como CI)');
}

const ROOT_ORIGIN = 'https://somospanas.com';
const ROOT_HOST = 'somospanas.com';
const LEGACY_HOST = 'fiestapay.somospanas.com';
const LEGACY_ORIGIN = 'https://fiestapay.somospanas.com';
const PASSWORD = 'contraseña-segura-8';
const HMAC_KEY = resolveEmailHmacKey({ NODE_ENV: 'test' });

class FakeEmail implements EmailAdapter {
  async send(_message: OutboundEmail): Promise<EmailSendResult> {
    return { status: 'accepted' };
  }
}

interface InjectOut {
  statusCode: number;
  body: string;
  cookies?: { name: string; value: string }[];
  json: <T = unknown>() => T;
}

async function injectJson(
  app: FastifyInstance,
  method: 'GET' | 'PATCH',
  url: string,
  opts: { host: string; origin: string; cookie?: string; payload?: object },
): Promise<InjectOut> {
  const headers: Record<string, string> = { host: opts.host, origin: opts.origin };
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await app.inject({ method, url, headers, ...(opts.payload ? { payload: opts.payload } : {}) });
  return {
    statusCode: res.statusCode,
    body: res.body,
    json: <T = unknown>() => JSON.parse(res.body) as T,
  };
}

function sessionCookie(res: InjectOut & { cookies?: { name: string; value: string }[] }): string | undefined {
  const set = res.cookies?.find((c) => c.name === 'fp_session');
  return set?.value ? `fp_session=${set.value}` : undefined;
}

async function seedTenant(pool: Pool, slug: string, displayName: string): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO tenants (id, slug, kind, discoverable, payment_provider)
     VALUES ($1, $2, 'group', false, 'none')`,
    [id, slug],
  );
  await pool.query(
    `INSERT INTO tenant_settings (
       tenant_id, display_name, tagline, about,
       color_cloudwhite, color_ink, color_ink_muted, color_blue, color_teal, color_yellow, color_coral,
       modulo_reuniones, modulo_eventos, modulo_recaudacion, modulo_asistente
     ) VALUES ($1,$2,'','',
       '#F7FAFC','#12263A','#4A5D73','#125FE6','#0B8075','#FFC85A','#E85D4A',
       true,true,true,true)`,
    [id, displayName],
  );
  return id;
}

async function seedUserVerified(pool: Pool, email: string, password: string): Promise<string> {
  const id = randomUUID();
  const normalized = email.trim().toLowerCase();
  await pool.query(
    `INSERT INTO users (id, email, email_hash, password_hash, email_verified_at)
     VALUES ($1,$2,$3,$4, now())`,
    [id, normalized, hmacEmailHash(normalized, HMAC_KEY), hashPassword(password)],
  );
  return id;
}

async function seedEvent(
  pool: Pool,
  tenantId: string,
  slug: string,
  visibility: 'private' | 'public',
  opts: { accessCode?: boolean; title?: string; location?: string } = {},
): Promise<void> {
  const sessionId = randomUUID();
  await pool.query(`INSERT INTO sessions (id, token_hash) VALUES ($1, $2)`, [sessionId, randomBytes(32)]);
  await pool.query(
    `INSERT INTO events (
       id, slug, tenant_id, organizer_session_id, generation, title, template, meal, description,
       starts_at, ends_at, location, includes, agenda, price_cents, capacity, goal_cents, minimum_cents,
       visibility, admin_key_hash, access_code_hash
     ) VALUES (
       $1,$2,$3,$4,0,$5,'casa','cena','', now() + interval '2 days', now() + interval '3 days',
       $6,'[]','[]',2500,8,10000,5000,$7, $8, $9
     )`,
    [
      randomUUID(),
      slug,
      tenantId,
      sessionId,
      opts.title ?? 'Fiesta del grupo',
      opts.location ?? 'Quito',
      visibility,
      randomBytes(32),
      opts.accessCode ? randomBytes(32) : null,
    ],
  );
}

describe('portal listing (SP-6)', () => {
  const schema = `fp_test_${randomBytes(5).toString('hex')}`;
  let pool: Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    pool = createPool({ connectionString: DATABASE_URL!, schema });
    await migrate(pool, { schema });
    app = await buildApp({
      pool,
      config: testConfig({ PUBLIC_ORIGIN: ROOT_ORIGIN }),
      paypal: new FakePayPal(),
      email: new FakeEmail(),
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('GET /api/portal/events en host legado responde 404', async () => {
    const res = await injectJson(app, 'GET', '/api/portal/events', {
      host: LEGACY_HOST,
      origin: LEGACY_ORIGIN,
    });
    expect(res.statusCode).toBe(404);
  });

  it('el listado en raíz no incluye eventos private y sí los public con datos permitidos', async () => {
    const slugA = `grpa${randomBytes(3).toString('hex')}`;
    const slugB = `grpb${randomBytes(3).toString('hex')}`;
    const tenantA = await seedTenant(pool, slugA, 'Panas del Norte');
    const tenantB = await seedTenant(pool, slugB, 'Panas del Sur');
    const privSlug = `priv-${randomBytes(4).toString('hex')}`;
    const pubSlug = `pub-${randomBytes(4).toString('hex')}`;
    await seedEvent(pool, tenantA, privSlug, 'private', { title: 'Cena cerrada', location: 'S1' });
    await seedEvent(pool, tenantB, pubSlug, 'public', { title: 'Asado abierto', location: 'Parque' });

    const res = await injectJson(app, 'GET', '/api/portal/events', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ events: Array<Record<string, unknown>> }>();
    const slugs = body.events.map((e) => e.slug);
    expect(slugs).not.toContain(privSlug);
    expect(slugs).toContain(pubSlug);
    const row = body.events.find((e) => e.slug === pubSlug)!;
    expect(row).toMatchObject({
      title: 'Asado abierto',
      location: 'Parque',
      siteSlug: slugB,
      siteName: 'Panas del Sur',
    });
    expect(row).not.toHaveProperty('id');
    expect(row).not.toHaveProperty('guests');
    expect(row).not.toHaveProperty('email');
    expect(typeof row.url).toBe('string');
  });

  it('marcar público exige admin del sitio; miembro, anónimo y admin de otro sitio reciben 403', async () => {
    const slugA = `adm${randomBytes(3).toString('hex')}`;
    const slugB = `otro${randomBytes(3).toString('hex')}`;
    const tenantA = await seedTenant(pool, slugA, 'Sitio A');
    const tenantB = await seedTenant(pool, slugB, 'Sitio B');
    const eventSlug = `ev-${randomBytes(4).toString('hex')}`;
    await seedEvent(pool, tenantA, eventSlug, 'private', { title: 'Evento A' });

    const adminA = await seedUserVerified(pool, `admin-a-${slugA}@example.test`, PASSWORD);
    await pool.query(`INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1,$2,'admin')`, [tenantA, adminA]);
    const memberA = await seedUserVerified(pool, `member-a-${slugA}@example.test`, PASSWORD);
    await pool.query(`INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1,$2,'member')`, [tenantA, memberA]);
    const adminB = await seedUserVerified(pool, `admin-b-${slugB}@example.test`, PASSWORD);
    await pool.query(`INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1,$2,'admin')`, [tenantB, adminB]);

    const loginAdminA = await app.inject({
      method: 'POST',
      url: '/api/accounts/login',
      headers: { host: ROOT_HOST, origin: ROOT_ORIGIN },
      payload: { email: `admin-a-${slugA}@example.test`, password: PASSWORD },
    });
    const cookieAdminA = sessionCookie({
      statusCode: loginAdminA.statusCode,
      body: loginAdminA.body,
      json: () => JSON.parse(loginAdminA.body),
      cookies: loginAdminA.cookies as InjectOut['cookies'],
    })!;

    const loginMember = await app.inject({
      method: 'POST',
      url: '/api/accounts/login',
      headers: { host: ROOT_HOST, origin: ROOT_ORIGIN },
      payload: { email: `member-a-${slugA}@example.test`, password: PASSWORD },
    });
    const cookieMember = sessionCookie({
      statusCode: loginMember.statusCode,
      body: loginMember.body,
      json: () => JSON.parse(loginMember.body),
      cookies: loginMember.cookies as InjectOut['cookies'],
    })!;

    const loginAdminB = await app.inject({
      method: 'POST',
      url: '/api/accounts/login',
      headers: { host: ROOT_HOST, origin: ROOT_ORIGIN },
      payload: { email: `admin-b-${slugB}@example.test`, password: PASSWORD },
    });
    const cookieAdminB = sessionCookie({
      statusCode: loginAdminB.statusCode,
      body: loginAdminB.body,
      json: () => JSON.parse(loginAdminB.body),
      cookies: loginAdminB.cookies as { name: string; value: string }[],
    })!;

    const hostA = `${slugA}.somospanas.com`;
    const originA = `https://${hostA}`;
    const ok = await injectJson(app, 'PATCH', `/api/site/events/${eventSlug}/visibility`, {
      host: hostA,
      origin: originA,
      cookie: cookieAdminA,
      payload: { visibility: 'public' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json<{ visibility: string }>().visibility).toBe('public');

    const memberRes = await injectJson(app, 'PATCH', `/api/site/events/${eventSlug}/visibility`, {
      host: hostA,
      origin: originA,
      cookie: cookieMember,
      payload: { visibility: 'private' },
    });
    expect(memberRes.statusCode).toBe(403);

    const otherRes = await injectJson(app, 'PATCH', `/api/site/events/${eventSlug}/visibility`, {
      host: hostA,
      origin: originA,
      cookie: cookieAdminB,
      payload: { visibility: 'private' },
    });
    expect(otherRes.statusCode).toBe(403);

    const anonRes = await injectJson(app, 'PATCH', `/api/site/events/${eventSlug}/visibility`, {
      host: hostA,
      origin: originA,
      payload: { visibility: 'private' },
    });
    expect(anonRes.statusCode).toBe(403);
  });

  it('un evento con código de acceso no puede pasar a public (400)', async () => {
    const slug = `cod${randomBytes(3).toString('hex')}`;
    const tenantId = await seedTenant(pool, slug, 'Con código');
    const eventSlug = `cod-${randomBytes(4).toString('hex')}`;
    await seedEvent(pool, tenantId, eventSlug, 'private', { accessCode: true });

    const adminId = await seedUserVerified(pool, `admin-${slug}@example.test`, PASSWORD);
    await pool.query(`INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1,$2,'admin')`, [tenantId, adminId]);

    const login = await app.inject({
      method: 'POST',
      url: '/api/accounts/login',
      headers: { host: ROOT_HOST, origin: ROOT_ORIGIN },
      payload: { email: `admin-${slug}@example.test`, password: PASSWORD },
    });
    const cookie = sessionCookie({
      statusCode: login.statusCode,
      body: login.body,
      json: () => JSON.parse(login.body),
      cookies: login.cookies as InjectOut['cookies'],
    })!;

    const res = await injectJson(app, 'PATCH', `/api/site/events/${eventSlug}/visibility`, {
      host: `${slug}.somospanas.com`,
      origin: `https://${slug}.somospanas.com`,
      cookie,
      payload: { visibility: 'public' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.toLowerCase()).toMatch(/código de acceso|access code|codigo de acceso/i);
  });
});