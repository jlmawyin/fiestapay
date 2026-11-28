/**
 * Cliente de `GET /api/host-info` (NAP-U4).
 * Depende solo de `fetch`. La SPA decide con esta respuesta si el host es una reunión,
 * una dirección libre o una reservada; si falla, se mantiene el enrutado anterior.
 */
import type { HostInfo } from '@fiestapay/shared';

const HOSTS: ReadonlySet<string> = new Set(['root', 'legacy', 'site', 'event', 'free', 'reserved']);

function isHostInfo(value: unknown): value is HostInfo {
  if (!value || typeof value !== 'object') return false;
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === 'string' && HOSTS.has(kind);
}

/** Solo los subdominios de Somos Panas necesitan consultar host-info. */
export function shouldReadHostInfo(hostname = window.location.hostname): boolean {
  const host = hostname.toLowerCase();
  return host.endsWith('.somospanas.com') && host !== 'fiestapay.somospanas.com';
}

export async function fetchHostInfo(): Promise<HostInfo | null> {
  if (typeof fetch !== 'function') return null;
  try {
    const response = await fetch('/api/host-info', { credentials: 'include' });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    return isHostInfo(data) ? data : null;
  } catch {
    return null;
  }
}

/**
 * Lee `?subdominio=` de la URL de creación. El director debe pasarlo como
 * `preferredSubdomain` al `POST /api/events` desde la entrevista web (U3).
 */
export function preferredSubdomainFromLocation(search = window.location.search): string | undefined {
  const value = new URLSearchParams(search).get('subdominio')?.trim().toLowerCase();
  return value && /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(value) ? value : undefined;
}
