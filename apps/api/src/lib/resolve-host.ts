/**
 * Resolución de host con base de datos (NAP-S2).
 * `classifyHost` es síncrono y no consulta; aquí se decide si una etiqueta es un sitio existente,
 * la dirección de una reunión, un host libre o uno reservado.
 */
import { NON_CREATABLE_SITE_SLUGS } from '@fiestapay/shared';
import { EVENT_SUBDOMAIN_PATTERN, findEventBySubdomain } from '../domain/subdomains.js';
import type { Queryable } from '../domain/read.js';
import { classifyHost, type ClassifyHostOptions, type HostClassification } from './host.js';

/** Extrae la etiqueta de un host `*.somospanas.com` ya normalizado. */
function labelOf(hostname: string): string | null {
  const suffix = '.somospanas.com';
  if (!hostname.endsWith(suffix)) return null;
  const label = hostname.slice(0, -suffix.length);
  return label.length > 0 && !label.includes('.') ? label : null;
}

/**
 * Resuelve la clasificación efectiva del request.
 * Entrada: acceso a base, Host crudo y entorno. Salida: root/legacy/site/event/free/reserved/invalid.
 */
export async function resolveHost(
  db: Queryable,
  rawHost: string | undefined,
  options: ClassifyHostOptions,
): Promise<HostClassification> {
  const base = classifyHost(rawHost, options);

  if (base.kind === 'site' && base.slug) {
    const tenant = await db.query<{ id: string }>('SELECT id FROM tenants WHERE slug = $1 LIMIT 1', [base.slug]);
    if (tenant.rows.length > 0) return base;
    const event = await findEventBySubdomain(db, base.slug);
    if (event) {
      return { kind: 'event', slug: event.slug, subdomain: base.slug, hostname: base.hostname };
    }
    // `muestra` y otros no creables sin fila real no son un host libre cualquiera.
    if (NON_CREATABLE_SITE_SLUGS.has(base.slug)) {
      return { kind: 'reserved', label: base.slug, hostname: base.hostname };
    }
    return { kind: 'free', label: base.slug, subdomain: base.slug, hostname: base.hostname };
  }

  if (base.kind === 'invalid') {
    const label = labelOf(base.hostname);
    // NAP-S2: una etiqueta reservada no enruta a sitio ni a evento, pero host-info debe decir reserved.
    if (label && EVENT_SUBDOMAIN_PATTERN.test(label)) {
      return { kind: 'reserved', label, hostname: base.hostname };
    }
  }

  return base;
}
