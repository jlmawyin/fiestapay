/**
 * Detecta si el navegador está en un subdominio de sitio Somos Panas (no raíz ni legado).
 * Depende solo de `window.location.hostname`; no envía datos al servidor.
 */
// NAP-F1b: gramática compartida con la API; no se duplica la regex en la web.
import { SITE_SLUG_PATTERN as SITE_LABEL } from '@fiestapay/shared';
const ROOTS = new Set(['somospanas.com', 'www.somospanas.com', 'fiestapay.somospanas.com', 'localhost', '127.0.0.1']);

export interface SiteHostContext {
  isSiteHost: boolean;
  slug: string | null;
}

/**
 * Clasifica el hostname actual de forma ligera para la SPA.
 * En desarrollo, `localhost` no se trata como sitio de grupo.
 */
export function readSiteHostContext(hostname: string = window.location.hostname): SiteHostContext {
  const host = hostname.toLowerCase();
  if (ROOTS.has(host)) return { isSiteHost: false, slug: null };
  const suffix = '.somospanas.com';
  if (!host.endsWith(suffix)) return { isSiteHost: false, slug: null };
  const label = host.slice(0, -suffix.length);
  if (!SITE_LABEL.test(label)) return { isSiteHost: false, slug: null };
  return { isSiteHost: true, slug: label };
}