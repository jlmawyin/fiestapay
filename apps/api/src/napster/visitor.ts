/**
 * Decide en el servidor el tipo de visitante de la avatar (NAP-F2).
 * Depende de la clasificación de `Host`, la sesión de cuenta y los cerrojos de `access.ts`.
 * El navegador no puede elegir `visitor`; un evento privado de grupo se trata como inexistente.
 */
import type { FastifyRequest } from 'fastify';
import type { AvatarLang, AvatarVisitor } from '@fiestapay/shared';
import type { Config } from '../config.js';
import type { Pool } from '../db/pool.js';
import { currentAccount } from '../domain/accounts.js';
import { assertPrivateAccess, membershipRoleForUser, presentedAdminKey, tenantIdForSlug } from '../domain/access.js';
import { assertActive } from '../domain/events.js';
import { findEventBySlug, type EventRow } from '../domain/read.js';
import { readPublicSiteSettings } from '../domain/tenant-settings.js';
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

async function eventForGuest(
  pool: Pool,
  config: Config,
  req: FastifyRequest,
  eventSlug: string,
): Promise<{ event: EventRow; siteName?: string }> {
  const event = await findEventBySlug(pool, eventSlug);
  if (!event) throw new AvatarEventNotFoundError();

  const { rows } = await pool.query<EventTenantRow>(
    'SELECT tenant_id, visibility FROM events WHERE id = $1 LIMIT 1',
    [event.id],
  );
  const tenant = rows[0];
  // NAP-F2: un evento privado de grupo no revela ni el título; se responde como inexistente.
  if (tenant?.tenant_id && tenant.visibility === 'private') throw new AvatarEventNotFoundError();

  try {
    if (!tenant?.tenant_id) {
      const session = await readSession(pool, config, req);
      await assertPrivateAccess(pool, event, session?.id ?? null, presentedAdminKey(req));
    }
    assertActive(event);
  } catch {
    throw new AvatarEventNotFoundError();
  }

  return {
    event,
    siteName: tenant?.tenant_id ? await siteNameForTenant(pool, tenant.tenant_id) : 'Fiestapay',
  };
}

/**
 * Orden: admin del sitio -> creator; eventSlug -> guest validado; raíz con intent=create -> creator;
 * resto public. En el host legado, fuera de un evento, el visitante es public.
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
    return { visitor: 'guest', eventTitle: event.title, siteName };
  }

  if (host?.kind === 'root' && body.intent === 'create') {
    return { visitor: 'creator', siteName: 'Somos Panas' };
  }

  return { visitor: 'public', siteName: host?.kind === 'site' && host.slug ? host.slug : 'Somos Panas' };
}
