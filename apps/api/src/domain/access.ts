/**
 * Cerrojos de acceso a eventos y membresías de sitio Somos Panas (SP-4 en lo de tenants).
 * Depende de `events`, `tenants`, `memberships` y cabeceras legadas de organizador.
 */
import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from '../db/pool.js';
import { forbidden, gone, notFound } from '../errors.js';
import type { HostKind } from '../lib/host.js';
import { sha256 } from '../lib/ids.js';
import type { EventRow, Queryable } from './read.js';

const DUMMY_DIGEST = sha256('fiestapay-unused-digest-v1');
const ADMIN_HEADER = 'x-fiesta-admin-key';

const asBuffer = (value: Uint8Array | null | undefined): Buffer | null => {
  if (!value) return null;
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
};

/**
 * Compares sha256(presented) with the stored digest. Both sides are fixed-length hashes,
 * so timingSafeEqual does not leak the secret. A missing or malformed secret still runs a compare.
 */
export function digestMatches(stored: Uint8Array | null | undefined, presented: string | null | undefined): boolean {
  const usable = typeof presented === 'string' && presented.length > 0 && presented.length <= 200;
  const digest = usable ? sha256(presented) : DUMMY_DIGEST;
  const storedBuf = asBuffer(stored);
  const expected = storedBuf && storedBuf.length === digest.length ? storedBuf : DUMMY_DIGEST;
  const equal = timingSafeEqual(digest, expected);
  return Boolean(storedBuf && storedBuf.length === digest.length && usable && equal);
}

export function presentedAdminKey(req: FastifyRequest): string | null {
  const raw = req.headers[ADMIN_HEADER];
  return typeof raw === 'string' ? raw : null;
}

export function assertAdminKey(event: EventRow, presented: string | null): void {
  if (!digestMatches(event.admin_key_hash, presented)) {
    throw forbidden('Clave de organizador invalida');
  }
}

export async function isUnlocked(db: Queryable, eventId: string, sessionId: string): Promise<boolean> {
  const { rows } = await db.query<{ ok: number }>(
    'SELECT 1 AS ok FROM event_unlocks WHERE event_id = $1 AND session_id = $2',
    [eventId, sessionId],
  );
  return rows.length > 0;
}

/**
 * Private events reveal nothing until this session unlocked them, or the request carries a valid
 * admin key. Does not decide retention: money reconciliation still runs after a tombstone.
 */
export async function assertPrivateAccess(
  db: Queryable,
  event: EventRow,
  sessionId: string | null,
  presentedKey: string | null,
): Promise<void> {
  if (!event.access_code_hash) return;
  if (digestMatches(event.admin_key_hash, presentedKey)) return;
  if (sessionId && (await isUnlocked(db, event.id, sessionId))) return;
  throw forbidden('Codigo de acceso requerido');
}

/** Purged events are gone for everyone, including a valid key (callers map that to 410). */
export async function assertParticipant(
  db: Queryable,
  event: EventRow,
  sessionId: string | null,
  presentedKey: string | null,
): Promise<void> {
  if (event.purged_at) throw gone('Este evento ya no esta disponible');
  await assertPrivateAccess(db, event, sessionId, presentedKey);
}

/** Drops every browser proof for this event. Called when the code changes or is cleared. */
export async function revokeUnlocks(db: Pool | PoolClient, eventId: string): Promise<void> {
  await db.query('DELETE FROM event_unlocks WHERE event_id = $1', [eventId]);
}

export async function rememberUnlock(db: Pool | PoolClient, eventId: string, sessionId: string): Promise<void> {
  await db.query(
    `INSERT INTO event_unlocks (event_id, session_id) VALUES ($1, $2)
     ON CONFLICT (event_id, session_id) DO NOTHING`,
    [eventId, sessionId],
  );
}

export type TenantMembershipRole = 'admin' | 'member';

/**
 * Resuelve el id del sitio por slug de subdominio.
 * Entrada: slug del host clasificado como `site`.
 * Salida: uuid del tenant o null si no existe fila.
 */
export async function tenantIdForSlug(db: Queryable, slug: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>('SELECT id FROM tenants WHERE slug = $1 LIMIT 1', [slug]);
  return rows[0]?.id ?? null;
}

/**
 * Devuelve el rol del usuario en el sitio, si tiene membresía.
 * Entrada: ids de tenant y usuario.
 * Salida: rol o null.
 */
export async function membershipRoleForUser(
  db: Queryable,
  tenantId: string,
  userId: string,
): Promise<TenantMembershipRole | null> {
  const { rows } = await db.query<{ role: TenantMembershipRole }>(
    `SELECT role FROM memberships WHERE tenant_id = $1 AND user_id = $2`,
    [tenantId, userId],
  );
  return rows[0]?.role ?? null;
}

/**
 * Exige que el usuario sea admin del sitio indicado (403 si no).
 * Entrada: tenant, usuario autenticado.
 */
export async function assertTenantAdmin(db: Queryable, tenantId: string, userId: string): Promise<void> {
  const role = await membershipRoleForUser(db, tenantId, userId);
  if (role !== 'admin') throw forbidden('No autorizado');
}

/**
 * Lee un evento privado del sitio si el usuario es admin de ese tenant (403 si es otro sitio o sin rol).
 * Entrada: slug del evento y contexto de host/usuario.
 * Salida: fila del evento.
 */
interface SiteEventGateRow {
  id: string;
  slug: string;
  title: string;
  tenant_id: string;
  visibility: 'private' | 'public';
  purged_at: Date | null;
}

/** Contexto del request HTTP para aplicar el cerrojo de eventos de grupo en raíz/legado (SP7-D-1). */
export interface EventPortalGate {
  hostKind: HostKind | undefined;
  accountUserId: string | null;
}

/**
 * Arma el cerrojo a partir del host clasificado y la sesión cookie actual.
 * Entrada: request Fastify y id de sesión si existe.
 * Salida: contexto para `getEventBySlug` / `findEventBySlug`.
 */
export async function resolveEventPortalGate(
  db: Queryable,
  req: FastifyRequest,
  sessionId: string | null,
): Promise<EventPortalGate> {
  let accountUserId: string | null = null;
  if (sessionId) {
    const { rows } = await db.query<{ user_id: string | null }>(
      'SELECT user_id FROM sessions WHERE id = $1',
      [sessionId],
    );
    accountUserId = rows[0]?.user_id ?? null;
  }
  return {
    hostKind: req.hostClassification?.kind,
    accountUserId,
  };
}

/**
 * SP7-D-1 / SP7-D-2 / SP7-D-3: indica si en raíz o legado un evento private de un grupo
 * (distinto del sitio legado) quedaría oculto para esta cuenta. No lanza.
 * Entrada: slug del evento, clase de host y usuario de cuenta si la sesión está enlazada.
 * Salida: boolean. true si hay que responder como slug inexistente; false si puede seguir
 * (público, legado, otro host, o admin del propio sitio).
 */
export async function groupPrivateEventHiddenOnPortal(
  db: Queryable,
  eventSlug: string,
  hostKind: HostKind | undefined,
  accountUserId: string | null,
): Promise<boolean> {
  if (hostKind !== 'root' && hostKind !== 'legacy') return false;
  const { rows } = await db.query<{ tenant_kind: string; tenant_id: string; visibility: 'private' | 'public' }>(
    `SELECT t.kind AS tenant_kind, e.tenant_id, e.visibility
       FROM events e
       JOIN tenants t ON t.id = e.tenant_id
      WHERE e.slug = $1 LIMIT 1`,
    [eventSlug],
  );
  const row = rows[0];
  if (!row || row.tenant_kind === 'legacy') return false;
  if (row.visibility !== 'private') return false;
  if (!accountUserId) return true;
  const role = await membershipRoleForUser(db, row.tenant_id, accountUserId);
  return role !== 'admin';
}

/**
 * En raíz o legado, un evento privado de un sitio que no es FiestaPay no se expone
 * salvo al admin de ese sitio (SP7-D-1); misma respuesta que slug inexistente (404).
 * Entrada: slug del evento, clase de host y usuario de cuenta si la sesión está enlazada.
 * Salida: void, o HttpError 404 «Evento no encontrado».
 */
export async function assertGroupPrivateEventOnPortalHost(
  db: Queryable,
  eventSlug: string,
  hostKind: HostKind | undefined,
  accountUserId: string | null,
): Promise<void> {
  if (await groupPrivateEventHiddenOnPortal(db, eventSlug, hostKind, accountUserId)) {
    throw notFound('Evento no encontrado');
  }
}

export async function readPrivateEventForSiteAdmin(
  db: Queryable,
  hostSlug: string,
  userId: string,
  eventSlug: string,
): Promise<SiteEventGateRow> {
  const tenantId = await tenantIdForSlug(db, hostSlug);
  if (!tenantId) throw notFound('Ruta no encontrada');
  const role = await membershipRoleForUser(db, tenantId, userId);
  if (role !== 'admin') throw forbidden('No autorizado');

  const { rows } = await db.query<SiteEventGateRow>(
    `SELECT id, slug, title, tenant_id, visibility, purged_at FROM events WHERE slug = $1 LIMIT 1`,
    [eventSlug],
  );
  const event = rows[0];
  if (!event || event.purged_at) throw notFound('Evento no encontrado');
  if (event.tenant_id !== tenantId) throw forbidden('No autorizado');
  if (event.visibility !== 'private') throw forbidden('No autorizado');
  return event;
}
