/**
 * Gramática de slug de subdominio Somos Panas (SP-2 / SP-6).
 * Compartido entre API (`host.ts`) y la portada (`PortalLandingView`).
 */

/** Misma regex que valida el plan: etiqueta DNS de grupo en somospanas.com. */
export const SITE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

/** Subdominios que nunca son sitios de grupo editables. */
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

export type SiteSlugValidation = 'ok' | 'empty' | 'invalid' | 'reserved';

/**
 * Normaliza el texto del compositor antes de validar o enviar al servidor.
 */
export function normalizeSiteSlugInput(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Valida un slug candidato sin llamar a la red (D-7).
 * Entrada: cadena ya normalizada. Salida: motivo de rechazo u `ok`.
 */
export function validateSiteSlug(slug: string): SiteSlugValidation {
  if (slug.length === 0) return 'empty';
  if (!SITE_SLUG_PATTERN.test(slug)) return 'invalid';
  if (RESERVED_SITE_SLUGS.has(slug)) return 'reserved';
  return 'ok';
}