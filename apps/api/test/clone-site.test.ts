/**
 * Somos Panas SP-7 — plantilla `muestra`, clonación de espacio y handoff raíz→subdominio.
 * Depende de Postgres 16 (`DATABASE_URL`), migraciones 0013–0015 y adaptador de correo falso.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import type { EmailAdapter, EmailSendResult, OutboundEmail } from '../src/email/types.js';
import { ensureMuestraTemplate, MUESTRA_SLUG, SITE_CREATE_USER_LIMIT } from '../src/domain/sites.js';
import { fundingForNewEvent } from '../src/domain/funding.js';
import { legacyTenantId } from '../src/lib/host.js';
import { sha256 } from '../src/lib/ids.js';
import { announceSkipWithoutDatabase, DATABASE_URL, MERCHANT, ORIGIN, testConfig } from './harness.js';
import { FakePayPal } from './fake-paypal.js';

announceSkipWithoutDatabase('clone-site.test');
if (!DATABASE_URL) {
  throw new Error('clone-site.test requiere DATABASE_URL (Postgres 16 como CI)');
}

const ROOT_ORIGIN = 'https://somospanas.com';
const ROOT_HOST = 'somospanas.com';
const PASSWORD = 'contraseña-segura-8';
class FakeEmail implements EmailAdapter {
  readonly sent: OutboundEmail[] = [];
  next: EmailSendResult = { status: 'accepted' };

  async send(message: OutboundEmail): Promise<EmailSendResult> {
    this.sent.push({ ...message });
    return this.next;
  }
}

function tokenFromMail(message: OutboundEmail): string {
  const match = message.text.match(/\/verify#t=([A-Za-z0-9_-]{43,128})/);
  if (!match?.[1]) throw new Error('token de verificacion ausente');
  return match[1];
}

interface InjectOut {
  statusCode: number;
  body: string;
  cookies: { name: string; value: string; httpOnly?: boolean; domain?: string }[];
  json: <T = unknown>() => T;
}

async function injectJson(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  opts: { host: string; origin: string; cookie?: string; payload?: Record<string, unknown> },
): Promise<InjectOut> {
  const headers: Record<string, string> = {
    host: opts.host,
    origin: opts.origin,
  };
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await app.inject({ method, url, headers, payload: opts.payload });
  const cookies = (res.cookies ?? []) as InjectOut['cookies'];
  return {
    statusCode: res.statusCode,
    body: res.body,
    cookies,
    json: <T = unknown>() => JSON.parse(res.body) as T,
  };
}

function sessionCookie(res: InjectOut): string | undefined {
  const set = res.cookies.find((c) => c.name === 'fp_session');
  if (!set?.value) return undefined;
  return `fp_session=${set.value}`;
}

async function verifiedRootSession(
  app: FastifyInstance,
  fake: FakeEmail,
  email: string,
): Promise<string> {
  await injectJson(app, 'POST', '/api/accounts/register', {
    host: ROOT_HOST,
    origin: ROOT_ORIGIN,
    payload: { email, password: PASSWORD },
  });
  const token = tokenFromMail(fake.sent.at(-1)!);
  await injectJson(app, 'POST', '/api/accounts/verify', {
    host: ROOT_HOST,
    origin: ROOT_ORIGIN,
    payload: { token },
  });
  const login = await injectJson(app, 'POST', '/api/accounts/login', {
    host: ROOT_HOST,
    origin: ROOT_ORIGIN,
    payload: { email, password: PASSWORD },
  });
  const cookie = sessionCookie(login);
  if (!cookie) throw new Error('sin cookie de sesion');
  return cookie;
}

function mailEnv() {
  return {
    SMTP_HOST: 'salida.example.test',
    SMTP_PORT: '465',
    SMTP_USER: 'clone@example.test',
    SMTP_PASS: 'smtp-test-pass',
    EMAIL_FROM: 'clone@example.test',
    EMAIL_DAILY_CAP: '100',
    PUBLIC_ORIGIN: ROOT_ORIGIN,
  };
}

describe('plantilla y clonación (SP-7)', () => {
  const schema = `fp_clone_${randomBytes(5).toString('hex')}`;
  let pool: Pool;
  let adminPool: Pool;
  let app: FastifyInstance;
  let fake: FakeEmail;

  beforeAll(async () => {
    pool = createPool({ connectionString: DATABASE_URL!, schema });
    adminPool = createPool({ connectionString: DATABASE_URL!, max: 2 });
    await migrate(pool, { schema });
    fake = new FakeEmail();
    app = await buildApp({
      pool,
      config: testConfig(mailEnv()),
      email: fake,
      paypal: new FakePayPal(MERCHANT),
      logger: false,
    });
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

  it('la semilla de muestra es idempotente e incluye tenant_settings', async () => {
    const first = await ensureMuestraTemplate(pool);
    const second = await ensureMuestraTemplate(pool);
    expect(second).toBe(first);
    const profile = await injectJson(app, 'GET', '/api/site/profile', {
      host: `${MUESTRA_SLUG}.somospanas.com`,
      origin: `https://${MUESTRA_SLUG}.somospanas.com`,
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json<{ settings: { displayName: string } }>().settings.displayName).toBe('Sitio de muestra');
  });

  it('cumple el contrato HTTP de creacion y rechaza slugs reservados o mal formados', async () => {
    const email = `crear-${randomBytes(4).toString('hex')}@example.test`;
    const cookie = await verifiedRootSession(app, fake, email);
    const slug = `tu-grupo-${randomBytes(3).toString('hex')}`;

    const res = await injectJson(app, 'POST', '/api/sites', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      cookie,
      payload: { slug, displayName: 'Tu grupo' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ site: { slug: string; url: string }; handoff: { code: string; expiresAt: string } }>();
    expect(body.site.slug).toBe(slug.toLowerCase());
    expect(body.site.url).toBe(`https://${slug.toLowerCase()}.somospanas.com`);
    expect(body.handoff.code.length).toBeGreaterThan(40);
    expect(Date.parse(body.handoff.expiresAt)).toBeGreaterThan(Date.now());

    const reserved = await injectJson(app, 'POST', '/api/sites', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      cookie,
      payload: { slug: 'muestra', displayName: 'No' },
    });
    expect(reserved.statusCode).toBe(400);

    const bad = await injectJson(app, 'POST', '/api/sites', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      cookie,
      payload: { slug: '!!', displayName: 'Mal' },
    });
    expect(bad.statusCode).toBe(400);

    const again = await injectJson(app, 'POST', '/api/sites', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      cookie,
      payload: { slug, displayName: 'Otro nombre' },
    });
    expect(again.statusCode).toBe(409);
  });

  it('el canje deja sesion en el subdominio y la raiz no autoriza alli', async () => {
    await ensureMuestraTemplate(pool);
    await pool.query(
      `UPDATE tenant_settings SET tagline = 'Etiqueta plantilla' WHERE tenant_id = (SELECT id FROM tenants WHERE slug = $1)`,
      [MUESTRA_SLUG],
    );

    const email = `handoff-${randomBytes(4).toString('hex')}@example.test`;
    const rootCookie = await verifiedRootSession(app, fake, email);
    const slug = `grupo-${randomBytes(3).toString('hex')}`;
    const created = await injectJson(app, 'POST', '/api/sites', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      cookie: rootCookie,
      payload: { slug, displayName: 'Panas del barrio' },
    });
    const { handoff, site } = created.json<{ handoff: { code: string }; site: { slug: string } }>();
    const host = `${site.slug}.somospanas.com`;
    const origin = `https://${host}`;

    // R-1 (SP-4): la cookie HttpOnly no lleva Domain; el navegador no la reenvía al subdominio.
    // La sesión no está atada al host: un cliente que copie manualmente la cookie del creador sí
    // podría entrar (tiene membresía admin), pero eso no es el flujo normal del handoff.
    const creatorForced = await injectJson(app, 'GET', '/api/site/settings', {
      host,
      origin,
      cookie: rootCookie,
    });
    expect(creatorForced.statusCode).toBe(200);

    const stranger = `otro-${randomBytes(4).toString('hex')}@example.test`;
    const strangerCookie = await verifiedRootSession(app, fake, stranger);
    const blocked = await injectJson(app, 'GET', '/api/site/settings', {
      host,
      origin,
      cookie: strangerCookie,
    });
    expect(blocked.statusCode).toBe(403);

    const redeemed = await injectJson(app, 'POST', '/api/sites/handoff', {
      host,
      origin,
      payload: { code: handoff.code },
    });
    expect(redeemed.statusCode).toBe(200);
    const siteCookie = sessionCookie(redeemed)!;
    const set = redeemed.cookies.find((c) => c.name === 'fp_session');
    expect(set?.httpOnly).toBe(true);
    expect(set?.domain).toBeUndefined();
    expect(siteCookie).not.toBe(rootCookie);

    const settings = await injectJson(app, 'GET', '/api/site/settings', {
      host,
      origin,
      cookie: siteCookie,
    });
    expect(settings.statusCode).toBe(200);
    const saved = settings.json<{ settings: { displayName: string; tagline: string } }>().settings;
    expect(saved.displayName).toBe('Panas del barrio');
    expect(saved.tagline).toBe('Etiqueta plantilla');

    const tenant = await pool.query<{ payment_provider: string }>(
      `SELECT payment_provider FROM tenants WHERE slug = $1`,
      [site.slug],
    );
    expect(tenant.rows[0]!.payment_provider).toBe('none');

    const counts = await pool.query<{ events: string; orders: string; members: string }>(
      `SELECT
         (SELECT COUNT(*)::text FROM events e JOIN tenants t ON t.id = e.tenant_id WHERE t.slug = $1) AS events,
         (SELECT COUNT(*)::text FROM orders o JOIN events e ON e.id = o.event_id JOIN tenants t ON t.id = e.tenant_id WHERE t.slug = $1) AS orders,
         (SELECT COUNT(*)::text FROM memberships m JOIN tenants t ON t.id = m.tenant_id WHERE t.slug = $1) AS members`,
      [site.slug],
    );
    expect(counts.rows[0]!.events).toBe('0');
    expect(counts.rows[0]!.orders).toBe('0');
    expect(counts.rows[0]!.members).toBe('1');
  });

  it('codigo vencido o repetido responde 400; el doble canje en paralelo solo crea una sesion util', async () => {
    const email = `codigo-${randomBytes(4).toString('hex')}@example.test`;
    const cookie = await verifiedRootSession(app, fake, email);
    const slug = `dup-${randomBytes(3).toString('hex')}`;
    const created = await injectJson(app, 'POST', '/api/sites', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      cookie,
      payload: { slug, displayName: 'Dup' },
    });
    const { handoff, site } = created.json<{ handoff: { code: string }; site: { slug: string } }>();
    const host = `${site.slug}.somospanas.com`;
    const origin = `https://${host}`;

    await pool.query(
      `UPDATE handoff_codes SET expires_at = now() - interval '1 minute'
       WHERE tenant_id = (SELECT id FROM tenants WHERE slug = $1)`,
      [site.slug],
    );
    const expired = await injectJson(app, 'POST', '/api/sites/handoff', {
      host,
      origin,
      payload: { code: handoff.code },
    });
    expect(expired.statusCode).toBe(400);

    await pool.query(
      `UPDATE handoff_codes SET expires_at = now() + interval '10 minutes', consumed_at = NULL
       WHERE tenant_id = (SELECT id FROM tenants WHERE slug = $1)`,
      [site.slug],
    );
    const [first, second] = await Promise.all([
      injectJson(app, 'POST', '/api/sites/handoff', { host, origin, payload: { code: handoff.code } }),
      injectJson(app, 'POST', '/api/sites/handoff', { host, origin, payload: { code: handoff.code } }),
    ]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 400]);

    const reused = await injectJson(app, 'POST', '/api/sites/handoff', {
      host,
      origin,
      payload: { code: handoff.code },
    });
    expect(reused.statusCode).toBe(400);
  });

  it('evento private de sitio no legado devuelve 404 en raiz salvo admin; legado sigue por slug', async () => {
    await ensureMuestraTemplate(pool);
    const legacy = await legacyTenantId(pool);

    const emailAdmin = `portal-${randomBytes(4).toString('hex')}@example.test`;
    const adminCookie = await verifiedRootSession(app, fake, emailAdmin);
    const groupSlug = `port-${randomBytes(3).toString('hex')}`;
    const created = await injectJson(app, 'POST', '/api/sites', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      cookie: adminCookie,
      payload: { slug: groupSlug, displayName: 'Portal test' },
    });
    const { handoff, site } = created.json<{ handoff: { code: string }; site: { slug: string } }>();
    const host = `${site.slug}.somospanas.com`;
    await injectJson(app, 'POST', '/api/sites/handoff', {
      host,
      origin: `https://${host}`,
      payload: { code: handoff.code },
    });

    const tenantB = randomUUID();
    await pool.query(
      `INSERT INTO tenants (id, slug, kind, discoverable, payment_provider) VALUES ($1,$2,'group',false,'none')`,
      [tenantB, `beta-${randomBytes(3).toString('hex')}`],
    );
    await pool.query(
      `INSERT INTO tenant_settings (
         tenant_id, display_name, tagline, about,
         color_cloudwhite, color_ink, color_ink_muted, color_blue, color_teal, color_yellow, color_coral
       ) VALUES ($1,'B','','','#F7FAFC','#12263A','#4A5D73','#125FE6','#0B8075','#FFC85A','#E85D4A')`,
      [tenantB],
    );

    const privateSlug = `priv-${randomBytes(4).toString('hex')}`;
    const legacySlug = `leg-${randomBytes(4).toString('hex')}`;
    const sessionId = randomUUID();
    await pool.query(`INSERT INTO sessions (id, token_hash) VALUES ($1,$2)`, [sessionId, randomBytes(32)]);
    const adminKey = 'clave-legado-sp7';
    for (const [slug, tenantId] of [
      [privateSlug, (await pool.query<{ id: string }>(`SELECT id FROM tenants WHERE slug = $1`, [site.slug])).rows[0]!.id],
      [legacySlug, legacy],
    ] as const) {
      await pool.query(
        `INSERT INTO events (
           id, slug, tenant_id, organizer_session_id, generation, title, template, meal, description,
           starts_at, ends_at, location, includes, agenda, price_cents, capacity, goal_cents, minimum_cents,
           visibility, admin_key_hash
         ) VALUES (
           $1,$2,$3,$4,0,'T','casa','cena','', now() + interval '1 day', now() + interval '2 days',
           'Sala','[]','[]',2500,8,10000,5000,'private',$5
         )`,
        [randomUUID(), slug, tenantId, sessionId, sha256(adminKey)],
      );
    }

    const anonRoot = await injectJson(app, 'GET', `/api/events/${privateSlug}`, {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
    });
    expect(anonRoot.statusCode).toBe(404);

    const adminRoot = await injectJson(app, 'GET', `/api/events/${privateSlug}`, {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      cookie: adminCookie,
    });
    expect(adminRoot.statusCode).toBe(200);

    const legacyOpen = await injectJson(app, 'GET', `/api/events/${legacySlug}`, {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
    });
    expect(legacyOpen.statusCode).toBe(200);
  });

  it('un evento nuevo en sitio none no abre financiamiento (herencia SP-8)', async () => {
    const email = `fund-${randomBytes(4).toString('hex')}@example.test`;
    const cookie = await verifiedRootSession(app, fake, email);
    const slug = `none-${randomBytes(3).toString('hex')}`;
    const created = await injectJson(app, 'POST', '/api/sites', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      cookie,
      payload: { slug, displayName: 'Sin cobro' },
    });
    const site = created.json<{ site: { slug: string } }>().site;
    const tenantId = (await pool.query<{ id: string }>(`SELECT id FROM tenants WHERE slug = $1`, [site.slug])).rows[0]!
      .id;
    const funding = fundingForNewEvent(
      {
        title: 'x',
        template: 'casa',
        meal: 'cena',
        description: 'd',
        startsAt: '2026-12-15T18:00:00.000Z',
        endsAt: '2026-12-15T22:00:00.000Z',
        location: 'l',
        includes: [],
        agenda: [],
        priceCents: 2500,
        capacity: 8,
        goalCents: null,
        minimumCents: 5000,
        fundingDeadlineAt: '2026-12-15T17:00:00.000Z',
      },
      new Date('2026-12-01T12:00:00.000Z'),
      'none',
    );
    expect(funding.status).toBe('inactive');
    const sessionId = randomUUID();
    await pool.query(`INSERT INTO sessions (id, token_hash) VALUES ($1,$2)`, [sessionId, randomBytes(32)]);
    const eventSlug = `evt-${randomBytes(4).toString('hex')}`;
    await pool.query(
      `INSERT INTO events (
         id, slug, tenant_id, organizer_session_id, generation, title, template, meal, description,
         starts_at, ends_at, location, includes, agenda, price_cents, capacity, goal_cents, minimum_cents,
         funding_status, funding_deadline_at, admin_key_hash
       ) VALUES (
         $1,$2,$3,$4,0,'N','casa','cena','', now() + interval '1 day', now() + interval '2 days',
         'C','[]','[]',2500,8,10000,5000,$5,$6,$7
       )`,
      [
        randomUUID(),
        eventSlug,
        tenantId,
        sessionId,
        funding.status,
        funding.deadline?.toISOString() ?? null,
        sha256('admin'),
      ],
    );
    const row = await pool.query<{ funding_status: string }>(`SELECT funding_status FROM events WHERE slug = $1`, [
      eventSlug,
    ]);
    expect(row.rows[0]!.funding_status).toBe('inactive');
  });

  it('SP7-D-1: anónimo recibe 404 en todas las rutas por slug y no inserta invitados ni chat', async () => {
    const groupTenant = randomUUID();
    const groupSlug = `grp-${randomBytes(4).toString('hex')}`;
    await pool.query(
      `INSERT INTO tenants (id, slug, kind, discoverable, payment_provider) VALUES ($1,$2,'group',false,'none')`,
      [groupTenant, groupSlug],
    );
    await pool.query(
      `INSERT INTO tenant_settings (
         tenant_id, display_name, tagline, about,
         color_cloudwhite, color_ink, color_ink_muted, color_blue, color_teal, color_yellow, color_coral
       ) VALUES ($1,'G','','','#F7FAFC','#12263A','#4A5D73','#125FE6','#0B8075','#FFC85A','#E85D4A')`,
      [groupTenant],
    );
    const eventSlug = `priv-rutas-${randomBytes(4).toString('hex')}`;
    const sessionId = randomUUID();
    const adminKey = sha256('clave-organizer-sp7d1');
    await pool.query(`INSERT INTO sessions (id, token_hash) VALUES ($1, $2)`, [sessionId, randomBytes(32)]);
    await pool.query(
      `INSERT INTO events (
         id, slug, tenant_id, organizer_session_id, generation, title, template, meal, description,
         starts_at, ends_at, location, includes, agenda, price_cents, capacity, goal_cents, minimum_cents,
         visibility, funding_status, admin_key_hash
       ) VALUES (
         $1,$2,$3,$4,0,'Privado SP7-D-1','casa','cena','', now() + interval '2 days', now() + interval '3 days',
         'Sala','[]','[]',2500,8,10000,5000,'private','inactive',$5
       )`,
      [randomUUID(), eventSlug, groupTenant, sessionId, adminKey],
    );

    const guestsBefore = await pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM guests');
    const chatBefore = await pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM chat_messages');

    const base = { host: ROOT_HOST, origin: ROOT_ORIGIN };
    const join = await injectJson(app, 'POST', `/api/events/${eventSlug}/join`, {
      ...base,
      payload: { name: 'Anon' },
    });
    expect(join.statusCode).toBe(404);

    const rsvp = await injectJson(app, 'POST', `/api/events/${eventSlug}/rsvp`, {
      ...base,
      cookie: sessionCookie(join) ?? `fp_session=${randomBytes(16).toString('hex')}`,
      payload: { status: 'yes', companions: 0 },
    });
    expect(rsvp.statusCode).toBe(404);

    const quote = await injectJson(app, 'POST', `/api/events/${eventSlug}/quote`, {
      ...base,
      cookie: sessionCookie(join),
    });
    expect(quote.statusCode).toBe(404);

    const dashboard = await injectJson(app, 'GET', `/api/events/${eventSlug}/dashboard`, base);
    expect(dashboard.statusCode).toBe(404);

    const chat = await injectJson(app, 'POST', `/api/events/${eventSlug}/chat`, {
      ...base,
      payload: { message: 'hola' },
    });
    expect(chat.statusCode).toBe(404);

    const recovery = await injectJson(app, 'GET', `/api/events/${eventSlug}/recovery`, base);
    expect(recovery.statusCode).toBe(404);

    const moderation = await injectJson(app, 'GET', `/api/events/${eventSlug}/moderation/guests`, base);
    expect(moderation.statusCode).toBe(404);

    const guestsAfter = await pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM guests');
    const chatAfter = await pool.query<{ c: string }>('SELECT COUNT(*)::text AS c FROM chat_messages');
    expect(guestsAfter.rows[0]!.c).toBe(guestsBefore.rows[0]!.c);
    expect(chatAfter.rows[0]!.c).toBe(chatBefore.rows[0]!.c);
  });

  it('SP7-D-1: GET /api/events en raiz no lista el private de grupo del organizador', async () => {
    const startsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 4 * 60 * 60 * 1000);
    const created = await injectJson(app, 'POST', '/api/events', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      payload: {
        title: 'Legado visible',
        template: 'casa',
        meal: 'cena',
        description: 'd',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        location: 'Casa',
        includes: [],
        agenda: [],
        priceCents: 2500,
        capacity: 8,
        goalCents: null,
        minimumCents: null,
      },
    });
    expect(created.statusCode).toBe(200);
    const cookie = sessionCookie(created);
    const legacySlug = created.json<{ event: { slug: string } }>().event.slug;
    const sessionId = (
      await pool.query<{ organizer_session_id: string }>(`SELECT organizer_session_id FROM events WHERE slug = $1`, [
        legacySlug,
      ])
    ).rows[0]!.organizer_session_id;
    const groupTenant = randomUUID();
    const groupSlug = `lst-${randomBytes(4).toString('hex')}`;
    await pool.query(
      `INSERT INTO tenants (id, slug, kind, discoverable, payment_provider) VALUES ($1,$2,'group',false,'none')`,
      [groupTenant, groupSlug],
    );
    const hiddenSlug = `priv-list-${randomBytes(4).toString('hex')}`;
    await pool.query(
      `INSERT INTO events (
         id, slug, tenant_id, organizer_session_id, generation, title, template, meal, description,
         starts_at, ends_at, location, includes, agenda, price_cents, capacity, goal_cents, minimum_cents,
         visibility, funding_status, admin_key_hash
       ) VALUES (
         $1,$2,$3,$4,0,'Oculto','casa','cena','', now() + interval '2 days', now() + interval '3 days',
         'Sala','[]','[]',2500,8,10000,5000,'private','inactive',$5
       )`,
      [randomUUID(), hiddenSlug, groupTenant, sessionId, sha256('list-org')],
    );
    const list = await injectJson(app, 'GET', '/api/events', { host: ROOT_HOST, origin: ROOT_ORIGIN, cookie });
    expect(list.statusCode).toBe(200);
    const slugs = list.json<{ events: { slug: string }[] }>().events.map((e) => e.slug);
    expect(slugs).toContain(legacySlug);
    expect(slugs).not.toContain(hiddenSlug);
  });

  it('SP7-D-1: legado private sigue admitiendo join en raiz y en host fiestapay', async () => {
    const legacy = await legacyTenantId(pool);
    const eventSlug = `leg-join-${randomBytes(4).toString('hex')}`;
    const sessionId = randomUUID();
    await pool.query(`INSERT INTO sessions (id, token_hash) VALUES ($1, $2)`, [sessionId, randomBytes(32)]);
    await pool.query(
      `INSERT INTO events (
         id, slug, tenant_id, organizer_session_id, generation, title, template, meal, description,
         starts_at, ends_at, location, includes, agenda, price_cents, capacity, goal_cents, minimum_cents,
         visibility, funding_status, admin_key_hash
       ) VALUES (
         $1,$2,$3,$4,0,'Legado join','casa','cena','', now() + interval '2 days', now() + interval '3 days',
         'Casa','[]','[]',2500,8,10000,5000,'private','inactive',$5
       )`,
      [randomUUID(), eventSlug, legacy, sessionId, sha256('clave-legado-join')],
    );

    for (const host of [ROOT_HOST, 'fiestapay.somospanas.com'] as const) {
      // Legado: mutaciones usan `allowedOrigins` de config (harness → ORIGIN), no el origen HTTPS de producción.
      const origin = host === ROOT_HOST ? ROOT_ORIGIN : ORIGIN;
      const res = await injectJson(app, 'POST', `/api/events/${eventSlug}/join`, {
        host,
        origin,
        payload: { name: 'Invitado legado' },
      });
      expect(res.statusCode, host).toBe(200);
    }
  });

  it(`tras ${SITE_CREATE_USER_LIMIT + 1} creaciones en ventana el usuario recibe 429`, async () => {
    const email = `lim-${randomBytes(4).toString('hex')}@example.test`;
    const cookie = await verifiedRootSession(app, fake, email);
    for (let i = 0; i < SITE_CREATE_USER_LIMIT; i += 1) {
      const ok = await injectJson(app, 'POST', '/api/sites', {
        host: ROOT_HOST,
        origin: ROOT_ORIGIN,
        cookie,
        payload: { slug: `lim-${i}-${randomBytes(2).toString('hex')}`, displayName: 'L' },
      });
      expect(ok.statusCode).toBe(201);
    }
    const blocked = await injectJson(app, 'POST', '/api/sites', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      cookie,
      payload: { slug: `lim-x-${randomBytes(2).toString('hex')}`, displayName: 'L' },
    });
    expect(blocked.statusCode).toBe(429);
  });
});