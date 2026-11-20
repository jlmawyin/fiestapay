/**
 * Alta de espacios y plantilla `muestra` (Somos Panas SP-7).
 * Depende de `tenants`, `tenant_settings`, `memberships`, `handoff_codes`, `users` verificados
 * y validación Ajv en `tenant-settings.ts`. Solo cuentas con correo verificado en la raíz pueden
 * crear sitios; el creador queda como único admin y recibe un código de handoff de un solo uso.
 */
import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from '../db/pool.js';
import { badRequest, conflict, HttpError } from '../errors.js';
import { newId, sha256 } from '../lib/ids.js';
import type { Config } from '../config.js';
import { withTransaction, type Pool } from '../db/pool.js';
import { createSession as mintSession, readSession } from '../lib/session.js';
import { RESERVED_SITE_SLUGS } from '../lib/host.js';
import { digestMatches } from './access.js';
import { requireVerifiedUser } from './accounts.js';
import {
  DEFAULT_SITE_COLORS,
  parseAndValidateSiteSettings,
  type TenantSiteSettings,
} from './tenant-settings.js';

/** Gramática de slug en subdominio (igual que `host.ts`). */
const SITE_LABEL = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

export const MUESTRA_SLUG = 'muestra';
const HANDOFF_TTL_MS = 10 * 60 * 1000;

export const SITE_CREATE_IP_LIMIT = 20;
export const SITE_CREATE_USER_LIMIT = 5;
const SITE_CREATE_WINDOW_SECONDS = 3600;

const SLUG_INVALID = 'Slug invalido o reservado';
const HANDOFF_INVALID = 'Codigo invalido o vencido';

interface TemplateSettingsRow {
  tagline: string;
  about: string;
  color_cloudwhite: string;
  color_ink: string;
  color_ink_muted: string;
  color_blue: string;
  color_teal: string;
  color_yellow: string;
  color_coral: string;
  modulo_reuniones: boolean;
  modulo_eventos: boolean;
  modulo_recaudacion: boolean;
  modulo_asistente: boolean;
}

export interface CreateSiteResult {
  site: { slug: string; url: string };
  handoff: { code: string; expiresAt: string };
}

export interface RedeemHandoffResult {
  ok: true;
  site: { slug: string };
}

/**
 * Recorta y pasa a minúsculas el slug pedido en el cuerpo.
 * Entrada: cadena cruda. Salida: slug normalizado.
 */
export function normalizeSiteSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Valida formato y lista reservada; lanza 400 si no sirve.
 * Entrada: slug ya normalizado. Salida: void.
 */
export function assertSiteSlugValid(slug: string): void {
  // `muestra` es plantilla (slug reservado al crear, D-9), pero su subdominio sí enruta si existe fila en tenants.
  if (!SITE_LABEL.test(slug) || RESERVED_SITE_SLUGS.has(slug) || slug === MUESTRA_SLUG) {
    throw badRequest(SLUG_INVALID);
  }
}

/**
 * Incrementa ventana de intentos (mismo patrón que cuentas SP-4).
 * Entrada: transacción, scope permitido por 0015, bucket y segundos de ventana.
 * Salida: golpes en la ventana actual.
 */
async function bumpWindow(db: PoolClient, scope: string, bucket: Buffer, windowSeconds: number): Promise<number> {
  const { rows } = await db.query<{ hits: number }>(
    `INSERT INTO email_attempt_windows AS w (scope, bucket, window_start, hits)
     VALUES ($1, $2, now(), 1)
     ON CONFLICT (scope, bucket) DO UPDATE
     SET hits = CASE
           WHEN w.window_start <= now() - make_interval(secs => $3) THEN 1
           ELSE w.hits + 1
         END,
         window_start = CASE
           WHEN w.window_start <= now() - make_interval(secs => $3) THEN now()
           ELSE w.window_start
         END
     RETURNING hits`,
    [scope, bucket, windowSeconds],
  );
  return rows[0]?.hits ?? 1;
}

/**
 * Límite por IP y por usuario antes de insertar tenant (SP7-D-1).
 * Entrada: IP del cliente e id de usuario verificado.
 * Salida: true si ambas ventanas admiten el intento.
 */
async function chargeSiteCreateAttempt(db: PoolClient, ip: string, userId: string): Promise<boolean> {
  const ipHits = await bumpWindow(db, 'site_create_ip', sha256(`site-ip:${ip}`), SITE_CREATE_WINDOW_SECONDS);
  const userHits = await bumpWindow(
    db,
    'site_create_user',
    sha256(`site-user:${userId}`),
    SITE_CREATE_WINDOW_SECONDS,
  );
  return ipHits <= SITE_CREATE_IP_LIMIT && userHits <= SITE_CREATE_USER_LIMIT;
}

/**
 * Inserta el sitio plantilla `muestra` si no existe (solo invocación explícita; pruebas y alta de grupo).
 * Entrada: pool o cliente. Salida: id del tenant plantilla.
 */
export async function ensureMuestraTemplate(db: Pool | PoolClient): Promise<string> {
  await db.query(
    `INSERT INTO tenants (slug, kind, discoverable, payment_provider)
     VALUES ($1, 'template', true, 'none')
     ON CONFLICT (slug) DO NOTHING`,
    [MUESTRA_SLUG],
  );
  const { rows: tenantRows } = await db.query<{ id: string }>(
    `SELECT id FROM tenants WHERE slug = $1 LIMIT 1`,
    [MUESTRA_SLUG],
  );
  const tenantId = tenantRows[0]?.id;
  if (!tenantId) throw new Error('plantilla muestra no disponible');

  await db.query(
    `INSERT INTO tenant_settings (
       tenant_id, display_name, tagline, about,
       color_cloudwhite, color_ink, color_ink_muted, color_blue, color_teal, color_yellow, color_coral,
       modulo_reuniones, modulo_eventos, modulo_recaudacion, modulo_asistente
     ) VALUES ($1,'Sitio de muestra','Un ejemplo para copiar','Texto de presentación de muestra.',
       $2,$3,$4,$5,$6,$7,$8,
       true,true,true,true)
     ON CONFLICT (tenant_id) DO NOTHING`,
    [
      tenantId,
      DEFAULT_SITE_COLORS.cloudwhite,
      DEFAULT_SITE_COLORS.ink,
      DEFAULT_SITE_COLORS.inkMuted,
      DEFAULT_SITE_COLORS.blue,
      DEFAULT_SITE_COLORS.teal,
      DEFAULT_SITE_COLORS.yellow,
      DEFAULT_SITE_COLORS.coral,
    ],
  );
  return tenantId;
}

function templateRowToSettings(row: TemplateSettingsRow, displayName: string): TenantSiteSettings {
  return {
    displayName,
    tagline: row.tagline,
    about: row.about,
    colores: {
      cloudwhite: row.color_cloudwhite,
      ink: row.color_ink,
      inkMuted: row.color_ink_muted,
      blue: row.color_blue,
      teal: row.color_teal,
      yellow: row.color_yellow,
      coral: row.color_coral,
    },
    modulos: {
      reuniones: row.modulo_reuniones,
      eventos: row.modulo_eventos,
      recaudacion: row.modulo_recaudacion,
      asistente: row.modulo_asistente,
    },
  };
}

/**
 * Crea un sitio de grupo clonando configuración de `muestra` (sin gente ni dinero).
 * Entrada: sesión verificada en la raíz, slug y nombre visible.
 * Salida: URL pública y código de handoff de un solo uso (~10 min).
 */
export async function createGroupSite(
  pool: Pool,
  config: Config,
  req: FastifyRequest,
  reply: FastifyReply,
  rawSlug: string,
  rawDisplayName: string,
  clientIp: string,
): Promise<CreateSiteResult> {
  const slug = normalizeSiteSlug(rawSlug);
  assertSiteSlugValid(slug);

  const draft = parseAndValidateSiteSettings({
    displayName: typeof rawDisplayName === 'string' ? rawDisplayName : '',
    tagline: '',
    about: '',
    colores: DEFAULT_SITE_COLORS,
    modulos: { reuniones: true, eventos: true, recaudacion: true, asistente: true },
  });

  const { user } = await requireVerifiedUser(pool, config, req, reply);

  const outcome = await withTransaction(pool, async (client) => {
    const allowed = await chargeSiteCreateAttempt(client, clientIp, user.id);
    if (!allowed) return { kind: 'limited' as const };

    await ensureMuestraTemplate(client);

    const template = await client.query<TemplateSettingsRow>(
      `SELECT ts.tagline, ts.about,
              ts.color_cloudwhite, ts.color_ink, ts.color_ink_muted, ts.color_blue, ts.color_teal,
              ts.color_yellow, ts.color_coral,
              ts.modulo_reuniones, ts.modulo_eventos, ts.modulo_recaudacion, ts.modulo_asistente
         FROM tenant_settings ts
         JOIN tenants t ON t.id = ts.tenant_id
        WHERE t.slug = $1`,
      [MUESTRA_SLUG],
    );
    const templateRow = template.rows[0];
    if (!templateRow) throw new Error('configuracion de plantilla ausente');

    const settings = templateRowToSettings(templateRow, draft.displayName);
    parseAndValidateSiteSettings(settings);

    const exists = await client.query<{ id: string }>(`SELECT id FROM tenants WHERE slug = $1 LIMIT 1`, [slug]);
    if (exists.rows[0]) return { kind: 'taken' as const };

    const tenantId = newId();
    try {
      await client.query(
        `INSERT INTO tenants (id, slug, kind, discoverable, payment_provider, created_by)
         VALUES ($1,$2,'group',false,'none',$3)`,
        [tenantId, slug, user.id],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return { kind: 'taken' as const };
      throw err;
    }

    await client.query(
      `INSERT INTO tenant_settings (
         tenant_id, display_name, tagline, about,
         color_cloudwhite, color_ink, color_ink_muted, color_blue, color_teal, color_yellow, color_coral,
         modulo_reuniones, modulo_eventos, modulo_recaudacion, modulo_asistente
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        tenantId,
        settings.displayName,
        settings.tagline,
        settings.about,
        settings.colores.cloudwhite,
        settings.colores.ink,
        settings.colores.inkMuted,
        settings.colores.blue,
        settings.colores.teal,
        settings.colores.yellow,
        settings.colores.coral,
        settings.modulos.reuniones,
        settings.modulos.eventos,
        settings.modulos.recaudacion,
        settings.modulos.asistente,
      ],
    );

    await client.query(
      `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1,$2,'admin')
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'admin'`,
      [tenantId, user.id],
    );

    const code = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + HANDOFF_TTL_MS);
    await client.query(
      `INSERT INTO handoff_codes (id, code_hash, tenant_id, user_id, expires_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [newId(), sha256(code), tenantId, user.id, expiresAt.toISOString()],
    );

    return { kind: 'ok' as const, code, expiresAt, slug };
  });

  if (outcome.kind === 'limited') throw new HttpError(429, 'Demasiados intentos. Espera antes de volver a intentar.');
  if (outcome.kind === 'taken') throw conflict('Ese subdominio ya esta en uso');

  return {
    site: { slug: outcome.slug, url: `https://${outcome.slug}.somospanas.com` },
    handoff: { code: outcome.code, expiresAt: outcome.expiresAt.toISOString() },
  };
}

/**
 * Canjea el código en el host del sitio nuevo: sesión propia sin autorizar la cookie de la raíz.
 * Entrada: slug del host, código en texto plano, reply para fijar cookie HttpOnly sin Domain.
 * Salida: confirmación; el usuario queda con sesión y membresía admin en el subdominio.
 */
export async function redeemSiteHandoff(
  pool: Pool,
  config: Config,
  req: FastifyRequest,
  reply: FastifyReply,
  hostSlug: string,
  rawCode: string,
): Promise<RedeemHandoffResult> {
  if (typeof rawCode !== 'string' || rawCode.length < 43 || rawCode.length > 200 || !/^[A-Za-z0-9_-]+$/.test(rawCode)) {
    throw badRequest(HANDOFF_INVALID);
  }
  const digest = sha256(rawCode);

  const redeemed = await withTransaction(pool, async (client) => {
    const locked = await client.query<{
      id: string;
      code_hash: Buffer;
      tenant_id: string;
      user_id: string;
      expires_at: Date;
      consumed_at: Date | null;
      slug: string;
    }>(
      `SELECT h.id, h.code_hash, h.tenant_id, h.user_id, h.expires_at, h.consumed_at, t.slug
         FROM handoff_codes h
         JOIN tenants t ON t.id = h.tenant_id
        WHERE h.code_hash = $1
        FOR UPDATE`,
      [digest],
    );
    const row = locked.rows[0];
    if (!row || !digestMatches(row.code_hash, rawCode)) return { kind: 'bad' as const };
    if (row.slug !== hostSlug) return { kind: 'bad' as const };
    if (row.consumed_at) return { kind: 'bad' as const };
    if (row.expires_at.getTime() <= Date.now()) return { kind: 'bad' as const };

    const consumed = await client.query(
      `UPDATE handoff_codes SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL RETURNING id`,
      [row.id],
    );
    if ((consumed.rowCount ?? 0) !== 1) return { kind: 'bad' as const };

    await client.query(
      `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1,$2,'admin')
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'admin'`,
      [row.tenant_id, row.user_id],
    );

    return { kind: 'ok' as const, userId: row.user_id, slug: row.slug };
  });

  if (redeemed.kind === 'bad') throw badRequest(HANDOFF_INVALID);

  const prior = await readSession(pool, config, req);
  const session = await mintSession(pool, config, reply);
  if (prior) {
    await pool.query('UPDATE sessions SET user_id = NULL WHERE id = $1', [prior.id]);
  }
  await pool.query('UPDATE sessions SET user_id = $1 WHERE id = $2', [redeemed.userId, session.id]);

  return { ok: true, site: { slug: redeemed.slug } };
}