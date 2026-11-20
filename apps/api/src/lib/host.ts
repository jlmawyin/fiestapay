/**
 * Clasificación del sitio a partir del encabezado `Host` HTTP (Somos Panas SP-2).
 * Depende solo de la cadena recibida en `Host`; no usa `X-Forwarded-Host` ni `request.hostname`
 * de Fastify con `trustProxy`, porque un cliente podría falsificar el reenvío. Nginx ya fija
 * `Host` con `$host`; cuando el vhost amplíe el despliegue, conviene que Nginx también fije
 * `X-Forwarded-Host` al mismo valor.
 */
import { isAllowedOrigin, type OriginCheckInput } from './origin.js';

const BASE_DOMAIN = 'somospanas.com';

/** Subdominios reservados: no son sitios de grupo (PLAN SP-2). */
export const RESERVED_SITE_SLUGS = new Set([
  'www',
  'api',
  'mail',
  'smtp',
  'ftp',
  'admin',
  'app',
  'static',
  'cdn',
  'assets',
  'blog',
  'status',
  'webhook',
  'paypal',
  'pay',
  'pagos',
  'dev',
  'staging',
  'test',
  'demo',
  'fiestapay',
  'muestra',
  'ns1',
  'ns2',
  'localhost',
]);

const ROOT_HOSTNAMES = new Set(['somospanas.com', 'www.somospanas.com']);
const LEGACY_PRODUCTION_HOST = 'fiestapay.somospanas.com';

/** Gramática de slug de sitio en el apex (misma que el plan SP-2). */
const SITE_LABEL = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

export type HostKind = 'legacy' | 'root' | 'site' | 'invalid';

export interface HostClassification {
  kind: HostKind;
  /** Slug del sitio cuando `kind === 'site'`. */
  slug?: string;
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

/**
 * Clasifica el host en raíz, legado FiestaPay, sitio de grupo o inválido.
 * En desarrollo y pruebas, host ausente o local equivale al legado para no romper el harness.
 * En producción, host ausente es inválido.
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
    if (!SITE_LABEL.test(label) || RESERVED_SITE_SLUGS.has(label)) {
      return { kind: 'invalid', hostname: normalized };
    }
    return { kind: 'site', slug: label, hostname: normalized };
  }

  return { kind: 'invalid', hostname: normalized };
}

/**
 * Indica si esta etapa debe enrutar peticiones al API en este host.
 * Los sitios de grupo aún no tienen fila en base: responden 404 (SP-3 abrirá los existentes).
 */
export function isHostRoutable(classification: HostClassification): boolean {
  if (classification.kind === 'invalid') return false;
  if (classification.kind === 'site') return false;
  return true;
}

/**
 * Lista de orígenes permitidos para mutaciones según el host clasificado.
 * El legado conserva la lista exacta del servidor (ALLOWED_ORIGINS + PUBLIC_ORIGIN + dev).
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

/** Webhook PayPal solo en el host legado; firma servidor-a-servidor, sin Origin de navegador. */
export function isPayPalWebhookHost(classification: HostClassification): boolean {
  return classification.kind === 'legacy';
}