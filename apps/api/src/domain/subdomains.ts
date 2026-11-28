/**
 * Direcciones propias de reunión (NAP-S2).
 * Depende de `events.subdomain` (0017) y de la lista compartida de slugs no creables.
 * Genera etiquetas DNS a partir del título, resuelve colisiones con sufijo y bloquea carreras
 * con un advisory lock por etiqueta dentro de la transacción de creación.
 */
import { NON_CREATABLE_SITE_SLUGS } from '@fiestapay/shared';
import { badRequest, conflict } from '../errors.js';
import type { Queryable } from './read.js';

export const EVENT_SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
export const EVENT_BASE_DOMAIN = 'somospanas.com';
/** NAP-S2: tenant interno (slug no DNS) de reuniones creadas desde la raíz. */
export const ROOT_EVENTS_TENANT_SLUG = '_reuniones';
const MAX_LENGTH = 40;
const FALLBACK = 'reunion';

/** Dirección pública de una reunión; el cliente nunca arma esta URL. */
export function eventPublicUrl(subdomain: string | null | undefined): string | null {
  return subdomain ? `https://${subdomain}.${EVENT_BASE_DOMAIN}` : null;
}

/** NAP-S2: quita acentos/emojis, deja a-z0-9, recorta a 40 y cae en `reunion` si queda corto. */
export function baseSubdomainFromTitle(title: string): string {
  const limpio = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, MAX_LENGTH);
  return limpio.length >= 3 ? limpio : FALLBACK;
}

/** Sufijo 2, 3… sin pasar de 40 caracteres ni terminar en guion. */
export function suffixedSubdomain(base: string, suffix: number): string {
  const texto = String(suffix);
  const recorte = Math.max(3, MAX_LENGTH - texto.length);
  const tallo = base.slice(0, recorte).replace(/-+$/, '') || FALLBACK;
  return `${tallo}${texto}`;
}

function validarPreferida(preferred: string | undefined): string | null {
  if (preferred === undefined) return null;
  if (!EVENT_SUBDOMAIN_PATTERN.test(preferred)) throw badRequest('Direccion invalida');
  return preferred;
}

async function disponible(db: Queryable, candidate: string): Promise<boolean> {
  if (NON_CREATABLE_SITE_SLUGS.has(candidate)) return false;
  // NAP-S2: el mismo cerrojo lo toma el alta de sitios para que evento y sitio no se crucen.
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`subdomain:${candidate}`]);
  const tenant = await db.query<{ ok: number }>('SELECT 1 AS ok FROM tenants WHERE slug = $1 LIMIT 1', [candidate]);
  if (tenant.rows.length > 0) return false;
  const event = await db.query<{ ok: number }>('SELECT 1 AS ok FROM events WHERE subdomain = $1 LIMIT 1', [
    candidate,
  ]);
  return event.rows.length === 0;
}

/**
 * Elige una etiqueta libre para la reunión. `preferredSubdomain` manda si es válida; si está
 * reservada, la usa un sitio o la usa otro evento, se prueba con 2, 3… dentro de la transacción.
 */
export async function chooseEventSubdomain(
  db: Queryable,
  title: string,
  preferredSubdomain?: string,
): Promise<string> {
  const preferida = validarPreferida(preferredSubdomain);
  const base = preferida ?? baseSubdomainFromTitle(title);
  if (await disponible(db, base)) return base;
  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = suffixedSubdomain(base, suffix);
    if (await disponible(db, candidate)) return candidate;
  }
  throw conflict('No se pudo asignar una direccion unica para la reunion');
}

/** Busca por etiqueta; null si no hay reunión con esa dirección. */
export async function findEventBySubdomain(
  db: Queryable,
  subdomain: string,
): Promise<{ slug: string; title: string; description: string; access_code_hash: Buffer | null } | null> {
  const { rows } = await db.query<{
    slug: string;
    title: string;
    description: string;
    access_code_hash: Buffer | null;
  }>(
    `SELECT slug, title, description, access_code_hash
       FROM events
      WHERE subdomain = $1
      LIMIT 1`,
    [subdomain],
  );
  return rows[0] ?? null;
}
