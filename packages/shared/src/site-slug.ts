/**
 * Gramática de slug de subdominio Somos Panas (SP-2 / SP-6).
 * Compartido entre API (`host.ts`) y la portada (`PortalLandingView`).
 */

/** Misma regex que valida el plan: etiqueta DNS de grupo en somospanas.com. */
export const SITE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

/**
 * Subdominios de infraestructura: nunca enrutan a un sitio de grupo (SP-2/SP-6).
 * NAP-F1b: `muestra` no está aquí; su subdominio sí enruta a la plantilla (SP-7).
 */
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
  'ns1',
  'ns2',
  'localhost',
]);

/** Slug del sitio plantilla: enrutable pero nunca creable (SP-7, NAP-F1b). */
export const MUESTRA_SITE_SLUG = 'muestra';

/**
 * Slugs que no se pueden crear: reservados de infraestructura más la plantilla (NAP-F1b).
 * El servidor aplica la misma regla en `assertSiteSlugValid` (sites.ts, SP-7).
 */
export const NON_CREATABLE_SITE_SLUGS: ReadonlySet<string> = new Set([
  ...RESERVED_SITE_SLUGS,
  MUESTRA_SITE_SLUG,
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
 * NAP-F1b: rechaza reservados y `muestra` (no creables); el enrutado usa otra lista.
 */
export function validateSiteSlug(slug: string): SiteSlugValidation {
  if (slug.length === 0) return 'empty';
  if (!SITE_SLUG_PATTERN.test(slug)) return 'invalid';
  if (NON_CREATABLE_SITE_SLUGS.has(slug)) return 'reserved';
  return 'ok';
}