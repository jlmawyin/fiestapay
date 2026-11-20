/**
 * Somos Panas SP-5 — configuración editable por sitio, contraste, módulos y voz en subdominio.
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
import { DEFAULT_SITE_COLORS, type TenantSiteSettings } from '../src/domain/tenant-settings.js';
import { LEGACY_TENANT_SLUG } from '../src/lib/host.js';
import { announceSkipWithoutDatabase, DATABASE_URL, MERCHANT, testConfig } from './harness.js';
import { FakePayPal } from './fake-paypal.js';

announceSkipWithoutDatabase('tenant-settings.test');
if (!DATABASE_URL) {
  throw new Error('tenant-settings.test requiere DATABASE_URL (Postgres 16 como CI)');
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

function defaultSettings(overrides: Partial<TenantSiteSettings> = {}): TenantSiteSettings {
  return {
    displayName: 'Grupo prueba',
    tagline: 'Juntos',
    about: 'Texto de presentación',
    colores: { ...DEFAULT_SITE_COLORS },
    modulos: { reuniones: true, eventos: true, recaudacion: true, asistente: true },
    ...overrides,
  };
}

interface InjectOut {
  statusCode: number;
  body: string;
  cookies: { name: string; value: string }[];
  json: <T = unknown>() => T;
}

async function injectJson(
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  opts: { host: string; origin: string; cookie?: string; payload?: object },
): Promise<InjectOut> {
  const headers: Record<string, string> = { host: opts.host, origin: opts.origin };
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await app.inject({ method, url, headers, ...(opts.payload ? { payload: opts.payload } : {}) });
  return {
    statusCode: res.statusCode,
    body: res.body,
    cookies: (res.cookies ?? []) as InjectOut['cookies'],
    json: <T = unknown>() => JSON.parse(res.body) as T,
  };
}

function sessionCookie(res: InjectOut): string | undefined {
  const set = res.cookies.find((c) => c.name === 'fp_session');
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

function mailEnv() {
  return {
    SMTP_HOST: 'salida.example.test',
    SMTP_PORT: '465',
    SMTP_USER: 'mail@example.test',
    SMTP_PASS: 'smtp-test-pass',
    EMAIL_FROM: 'mail@example.test',
    EMAIL_DAILY_CAP: '100',
    PUBLIC_ORIGIN: ROOT_ORIGIN,
  };
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

describe('tenant-settings SP-5', () => {
  const schema = `fp_test_${randomBytes(5).toString('hex')}`;
  let pool: Pool;
  let adminPool: Pool;
  let app: FastifyInstance;

  beforeAll(async () => {
    pool = createPool({ connectionString: DATABASE_URL!, schema });
    adminPool = createPool({ connectionString: DATABASE_URL!, max: 2 });
    await migrate(pool, { schema });
    app = await buildApp({
      pool,
      config: testConfig({
        ...mailEnv(),
        PUBLIC_ORIGIN: ROOT_ORIGIN,
        ALLOWED_ORIGINS: `${ROOT_ORIGIN},${LEGACY_ORIGIN}`,
      }),
      paypal: new FakePayPal(MERCHANT),
      email: new FakeEmail(),
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

  it('solo el admin del sitio guarda; member, anónimo y admin de otro sitio reciben 403', async () => {
    const slugA = `sp5a${randomBytes(3).toString('hex')}`;
    const slugB = `sp5b${randomBytes(3).toString('hex')}`;
    const tenantA = await seedTenant(pool, slugA, 'Alfa');
    await seedTenant(pool, slugB, 'Beta');
    const adminA = await seedUserVerified(pool, `admin-${slugA}@example.test`, PASSWORD);
    const memberA = await seedUserVerified(pool, `member-${slugA}@example.test`, PASSWORD);
    await pool.query(`INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1,$2,'admin')`, [tenantA, adminA]);
    await pool.query(`INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1,$2,'member')`, [tenantA, memberA]);

    const login = await injectJson(app, 'POST', '/api/accounts/login', {
      host: ROOT_HOST,
      origin: ROOT_ORIGIN,
      payload: { email: `admin-${slugA}@example.test`, password: PASSWORD },
    });
    const cookie = sessionCookie(login)!;
    const payload = defaultSettings({ displayName: 'Nuevo nombre' });

    const ok = await injectJson(app, 'PUT', '/api/site/settings', {
      host: `${slugA}.somospanas.com`,
      origin: `https://${slugA}.somospanas.com`,
      cookie,
      payload,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json<{ settings: TenantSiteSettings }>().settings.displayName).toBe('Nuevo nombre');

    const anonGet = await injectJson(app, 'GET', '/api/site/settings', {
      host: `${slugA}.somospanas.com`,
      origin: `https://${slugA}.somospanas.com`,
    });
    expect(anonGet.statusCode).toBe(403);

    const memberPut = await injectJson(app, 'PUT', '/api/site/settings', {
      host: `${slugA}.somospanas.com`,
      origin: `https://${slugA}.somospanas.com`,
      cookie: sessionCookie(
        await injectJson(app, 'POST', '/api/accounts/login', {
          host: ROOT_HOST,
          origin: ROOT_ORIGIN,
          payload: { email: `member-${slugA}@example.test`, password: PASSWORD },
        }),
      ),
      payload,
    });
    expect(memberPut.statusCode).toBe(403);

    const otherSite = await injectJson(app, 'PUT', '/api/site/settings', {
      host: `${slugB}.somospanas.com`,
      origin: `https://${slugB}.somospanas.com`,
      cookie,
      payload,
    });
    expect(otherSite.statusCode).toBe(403);
  });

  it('rechaza hex inválido y contraste insuficiente en el servidor', async () => {
    const slug = `sp5c${randomBytes(3).toString('hex')}`;
    const tenant = await seedTenant(pool, slug, 'Color');
    const admin = await seedUserVerified(pool, `admin-${slug}@example.test`, PASSWORD);
    await pool.query(`INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1,$2,'admin')`, [tenant, admin]);
    const cookie = sessionCookie(
      await injectJson(app, 'POST', '/api/accounts/login', {
        host: ROOT_HOST,
        origin: ROOT_ORIGIN,
        payload: { email: `admin-${slug}@example.test`, password: PASSWORD },
      }),
    )!;

    const badHex = await injectJson(app, 'PUT', '/api/site/settings', {
      host: `${slug}.somospanas.com`,
      origin: `https://${slug}.somospanas.com`,
      cookie,
      payload: defaultSettings({ colores: { ...DEFAULT_SITE_COLORS, ink: 'rojo' } }),
    });
    expect(badHex.statusCode).toBe(400);
    expect(badHex.body).toMatch(/sitio\.schema\.json/);

    const lowContrast = await injectJson(app, 'PUT', '/api/site/settings', {
      host: `${slug}.somospanas.com`,
      origin: `https://${slug}.somospanas.com`,
      cookie,
      payload: defaultSettings({
        colores: {
          ...DEFAULT_SITE_COLORS,
          ink: '#F7FAFC',
          cloudwhite: '#F7FAFC',
        },
      }),
    });
    expect(lowContrast.statusCode).toBe(400);
    expect(lowContrast.body).toMatch(/contraste/i);
  });

  it('con asistente apagado el POST /api/site/voice/public/token responde 404 en el subdominio', async () => {
    const slug = `sp5v${randomBytes(3).toString('hex')}`;
    const tenant = await seedTenant(pool, slug, 'Sin voz');
    await pool.query(`UPDATE tenant_settings SET modulo_asistente = false WHERE tenant_id = $1`, [tenant]);

    const off = await injectJson(app, 'POST', '/api/site/voice/public/token', {
      host: `${slug}.somospanas.com`,
      origin: `https://${slug}.somospanas.com`,
      payload: { consent: true },
    });
    expect(off.statusCode).toBe(404);

    await pool.query(`UPDATE tenant_settings SET modulo_asistente = true WHERE tenant_id = $1`, [tenant]);
    const on = await injectJson(app, 'POST', '/api/site/voice/public/token', {
      host: `${slug}.somospanas.com`,
      origin: `https://${slug}.somospanas.com`,
      payload: { consent: true },
    });
    expect(on.statusCode).not.toBe(404);
  });

  it('en host legado la voz pública no consulta modulo_asistente', async () => {
    const { rows } = await pool.query<{ id: string }>(`SELECT id FROM tenants WHERE slug = $1`, [LEGACY_TENANT_SLUG]);
    const legacyId = rows[0]?.id;
    expect(legacyId).toBeTruthy();
    await pool.query(`UPDATE tenant_settings SET modulo_asistente = false WHERE tenant_id = $1`, [legacyId]);

    const legacyVoice = await injectJson(app, 'POST', '/api/voice/public/token', {
      host: LEGACY_HOST,
      origin: LEGACY_ORIGIN,
      payload: { consent: true },
    });
    expect(legacyVoice.statusCode).not.toBe(404);

    await pool.query(`UPDATE tenant_settings SET modulo_asistente = true WHERE tenant_id = $1`, [legacyId]);
  });

  it('GET /api/site/profile expone la configuración sin sesión', async () => {
    const slug = `sp5p${randomBytes(3).toString('hex')}`;
    await seedTenant(pool, slug, 'Público');
    const res = await injectJson(app, 'GET', '/api/site/profile', {
      host: `${slug}.somospanas.com`,
      origin: `https://${slug}.somospanas.com`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ settings: TenantSiteSettings }>().settings.displayName).toBe('Público');
  });
});