/**
 * Listado público en la raíz y visibilidad de eventos por admin de sitio (SP-6).
 * Depende de `tenants`, `tenant_settings`, `events` y `domain/access.ts`.
 */
import { badRequest, forbidden, notFound } from '../errors.js';
import { assertTenantAdmin, tenantIdForSlug } from './access.js';
import { isPastRetention } from './retention.js';
import type { Queryable } from './read.js';
import { EVENT_BASE_DOMAIN, ROOT_EVENTS_TENANT_SLUG } from './subdomains.js';

/** `example` = sitio plantilla (muestra); `live` = grupo real (D-5). */
export type PortalListingKind = 'live' | 'example';

export interface PortalListedEvent {
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  siteSlug: string;
  siteName: string;
  url: string;
  listingKind: PortalListingKind;
}

/**
 * Devuelve eventos marcados públicos que siguen en ventana de retención.
 * Entrada: pool de la raíz. Salida: filas sin ids internos, invitados ni pagos.
 */
export async function listPortalPublicEvents(db: Queryable, now = new Date()): Promise<PortalListedEvent[]> {
  const { rows } = await db.query<{
    slug: string;
    title: string;
    starts_at: Date;
    ends_at: Date;
    location: string;
    site_slug: string;
    site_name: string | null;
    tenant_kind: string;
    tenant_slug: string;
    subdomain: string | null;
  }>(
    `SELECT e.slug, e.title, e.starts_at, e.ends_at, COALESCE(e.location, '') AS location,
            t.slug AS site_slug, ts.display_name AS site_name, t.kind AS tenant_kind,
            t.slug AS tenant_slug, e.subdomain
       FROM events e
       INNER JOIN tenants t ON t.id = e.tenant_id
       LEFT JOIN tenant_settings ts ON ts.tenant_id = t.id
      WHERE e.visibility = 'public'
        AND t.kind <> 'legacy'
        AND (ts.tenant_id IS NOT NULL OR t.slug = $2)
        AND e.purged_at IS NULL
        AND e.archived = false
        AND e.ends_at + interval '72 hours' > $1::timestamptz
      ORDER BY e.starts_at ASC
      LIMIT 200`,
    [now.toISOString(), ROOT_EVENTS_TENANT_SLUG],
  );

  return rows
    .filter((row) => !isPastRetention(row.ends_at, now))
    .map((row) => {
      const rootEvent = row.tenant_slug === ROOT_EVENTS_TENANT_SLUG;
      const siteSlug = rootEvent && row.subdomain ? row.subdomain : row.site_slug;
      return {
        slug: row.slug,
        title: row.title,
        startsAt: row.starts_at.toISOString(),
        endsAt: row.ends_at.toISOString(),
        location: row.location,
        siteSlug,
        siteName: row.site_name ?? 'Somos Panas',
        url: row.subdomain
          ? `https://${row.subdomain}.${EVENT_BASE_DOMAIN}`
          : `https://${row.site_slug}.somospanas.com/e/${encodeURIComponent(row.slug)}`,
        listingKind: row.tenant_kind === 'template' ? ('example' as const) : ('live' as const),
      };
    });
}

type EventVisibility = 'private' | 'public';

interface VisibilityRow {
  id: string;
  tenant_id: string;
  visibility: EventVisibility;
  access_code_hash: Buffer | null;
  purged_at: Date | null;
}

/**
 * Cambia la visibilidad de un evento del sitio si el usuario es admin de ese tenant.
 * Entrada: slug del host, usuario, slug del evento y visibilidad pedida.
 * Salida: visibilidad guardada; 400 si hay código de acceso y se pide público.
 */
export async function updateSiteEventVisibility(
  db: Queryable,
  hostSlug: string,
  userId: string,
  eventSlug: string,
  visibility: EventVisibility,
): Promise<EventVisibility> {
  const tenantId = await tenantIdForSlug(db, hostSlug);
  if (!tenantId) throw notFound('Ruta no encontrada');
  await assertTenantAdmin(db, tenantId, userId);

  const { rows } = await db.query<VisibilityRow>(
    `SELECT id, tenant_id, visibility, access_code_hash, purged_at
       FROM events WHERE slug = $1 LIMIT 1`,
    [eventSlug],
  );
  const event = rows[0];
  if (!event || event.purged_at) throw notFound('Evento no encontrado');
  if (event.tenant_id !== tenantId) throw forbidden('No autorizado');

  if (visibility === 'public' && event.access_code_hash) {
    throw badRequest(
      'No se puede marcar público un evento con código de acceso. Quita el código antes de publicarlo en la portada.',
    );
  }

  await db.query('UPDATE events SET visibility = $2 WHERE id = $1', [event.id, visibility]);
  return visibility;
}