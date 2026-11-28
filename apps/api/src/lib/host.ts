/**
 * Clasificación del sitio a partir del encabezado `Host` HTTP (Somos Panas SP-2).
 * Depende solo de la cadena recibida en `Host`; no usa `X-Forwarded-Host` ni `request.hostname`
 * de Fastify con `trustProxy`, porque un cliente podría falsificar el reenvío. Nginx ya fija
 * `Host` con `$host`; cuando el vhost amplíe el despliegue, conviene que Nginx también fije
 * `X-Forwarded-Host` al mismo valor.
 */
import { RESERVED_SITE_SLUGS } from '@fiestapay/shared';
import type { Pool, PoolClient } from '../db/pool.js';
import { isAllowedOrigin, type OriginCheckInput } from './origin.js';

const BASE_DOMAIN = 'somospanas.com';

/** Slug del sitio legado FiestaPay en la tabla `tenants` (SP-3). */
export const LEGACY_TENANT_SLUG = 'fiestapay';

type TenantLookup = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

/** Reexporta el conjunto compartido de slugs no enrutables (SP-2/SP-6). */
// NAP-F1b: se queda la versión SP-6 (lista en @fiestapay/shared). `muestra` no está en
// RESERVED_SITE_SLUGS: su subdominio enruta al sitio plantilla si existe fila (SP-7) y solo
// está vetado al crear (sites.ts lo compara con MUESTRA_SLUG y el compositor lo rechaza).
export { RESERVED_SITE_SLUGS };

const ROOT_HOSTNAMES = new Set(['somospanas.com', 'www.somospanas.com']);
const LEGACY_PRODUCTION_HOST = 'fiestapay.somospanas.com';

/** NAP-S2: el host de evento admite etiquetas DNS de hasta 40; el alta de sitios sigue en 32. */
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export type HostKind = 'legacy' | 'root' | 'site' | 'event' | 'free' | 'reserved' | 'invalid';

export interface HostClassification {
  kind: HostKind;
  /** Slug del sitio cuando `kind === 'site'`; slug de la invitación cuando `kind === 'event'`. */
  slug?: string;
  /** Etiqueta DNS del host de evento (NAP-S2). */
  subdomain?: string;
  /** Etiqueta de un host libre o reservado (NAP-S2). */
  label?: string;
  /** Nombre normalizado sin puerto, en minúsculas. */
  hostname: string;
}

export type AppEnv = 'production' | 'development' | 'test';

export interface ClassifyHostOptions {
  env: AppEnv;
}

/**
 * Recorta puerto y pone en minúsculas el valor crudo de `Host`.
 * Entrada: cadena tal como llega en la cabecera (puede incluir `:puerto` o ser vacía).
 * Salida: hostname listo para clasificar, o `null` si falta o solo hay espacios.
 */
export function normalizeHostHeader(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  let host = trimmed.toLowerCase();
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    if (end !== -1) host = host.slice(1, end);
    return host;
  }
  const lastColon = host.lastIndexOf(':');
  if (lastColon !== -1 && host.indexOf(':') === lastColon) {
    const maybePort = host.slice(lastColon + 1);
    if (/^\d+$/.test(maybePort)) host = host.slice(0, lastColon);
  }
  return host;
}

function isLocalLegacyHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export const HEALTH_PROBE_PATH = '/api/health';

/**
 * D-1: salta el corte por host para el sondeo operativo del contenedor (`deploy/compose.yml`).
 * Recibe método HTTP y ruta sin query; devuelve true solo en GET/HEAD de `/api/health`.
 */
export function isHealthProbeExempt(method: string, pathOnly: string): boolean {
  const upper = method.toUpperCase();
  if (upper !== 'GET' && upper !== 'HEAD') return false;
  return pathOnly === HEALTH_PROBE_PATH;
}

/**
 * Clasifica el host en raíz, legado FiestaPay, sitio de grupo o inválido (D-2).
 * Recibe el valor crudo de la cabecera `Host` (puede traer puerto) y el entorno de la app.
 * Devuelve `HostClassification` con `kind`, `hostname` normalizado y `slug` si aplica.
 * En desarrollo y pruebas, host ausente o local equivale al legado para no romper el harness;
 * en producción, localhost/127.0.0.1 no son legado (evita abrir el legado a cualquier Host local).
 */
export function classifyHost(rawHost: string | undefined, options: ClassifyHostOptions): HostClassification {
  const normalized = normalizeHostHeader(rawHost);
  if (normalized === null) {
    if (options.env !== 'production') {
      return { kind: 'legacy', hostname: 'localhost' };
    }
    return { kind: 'invalid', hostname: '' };
  }

  if (options.env !== 'production' && isLocalLegacyHost(normalized)) {
    return { kind: 'legacy', hostname: normalized };
  }

  if (normalized === LEGACY_PRODUCTION_HOST) {
    return { kind: 'legacy', hostname: normalized };
  }

  if (ROOT_HOSTNAMES.has(normalized)) {
    return { kind: 'root', hostname: normalized };
  }

  const suffix = `.${BASE_DOMAIN}`;
  if (normalized.endsWith(suffix)) {
    const label = normalized.slice(0, -suffix.length);
    if (label.includes('.')) {
      return { kind: 'invalid', hostname: normalized };
    }
    if (!HOST_LABEL.test(label) || RESERVED_SITE_SLUGS.has(label)) {
      return { kind: 'invalid', hostname: normalized };
    }
    return { kind: 'site', slug: label, hostname: normalized };
  }

  return { kind: 'invalid', hostname: normalized };
}

/**
 * Decide si las rutas normales del API deben atenderse en este host (D-2).
 * Recibe la clasificación ya calculada; devuelve true solo para raíz y legado en SP-2.
 * Los sitios de grupo devuelven false hasta SP-3; los inválidos siempre false.
 * No aplica al sondeo de salud: ver `isHealthProbeExempt` (D-1).
 */
export function isHostRoutable(classification: HostClassification): boolean {
  if (classification.kind === 'invalid') return false;
  if (classification.kind === 'site') return false;
  return true;
}

/**
 * Arma la lista exacta de orígenes del navegador permitidos en mutaciones para ese host (D-2).
 * Recibe la clasificación del request y la lista legada de configuración (`allowedOrigins`).
 * Devuelve un arreglo de URLs de origen: en legado repite la lista del servidor; en raíz/sitio
 * solo el origen HTTPS del propio host público.
 */
export function allowedOriginsForHost(
  classification: HostClassification,
  legacyAllowed: string[],
): string[] {
  if (classification.kind === 'legacy') return legacyAllowed;
  if (classification.kind === 'root') {
    return ['https://somospanas.com', 'https://www.somospanas.com'];
  }
  if (classification.kind === 'site' && classification.slug) {
    return [`https://${classification.slug}.somospanas.com`];
  }
  if (classification.kind === 'event' && classification.subdomain) {
    return [`https://${classification.subdomain}.somospanas.com`];
  }
  if (classification.kind === 'free' || classification.kind === 'reserved') {
    return [`https://${classification.hostname}`];
  }
  return [];
}

/**
 * Misma regla que hoy, pero la lista permitida depende del host del request.
 * Entrada: clasificación, cabeceras Origin/Referer y la lista legada de configuración.
 * Salida: true si la mutación puede continuar.
 */
export function isOriginAllowedForHost(
  classification: HostClassification,
  input: Omit<OriginCheckInput, 'allowed'>,
  legacyAllowed: string[],
): boolean {
  const allowed = allowedOriginsForHost(classification, legacyAllowed);
  return isAllowedOrigin({ ...input, allowed });
}

/**
 * Indica si este host puede registrar el webhook firmado de PayPal (D-2).
 * Recibe la clasificación del request; devuelve true solo cuando `kind === 'legacy'`.
 * Firma servidor-a-servidor, sin Origin de navegador; en raíz o sitio responde 404 en esa ruta.
 */
export function isPayPalWebhookHost(classification: HostClassification): boolean {
  return classification.kind === 'legacy';
}

/**
 * Devuelve el uuid del sitio legado en `tenants` (SP-3).
 * Entrada: cliente o pool con acceso a la base del request.
 * Salida: id del tenant `fiestapay`; error si la migración 0013 aún no corrió.
 */
export async function legacyTenantId(db: TenantLookup): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM tenants WHERE slug = $1 LIMIT 1`,
    [LEGACY_TENANT_SLUG],
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`Sitio legado ${LEGACY_TENANT_SLUG} no encontrado`);
  }
  return row.id;
}