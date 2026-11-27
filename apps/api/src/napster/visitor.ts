/**
 * Decide en el servidor el tipo de visitante de la avatar (NAP-F2).
 * Depende de la clasificación de `Host`, la sesión de cuenta y los cerrojos de `access.ts`.
 * Reutiliza el mismo cerrojo que la lectura pública del evento: en el host del sitio exige
 * pertenencia al tenant y código/desbloqueo; en raíz/legado oculta los private de grupo (SP7-D-1).
 */
import type { FastifyRequest } from 'fastify';
import type { AvatarLang, AvatarVisitor } from '@fiestapay/shared';
import type { Config } from '../config.js';
import type { Pool } from '../db/pool.js';
import { currentAccount } from '../domain/accounts.js';
import {
  assertAdminKey,
  assertPrivateAccess,
  membershipRoleForUser,
  presentedAdminKey,
  resolveEventPortalGate,
  tenantIdForSlug,
} from '../domain/access.js';
import { assertActive } from '../domain/events.js';
import { findEventBySlug, type EventRow } from '../domain/read.js';
import { readPublicSiteSettings } from '../domain/tenant-settings.js';
import { LEGACY_TENANT_SLUG } from '../lib/host.js';
import { readSession } from '../lib/session.js';

export class AvatarEventNotFoundError extends Error {
  constructor() {
    super('event_not_found');
    this.name = 'AvatarEventNotFoundError';
  }
}

export interface VisitorDecision {
  visitor: AvatarVisitor;
  eventTitle?: string;
  siteName?: string;
}

interface EventTenantRow {
  tenant_id: string | null;
  visibility: 'public' | 'private' | null;
}

async function siteNameForTenant(pool: Pool, tenantId: string): Promise<string | undefined> {
  const { rows } = await pool.query<{ display_name: string }>(
    'SELECT display_name FROM tenant_settings WHERE tenant_id = $1 LIMIT 1',
    [tenantId],
  );
  return rows[0]?.display_name;
}

/** NAP-F2-D3: el legado usa el displayName de sus ajustes; si no existe, el nombre del producto. */
async function legacySiteName(pool: Pool): Promise<string> {
  try {
    return (await readPublicSiteSettings(pool, LEGACY_TENANT_SLUG)).displayName;
  } catch {
    return 'Somos Panas';
  }
}

async function eventForGuest(
  pool: Pool,
  config: Config,
  req: FastifyRequest,
  eventSlug: string,
): Promise<{ event: EventRow; siteName?: string }> {
  const session = await readSession(pool, config, req);
  const gate = await resolveEventPortalGate(pool, req, session?.id ?? null);

  let event: EventRow | null;
  try {
    // NAP-F2-D2: mismo cerrojo SP7-D-1 que `GET /api/events/:slug` en raíz/legado.
    event = await findEventBySlug(pool, eventSlug, gate);
  } catch {
    throw new AvatarEventNotFoundError();
  }
  if (!event) throw new AvatarEventNotFoundError();

  const { rows } = await pool.query<EventTenantRow>(
    'SELECT tenant_id, visibility FROM events WHERE id = $1 LIMIT 1',
    [event.id],
  );
  const tenant = rows[0];

  // En el subdominio del grupo, el evento debe ser de ese tenant (si no, no existe para la avatar).
  const host = req.hostClassification;
  if (host?.kind === 'site') {
    const hostTenantId = host.slug ? await tenantIdForSlug(pool, host.slug) : null;
    if (!hostTenantId || tenant?.tenant_id !== hostTenantId) throw new AvatarEventNotFoundError();
  }

  try {
    // Mismo control que la página: código de acceso, desbloqueo de sesión o clave de admin.
    await assertPrivateAccess(pool, event, session?.id ?? null, presentedAdminKey(req));
    assertActive(event);
  } catch {
    throw new AvatarEventNotFoundError();
  }

  const siteName = tenant?.tenant_id
    ? await siteNameForTenant(pool, tenant.tenant_id)
    : host?.kind === 'legacy'
      ? await legacySiteName(pool)
      : 'Somos Panas';
  return { event, siteName };
}

/**
 * Orden: admin del sitio -> creator; evento con clave de organizador en legado -> creator;
 * eventSlug -> guest validado; raíz o legado con intent=create -> creator; resto public.
 */
export async function decideAvatarVisitor(
  pool: Pool,
  config: Config,
  req: FastifyRequest,
  body: { lang: AvatarLang; intent?: 'create'; eventSlug?: string },
): Promise<VisitorDecision> {
  const host = req.hostClassification;
  if (host?.kind === 'site' && host.slug) {
    const { user } = await currentAccount(pool, config, req);
    if (user) {
      const tenantId = await tenantIdForSlug(pool, host.slug);
      if (tenantId && (await membershipRoleForUser(pool, tenantId, user.id)) === 'admin') {
        let siteName: string | undefined;
        try {
          siteName = (await readPublicSiteSettings(pool, host.slug)).displayName;
        } catch {
          siteName = host.slug;
        }
        return { visitor: 'creator', siteName };
      }
    }
  }

  if (body.eventSlug) {
    const { event, siteName } = await eventForGuest(pool, config, req, body.eventSlug);
    // NAP-F4s-D3: la clave del panel del organizador abre el recorrido de creador en el legado.
    // Una clave inválida no cambia la decisión ni revela nada: sigue como invitado.
    if (host?.kind === 'legacy') {
      const adminKey = presentedAdminKey(req);
      if (adminKey) {
        try {
          assertAdminKey(event, adminKey);
          return { visitor: 'creator', eventTitle: event.title, siteName };
        } catch {
          // Clave incorrecta: se ignora y el evento se trata como invitado.
        }
      }
    }
    return { visitor: 'guest', eventTitle: event.title, siteName };
  }

  if (host?.kind === 'root' && body.intent === 'create') {
    return { visitor: 'creator', siteName: 'Somos Panas' };
  }

  // NAP-F4s-D3: en el legado, crear una reunión usa el recorrido de creador.
  if (host?.kind === 'legacy' && body.intent === 'create') {
    return { visitor: 'creator', siteName: await legacySiteName(pool) };
  }

  if (host?.kind === 'site' && host.slug) {
    try {
      return { visitor: 'public', siteName: (await readPublicSiteSettings(pool, host.slug)).displayName };
    } catch {
      return { visitor: 'public', siteName: host.slug };
    }
  }
  if (host?.kind === 'legacy') return { visitor: 'public', siteName: await legacySiteName(pool) };
  return { visitor: 'public', siteName: 'Somos Panas' };
}
