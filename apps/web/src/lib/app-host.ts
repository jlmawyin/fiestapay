/**
 * Clasifica el host del navegador en raíz Somos Panas, legado FiestaPay o sitio de grupo (SP-6).
 * Depende de `site-host.ts` y de `window.location.hostname`.
 */
import { readSiteHostContext } from './site-host';

const SP_ROOT_HOSTS = new Set(['somospanas.com', 'www.somospanas.com']);

export type BrowserHostKind = 'somospanas-root' | 'legacy' | 'site';

export interface AppHostContext {
  kind: BrowserHostKind;
  /** Alias de `kind === 'site'` para ajustes existentes en App.tsx. */
  isSiteHost: boolean;
  /** Slug del subdominio cuando `kind === 'site'`. */
  slug: string | null;
}

const OVERRIDE_KEY = 'fp_sp_host_override';

/**
 * Lee un override de host solo en desarrollo o pruebas (Playwright) vía sessionStorage.
 * Entrada: ninguna. Salida: kind forzado o null.
 */
/**
 * Solo en local (127.0.0.1/localhost) permite forzar la clase de host para Playwright.
 */
function readHostOverride(hostname: string): BrowserHostKind | null {
  const normalized = hostname.toLowerCase();
  if (normalized !== '127.0.0.1' && normalized !== 'localhost') return null;
  try {
    const raw = sessionStorage.getItem(OVERRIDE_KEY);
    if (raw === 'somospanas-root' || raw === 'legacy' || raw === 'site') return raw;
  } catch {
    /* sessionStorage puede fallar en contextos aislados */
  }
  return null;
}

/**
 * Clasifica el hostname visible en la SPA.
 * Entrada: hostname opcional (por defecto `window.location.hostname`).
 * Salida: contexto con kind, slug e indicador de subdominio.
 */
export function readAppHostContext(hostname: string = window.location.hostname): AppHostContext {
  const forced = readHostOverride(hostname);
  if (forced === 'somospanas-root') {
    return { kind: 'somospanas-root', isSiteHost: false, slug: null };
  }
  if (forced === 'legacy') {
    return { kind: 'legacy', isSiteHost: false, slug: null };
  }
  if (forced === 'site') {
    return { kind: 'site', isSiteHost: true, slug: 'grupo-prueba' };
  }

  const site = readSiteHostContext(hostname);
  if (site.isSiteHost) {
    return { kind: 'site', isSiteHost: true, slug: site.slug };
  }

  const normalized = hostname.toLowerCase();
  if (SP_ROOT_HOSTS.has(normalized)) {
    return { kind: 'somospanas-root', isSiteHost: false, slug: null };
  }

  return { kind: 'legacy', isSiteHost: false, slug: null };
}