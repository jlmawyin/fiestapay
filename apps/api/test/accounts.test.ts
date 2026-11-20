/**
 * Somos Panas SP-4 — cuentas, verificación, sesión y aislamiento entre sitios.
 * Depende de Postgres 16 (`DATABASE_URL`), migraciones 0013–0014 y adaptador de correo falso.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { migrate } from '../src/db/migrate.js';
import { createPool, type Pool } from '../src/db/pool.js';
import type { EmailAdapter, EmailSendResult, OutboundEmail } from '../src/email/types.js';
import { hashPassword, hmacEmailHash, resolveEmailHmacKey } from '../src/domain/accounts.js';
import { legacyTenantId } from '../src/lib/host.js';
import { announceSkipWithoutDatabase, DATABASE_URL, MERCHANT, testConfig } from './harness.js';
import { FakePayPal } from './fake-paypal.js';

announceSkipWithoutDatabase('accounts.test');
const describeDb = DATABASE_URL ? describe : describe.skip;

const ROOT_ORIGIN = 'https://somospanas.com';
const ROOT_HOST = 'somospanas.com';
const MAILBOX = 'panas-registro@example.test';
const PASSWORD = 'contraseña-segura-8';
const HMAC_KEY = resolveEmailHmacKey({ NODE_ENV: 'test' });

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
  if (!match?.[1]) throw new Error('el adaptador de prueba no recibio token de cuenta');
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

function mailEnv() {
  return {
    SMTP_HOST: 'salida.example.test',
    SMTP_PORT: '465',
    SMTP_USER: MAILBOX,
    SMTP_PASS: 'smtp-test-pass',
    EMAIL_FROM: MAILBOX,
    EMAIL_DAILY_CAP: '100',
    PUBLIC_ORIGIN: ROOT_ORIGIN,
  };
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

describeDb('cuentas Somos Panas (SP-4)', () => {
  const schema = `fp_test_${randomBytes(5).toString('hex')}`;
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

  it('registra con scrypt, HMAC de correo y envia verificacion sin devolver la contraseña', async () => {
    const email = `nueva-${randomBytes(4).toString('hex')}@example.test`;
    const res = await injectJson(app, 'POST', '/api/accounts/register', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      payload: { email, password: PASSWORD },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(PASSWORD);
    expect(fake.sent.length).toBe(1);
    expect(fake.sent[0]!.to).toBe(email.toLowerCase());

    const { rows } = await pool.query<{ email_hash: Buffer; password_hash: string }>(
      'SELECT email_hash, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()],
    );
    expect(rows[0]!.email_hash.equals(hmacEmailHash(email.toLowerCase(), HMAC_KEY))).toBe(true);
    expect(rows[0]!.password_hash.startsWith('scrypt:')).toBe(true);
    expect(JSON.stringify(rows[0])).not.toContain(PASSWORD);
  });

  it('verifica el correo, inicia sesion con cookie HttpOnly sin Domain y oculta si el correo existe', async () => {
    const email = `login-${randomBytes(4).toString('hex')}@example.test`;
    const register = await injectJson(app, 'POST', '/api/accounts/register', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      payload: { email, password: PASSWORD },
    });
    expect(register.statusCode).toBe(200);
    const token = tokenFromMail(fake.sent.at(-1)!);

    const verify = await injectJson(app, 'POST', '/api/accounts/verify', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      payload: { token },
    });
    expect(verify.statusCode).toBe(200);
    expect(verify.body).not.toContain(PASSWORD);

    const wrong = await injectJson(app, 'POST', '/api/accounts/login', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      payload: { email: `otro-${randomBytes(3).toString('hex')}@example.test`, password: PASSWORD },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json<{ error: string }>().error).toBe('No autorizado');

    const wrongPass = await injectJson(app, 'POST', '/api/accounts/login', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      payload: { email, password: 'otra-clave-distinta' },
    });
    expect(wrongPass.json<{ error: string }>().error).toBe('No autorizado');

    const login = await injectJson(app, 'POST', '/api/accounts/login', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      payload: { email, password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    expect(login.body).not.toContain(PASSWORD);
    const cookie = sessionCookie(login);
    expect(cookie).toBeDefined();
    const set = login.cookies.find((c) => c.name === 'fp_session');
    expect(set?.httpOnly).toBe(true);
    expect(set?.domain).toBeUndefined();

    const me = await injectJson(app, 'GET', '/api/accounts/me', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      cookie,
    });
    expect(me.json<{ user: { email: string } }>().user.email).toBe(email.toLowerCase());
  });

  it('el admin del sitio A recibe 403 en configuracion y eventos privados del sitio B', async () => {
    const slugA = `alfa${randomBytes(3).toString('hex')}`;
    const slugB = `beta${randomBytes(3).toString('hex')}`;
    const tenantA = await seedTenant(pool, slugA, 'Grupo Alfa');
    const tenantB = await seedTenant(pool, slugB, 'Grupo Beta');
    const userA = await seedUserVerified(pool, `admin-a-${slugA}@example.test`, PASSWORD);
    await pool.query(`INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1,$2,'admin')`, [tenantA, userA]);

    const login = await injectJson(app, 'POST', '/api/accounts/login', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      payload: { email: `admin-a-${slugA}@example.test`, password: PASSWORD },
    });
    const cookie = sessionCookie(login)!;

    const okSettings = await injectJson(app, 'GET', '/api/site/settings', {
      host: `${slugA}.somospanas.com`,
      origin: `https://${slugA}.somospanas.com`,
      cookie,
    });
    expect(okSettings.statusCode).toBe(200);

    const blockedSettings = await injectJson(app, 'GET', '/api/site/settings', {
      host: `${slugB}.somospanas.com`,
      origin: `https://${slugB}.somospanas.com`,
      cookie,
    });
    expect(blockedSettings.statusCode).toBe(403);

    const eventSlug = `privado-${randomBytes(4).toString('hex')}`;
    const sessionId = randomUUID();
    await pool.query(`INSERT INTO sessions (id, token_hash) VALUES ($1, $2)`, [
      sessionId,
      randomBytes(32),
    ]);
    await pool.query(
      `INSERT INTO events (
         id, slug, tenant_id, organizer_session_id, generation, title, template, meal, description,
         starts_at, ends_at, location, includes, agenda, price_cents, capacity, goal_cents, minimum_cents,
         visibility, admin_key_hash
       ) VALUES (
         $1,$2,$3,$4,0,'Privado','casa','cena','', now() + interval '1 day', now() + interval '2 days',
         'Sala','[]','[]',2500,8,10000,5000,'private', $5
       )`,
      [randomUUID(), eventSlug, tenantB, sessionId, randomBytes(32)],
    );

    const blockedEvent = await injectJson(app, 'GET', `/api/site/events/${eventSlug}`, {
      host: `${slugA}.somospanas.com`,
      origin: `https://${slugA}.somospanas.com`,
      cookie,
    });
    expect(blockedEvent.statusCode).toBe(403);
  });

  it('el trigger events_fill_legacy_tenant_id conserva NULL→legado e id explicito', async () => {
    const legacy = await legacyTenantId(pool);
    const explicit = randomUUID();
    const other = await seedTenant(pool, `gamma${randomBytes(3).toString('hex')}`, 'Gamma');
    const sessionId = randomUUID();
    await pool.query(`INSERT INTO sessions (id, token_hash) VALUES ($1, $2)`, [sessionId, randomBytes(32)]);

    const slugLegacy = `tri-legacy-${randomBytes(3).toString('hex')}`;
    await pool.query(
      `INSERT INTO events (
         id, slug, organizer_session_id, generation, title, template, meal, description,
         starts_at, ends_at, location, includes, agenda, price_cents, capacity, goal_cents, minimum_cents
       ) VALUES (
         $1,$2,$3,0,'T','casa','cena','', now() + interval '1 day', now() + interval '2 days',
         'X','[]','[]',2500,null,null,null
       )`,
      [randomUUID(), slugLegacy, sessionId],
    );
    const { rows: legacyRows } = await pool.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM events WHERE slug = $1',
      [slugLegacy],
    );
    expect(legacyRows[0]!.tenant_id).toBe(legacy);

    const slugExplicit = `tri-explicit-${randomBytes(3).toString('hex')}`;
    await pool.query(
      `INSERT INTO events (
         id, slug, tenant_id, organizer_session_id, generation, title, template, meal, description,
         starts_at, ends_at, location, includes, agenda, price_cents, capacity, goal_cents, minimum_cents
       ) VALUES (
         $1,$2,$3,$4,0,'T','casa','cena','', now() + interval '1 day', now() + interval '2 days',
         'X','[]','[]',2500,null,null,null
       )`,
      [randomUUID(), slugExplicit, other, sessionId],
    );
    const { rows: explicitRows } = await pool.query<{ tenant_id: string }>(
      'SELECT tenant_id FROM events WHERE slug = $1',
      [slugExplicit],
    );
    expect(explicitRows[0]!.tenant_id).toBe(other);
    expect(explicitRows[0]!.tenant_id).not.toBe(legacy);
    void explicit;
  });
});