/**
 * Clasifica el host del navegador en raíz Somos Panas, legado o sitio de grupo (SP-6).
 * Depende de `site-host.ts` y de `window.location.hostname`.
 */
// NAP-F1b: tipos de `import.meta.env` sin archivo ambient adicional en web.
/// <reference types="vite/client" />
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

function hostOverrideAllowed(): boolean {
  // NAP-F1b (recomendación verificador): `import.meta.env` directo; misma semántica.
  return import.meta.env.DEV === true || import.meta.env.MODE === 'test';
}

/**
 * En dev o pruebas, permite forzar la clase de host desde sessionStorage (Playwright en localhost).
 */
function readHostOverride(hostname: string): BrowserHostKind | null {
  if (!hostOverrideAllowed()) return null;
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

const LEGACY_PROD_HOST = 'fiestapay.somospanas.com';

/**
 * URL de /create en el host legado (NAP-F4, demo): absoluta en producción y
 * relativa en desarrollo, donde un solo servidor sirve todos los hosts.
 * Entrada: hostname opcional (por defecto el visible); la vista nunca la arma.
 */
export function legacyCreateUrl(hostname: string = window.location.hostname): string {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost' || normalized === '127.0.0.1') return '/create';
  return `https://${LEGACY_PROD_HOST}/create`;
}