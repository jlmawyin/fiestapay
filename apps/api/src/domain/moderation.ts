import type {
  ChatTranscript,
  ChatTranscriptMessage,
  ModerationConversation,
  ModerationGuest,
  ModerationMessage,
  ModerationMessagePage,
} from '@fiestapay/shared';
import { visibleText, type HistoryRole, type StoredPart } from '../ai/history.js';
import { openaiTextOf } from '../ai/openai.js';
import { withTransaction, type Pool, type PoolClient } from '../db/pool.js';
import { HttpError, conflict, notFound } from '../errors.js';
import { newId } from '../lib/ids.js';
import { assertAdminKey, assertPrivateAccess } from './access.js';
import { audit } from './audit.js';
import {
  GUEST_COLUMNS,
  findEventBySlug,
  guestPaidCents,
  lockEvent,
  toGuestWithPrice,
  type EventRow,
  type GuestRow,
  type Queryable,
} from './read.js';

export const REVOKED_MESSAGE = 'El organizador revoco el acceso de esta sesion';
export const INTERRUPTED_MESSAGE = 'La conversacion fue moderada y esa respuesta no se guardo';
export const PENDING_MESSAGE =
  'El pago esta en verificacion. La reserva se mantiene hasta que se concilie. Puedes bloquear ahora y reintentar la retirada cuando el pago quede cerrado.';
export const REMOVED_PAID_MESSAGE =
  'Asistencia retirada. El dinero ya capturado no se reembolsa automaticamente; el excedente queda para una conciliacion humana.';
export const REMOVED_MESSAGE = 'Asistencia retirada. No se movio ningun pago.';
export const UNBLOCK_REMOVED_MESSAGE = 'La retirada no se deshace al desbloquear. El acceso sigue revocado.';

/** 403 that an in-flight model round must not swallow into a stored tool answer. */
export class ModerationHold extends HttpError {
  constructor(message: string = REVOKED_MESSAGE) {
    super(403, message);
    this.name = 'ModerationHold';
  }
}

/** Visible user or assistant text. Tool calls, outputs and signatures are dropped. */
export function transcriptPartsText(role: HistoryRole, parts: StoredPart[]): string | null {
  if (role === 'function') return null;
  const plain = visibleText(parts);
  if (plain.length > 0) return plain;
  if (role !== 'model') return null;
  const text = openaiTextOf(parts.flatMap((part) => (part.openai ? [part.openai] : [])));
  return text.length > 0 ? text : null;
}

export function guestAccessRevoked(
  guest: { blocked_at?: Date | null; removed_at?: Date | null } | null | undefined,
): boolean {
  return Boolean(guest && (guest.blocked_at || guest.removed_at));
}

interface ScopeRow {
  public_id: string;
  revision: string;
  blocked_at: Date | null;
  session_id?: string;
}

async function requireEvent(pool: Pool, slug: string, presentedKey: string | null): Promise<EventRow> {
  const event = await findEventBySlug(pool, slug);
  if (!event) throw notFound('Evento no encontrado');
  assertAdminKey(event, presentedKey);
  return event;
}

/** Blocks a new join, RSVP, quote, order, chat or voice action. Does not look at money. */
export async function assertSessionMayAct(db: Queryable, eventId: string, sessionId: string): Promise<void> {
  const guest = await db.query<{ blocked_at: Date | null; removed_at: Date | null }>(
    'SELECT blocked_at, removed_at FROM guests WHERE event_id = $1 AND session_id = $2',
    [eventId, sessionId],
  );
  if (guestAccessRevoked(guest.rows[0])) throw new ModerationHold();
  const scope = await db.query<{ blocked_at: Date | null }>(
    'SELECT blocked_at FROM chat_scopes WHERE event_id = $1 AND session_id = $2',
    [eventId, sessionId],
  );
  if (scope.rows[0]?.blocked_at) throw new ModerationHold();
}

async function paymentPending(db: Queryable, guestId: string): Promise<boolean> {
  const { rows } = await db.query<{ pending: boolean }>(
    `SELECT (
        EXISTS (
          SELECT 1 FROM orders
           WHERE guest_id = $1 AND status IN ('intent', 'capturing')
        )
        OR EXISTS (
          SELECT 1 FROM funding_refund_tasks
           WHERE guest_id = $1 AND status IN ('leased', 'pending_provider')
        )
      ) AS pending`,
    [guestId],
  );
  return Boolean(rows[0]?.pending);
}

async function toModerationGuest(db: Queryable, row: GuestRow, priceCents: number): Promise<ModerationGuest> {
  const paid = await guestPaidCents(db, row.id);
  const guest = toGuestWithPrice(row, priceCents, paid);
  return {
    id: guest.id,
    name: guest.name,
    status: guest.status,
    companions: guest.companions,
    paidCents: guest.paidCents,
    dueCents: guest.dueCents,
    blockedAt: row.blocked_at ? row.blocked_at.toISOString() : null,
    removedAt: row.removed_at ? row.removed_at.toISOString() : null,
    paymentPending: await paymentPending(db, row.id),
  };
}

async function lockGuestInEvent(client: PoolClient, eventId: string, guestId: string): Promise<GuestRow> {
  const { rows } = await client.query<GuestRow>(
    `SELECT ${GUEST_COLUMNS} FROM guests WHERE id = $1 AND event_id = $2 FOR UPDATE`,
    [guestId, eventId],
  );
  const row = rows[0];
  if (!row) throw notFound('Invitado no encontrado');
  return row;
}

async function lockScope(client: PoolClient, eventId: string, sessionId: string): Promise<ScopeRow> {
  await client.query(
    `INSERT INTO chat_scopes (event_id, session_id, public_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (event_id, session_id) DO NOTHING`,
    [eventId, sessionId, newId()],
  );
  const { rows } = await client.query<ScopeRow>(
    `SELECT public_id, revision::text AS revision, blocked_at
       FROM chat_scopes
      WHERE event_id = $1 AND session_id = $2
      FOR UPDATE`,
    [eventId, sessionId],
  );
  const row = rows[0];
  if (!row) throw notFound('Conversacion no encontrada');
  return row;
}

async function markScopeBlocked(client: PoolClient, eventId: string, sessionId: string, blocked: boolean): Promise<void> {
  const scope = await lockScope(client, eventId, sessionId);
  if (blocked) {
    if (!scope.blocked_at) {
      await client.query(
        'UPDATE chat_scopes SET blocked_at = now() WHERE event_id = $1 AND session_id = $2',
        [eventId, sessionId],
      );
    }
    return;
  }
  await client.query(
    'UPDATE chat_scopes SET blocked_at = NULL WHERE event_id = $1 AND session_id = $2',
    [eventId, sessionId],
  );
}

export async function listModerationGuests(
  pool: Pool,
  slug: string,
  presentedKey: string | null,
): Promise<{ guests: ModerationGuest[] }> {
  const event = await requireEvent(pool, slug, presentedKey);
  const { rows } = await pool.query<GuestRow>(
    `SELECT ${GUEST_COLUMNS} FROM guests WHERE event_id = $1 ORDER BY created_at ASC, id ASC`,
    [event.id],
  );
  const guests: ModerationGuest[] = [];
  for (const row of rows) guests.push(await toModerationGuest(pool, row, event.price_cents));
  return { guests };
}

export async function blockGuest(
  pool: Pool,
  slug: string,
  guestId: string,
  presentedKey: string | null,
): Promise<{ outcome: 'blocked'; guest: ModerationGuest; message: string }> {
  const event = await requireEvent(pool, slug, presentedKey);
  return withTransaction(pool, async (client) => {
    await lockEvent(client, event.id);
    const guest = await lockGuestInEvent(client, event.id, guestId);
    const already = guest.blocked_at !== null && guest.blocked_at !== undefined;
    if (!already) {
      await client.query('UPDATE guests SET blocked_at = now() WHERE id = $1', [guest.id]);
      await audit(client, event.id, 'guest_blocked');
    }
    await markScopeBlocked(client, event.id, guest.session_id, true);
    const fresh = await lockGuestInEvent(client, event.id, guestId);
    return {
      outcome: 'blocked' as const,
      guest: await toModerationGuest(client, fresh, event.price_cents),
      message: already
        ? 'El acceso ya estaba revocado. La asistencia y los pagos no cambiaron.'
        : 'Acceso revocado. La asistencia y los pagos no cambiaron.',
    };
  });
}

export async function unblockGuest(
  pool: Pool,
  slug: string,
  guestId: string,
  presentedKey: string | null,
): Promise<{ outcome: 'unblocked'; guest: ModerationGuest; message: string }> {
  const event = await requireEvent(pool, slug, presentedKey);
  return withTransaction(pool, async (client) => {
    await lockEvent(client, event.id);
    const guest = await lockGuestInEvent(client, event.id, guestId);
    if (guest.removed_at) throw conflict(UNBLOCK_REMOVED_MESSAGE);
    if (guest.blocked_at) {
      await client.query('UPDATE guests SET blocked_at = NULL WHERE id = $1', [guest.id]);
      await audit(client, event.id, 'guest_unblocked');
    }
    await markScopeBlocked(client, event.id, guest.session_id, false);
    const fresh = await lockGuestInEvent(client, event.id, guestId);
    return {
      outcome: 'unblocked' as const,
      guest: await toModerationGuest(client, fresh, event.price_cents),
      message: 'Acceso restaurado. Un navegador nuevo sigue siendo otra sesion.',
    };
  });
}

export type RemoveGuestResult =
  | { ok: true; outcome: 'removed'; guest: ModerationGuest; message: string }
  | { ok: false; code: 'payment_pending'; blockAvailable: true; guest: ModerationGuest; message: string };

/**
 * Logical removal. Uncertain create (`intent`), capture (`capturing`) and refund leases keep
 * the RSVP seat and the open order. Settled removal sets RSVP to no, keeps companions, and
 * supersedes only orders that are not a create or capture in flight.
 */
export async function removeGuest(
  pool: Pool,
  slug: string,
  guestId: string,
  presentedKey: string | null,
): Promise<RemoveGuestResult> {
  const event = await requireEvent(pool, slug, presentedKey);
  return withTransaction(pool, async (client) => {
    await lockEvent(client, event.id);
    const guest = await lockGuestInEvent(client, event.id, guestId);
    if (guest.removed_at && guest.status === 'no') {
      return {
        ok: true as const,
        outcome: 'removed' as const,
        guest: await toModerationGuest(client, guest, event.price_cents),
        message: 'Esta persona ya estaba retirada.',
      };
    }

    const open = await client.query<{ status: string }>(
      `SELECT status FROM orders
        WHERE guest_id = $1 AND status IN ('intent', 'created', 'approved', 'capturing')
        FOR UPDATE`,
      [guest.id],
    );
    const uncertainOrder = open.rows.some((row) => row.status === 'intent' || row.status === 'capturing');
    const lease = await client.query(
      `SELECT 1 FROM funding_refund_tasks
        WHERE guest_id = $1 AND status IN ('leased', 'pending_provider')
        LIMIT 1`,
      [guest.id],
    );
    if (uncertainOrder || lease.rows.length > 0) {
      return {
        ok: false as const,
        code: 'payment_pending' as const,
        blockAvailable: true as const,
        guest: await toModerationGuest(client, guest, event.price_cents),
        message: PENDING_MESSAGE,
      };
    }

    const paid = await guestPaidCents(client, guest.id);
    const { rows } = await client.query<GuestRow>(
      `UPDATE guests
          SET removed_at = COALESCE(removed_at, now()),
              blocked_at = COALESCE(blocked_at, now()),
              status = 'no',
              obligation_version = obligation_version + 1
        WHERE id = $1
        RETURNING ${GUEST_COLUMNS}`,
      [guest.id],
    );
    const updated = rows[0]!;
    await client.query('UPDATE quotes SET invalidated_at = now() WHERE guest_id = $1 AND invalidated_at IS NULL', [
      guest.id,
    ]);
    const superseded = await client.query<{ id: string }>(
      `UPDATE orders SET status = 'superseded', updated_at = now()
        WHERE guest_id = $1 AND status IN ('created', 'approved')
        RETURNING id`,
      [guest.id],
    );
    for (const _order of superseded.rows) await audit(client, event.id, 'order_superseded');
    await markScopeBlocked(client, event.id, guest.session_id, true);
    await audit(client, event.id, 'guest_removed');
    return {
      ok: true as const,
      outcome: 'removed' as const,
      guest: await toModerationGuest(client, updated, event.price_cents),
      message: paid > 0 ? REMOVED_PAID_MESSAGE : REMOVED_MESSAGE,
    };
  });
}

const PAGE_DEFAULT = 30;

function pageLimit(limit: number | undefined): number {
  if (!limit) return PAGE_DEFAULT;
  return Math.min(50, Math.max(1, limit));
}

export async function listConversations(
  pool: Pool,
  slug: string,
  presentedKey: string | null,
): Promise<{ conversations: ModerationConversation[] }> {
  const event = await requireEvent(pool, slug, presentedKey);
  const { rows } = await pool.query<{ public_id: string; guest_id: string | null; guest_name: string | null }>(
    `SELECT s.public_id, g.id AS guest_id, g.name AS guest_name
       FROM chat_scopes s
       LEFT JOIN guests g ON g.event_id = s.event_id AND g.session_id = s.session_id
      WHERE s.event_id = $1
      ORDER BY s.public_id ASC
      LIMIT 100`,
    [event.id],
  );
  return {
    conversations: rows.map((row) => ({
      id: row.public_id,
      guestId: row.guest_id,
      guestName: row.guest_name,
    })),
  };
}

interface MessageRow {
  id: string;
  role: HistoryRole;
  parts: unknown;
  created_at: Date;
}

function visibleMessage(row: MessageRow, conversationId: string | null): (ChatTranscriptMessage & { conversationId?: string }) | null {
  if (row.role !== 'user' && row.role !== 'model') return null;
  const parts = Array.isArray(row.parts) ? (row.parts as StoredPart[]) : [];
  const text = transcriptPartsText(row.role, parts);
  if (!text) return null;
  return {
    id: row.id,
    role: row.role === 'user' ? 'user' : 'assistant',
    text,
    createdAt: row.created_at.toISOString(),
    ...(conversationId ? { conversationId } : {}),
  };
}

async function selectMessages(
  db: Queryable,
  eventId: string,
  sessionId: string,
  limit: number,
  before: string | undefined,
): Promise<MessageRow[]> {
  const { rows } = await db.query<MessageRow>(
    `SELECT id::text AS id, role, parts, created_at
       FROM chat_messages
      WHERE event_id = $1
        AND session_id = $2
        AND deleted_at IS NULL
        AND role IN ('user', 'model')
        AND ($3::bigint IS NULL OR id < $3::bigint)
      ORDER BY id DESC
      LIMIT $4`,
    [eventId, sessionId, before ?? null, limit + 1],
  );
  return rows;
}

function packPage(rows: MessageRow[], limit: number, conversationId: string | null): {
  messages: ChatTranscriptMessage[];
  nextBefore?: string;
} {
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  const nextBefore = more ? page[page.length - 1]?.id : undefined;
  const messages = page
    .reverse()
    .flatMap((row) => {
      const message = visibleMessage(row, conversationId);
      return message ? [message] : [];
    });
  return nextBefore ? { messages, nextBefore } : { messages };
}

export async function listModerationMessages(
  pool: Pool,
  slug: string,
  presentedKey: string | null,
  conversationId: string,
  limit: number | undefined,
  before: string | undefined,
): Promise<ModerationMessagePage> {
  const event = await requireEvent(pool, slug, presentedKey);
  const scope = await pool.query<{ session_id: string }>(
    'SELECT session_id FROM chat_scopes WHERE public_id = $1 AND event_id = $2',
    [conversationId, event.id],
  );
  const sessionId = scope.rows[0]?.session_id;
  if (!sessionId) throw notFound('Conversacion no encontrada');
  const cap = pageLimit(limit);
  const packed = packPage(await selectMessages(pool, event.id, sessionId, cap, before), cap, conversationId);
  return { messages: packed.messages as ModerationMessage[], ...(packed.nextBefore ? { nextBefore: packed.nextBefore } : {}) };
}

export async function listOwnTranscript(
  pool: Pool,
  slug: string,
  sessionId: string | null,
  presentedKey: string | null,
  limit: number | undefined,
  before: string | undefined,
): Promise<ChatTranscript> {
  if (!sessionId) return { messages: [] };
  const event = await findEventBySlug(pool, slug);
  if (!event) throw notFound('Evento no encontrado');
  await assertPrivateAccess(pool, event, sessionId, presentedKey);
  const cap = pageLimit(limit);
  const packed = packPage(await selectMessages(pool, event.id, sessionId, cap, before), cap, null);
  return { messages: packed.messages, ...(packed.nextBefore ? { nextBefore: packed.nextBefore } : {}) };
}

export async function deleteChatMessage(
  pool: Pool,
  slug: string,
  messageId: string,
  presentedKey: string | null,
): Promise<{ ok: true; id: string; alreadyDeleted: boolean }> {
  const event = await requireEvent(pool, slug, presentedKey);
  return withTransaction(pool, async (client) => {
    const found = await client.query<{ id: string; event_id: string; session_id: string; role: HistoryRole; deleted_at: Date | null }>(
      `SELECT id::text AS id, event_id, session_id, role, deleted_at
         FROM chat_messages WHERE id = $1::bigint FOR UPDATE`,
      [messageId],
    );
    const message = found.rows[0];
    if (!message || message.event_id !== event.id) throw notFound('Mensaje no encontrado');
    await lockScope(client, event.id, message.session_id);
    if (message.deleted_at) return { ok: true as const, id: message.id, alreadyDeleted: true };

    await client.query('UPDATE chat_messages SET deleted_at = now() WHERE id = $1::bigint', [message.id]);
    if (message.role === 'model') {
      // The next stored turn is the tool output only when this model turn asked for tools.
      // Dropping it here stops a later replay from pairing an orphan function_call_output.
      await client.query(
        `UPDATE chat_messages
            SET deleted_at = now()
          WHERE id = (
            SELECT id FROM chat_messages
             WHERE event_id = $1 AND session_id = $2 AND id > $3::bigint
             ORDER BY id ASC
             LIMIT 1
          )
            AND role = 'function'
            AND deleted_at IS NULL`,
        [event.id, message.session_id, message.id],
      );
    }
    await client.query(
      'UPDATE chat_scopes SET revision = revision + 1 WHERE event_id = $1 AND session_id = $2',
      [event.id, message.session_id],
    );
    await audit(client, event.id, 'chat_message_deleted');
    return { ok: true as const, id: message.id, alreadyDeleted: false };
  });
}

export async function blockConversation(
  pool: Pool,
  slug: string,
  conversationId: string,
  presentedKey: string | null,
): Promise<{ outcome: 'blocked'; conversationId: string; message: string }> {
  const event = await requireEvent(pool, slug, presentedKey);
  return withTransaction(pool, async (client) => {
    await lockEvent(client, event.id);
    const scope = await client.query<{ session_id: string; blocked_at: Date | null }>(
      'SELECT session_id, blocked_at FROM chat_scopes WHERE public_id = $1 AND event_id = $2 FOR UPDATE',
      [conversationId, event.id],
    );
    const sessionId = scope.rows[0]?.session_id;
    if (!sessionId) throw notFound('Conversacion no encontrada');
    const scopeWasBlocked = Boolean(scope.rows[0]?.blocked_at);
    await client.query('UPDATE chat_scopes SET blocked_at = COALESCE(blocked_at, now()) WHERE event_id = $1 AND session_id = $2', [
      event.id,
      sessionId,
    ]);
    const guest = await client.query<{ id: string; blocked_at: Date | null }>(
      `SELECT id, blocked_at FROM guests WHERE event_id = $1 AND session_id = $2 FOR UPDATE`,
      [event.id, sessionId],
    );
    const row = guest.rows[0];
    if (row && !row.blocked_at) {
      await client.query('UPDATE guests SET blocked_at = now() WHERE id = $1', [row.id]);
    }
    if (!row?.blocked_at && !scopeWasBlocked) await audit(client, event.id, 'guest_blocked');
    return {
      outcome: 'blocked' as const,
      conversationId,
      message: 'Esa sesion ya no puede unirse, escribir ni iniciar voz. No identifica a la persona en otro navegador.',
    };
  });
}

export async function unblockConversation(
  pool: Pool,
  slug: string,
  conversationId: string,
  presentedKey: string | null,
): Promise<{ outcome: 'unblocked'; conversationId: string; message: string }> {
  const event = await requireEvent(pool, slug, presentedKey);
  return withTransaction(pool, async (client) => {
    await lockEvent(client, event.id);
    const scope = await client.query<{ session_id: string }>(
      'SELECT session_id FROM chat_scopes WHERE public_id = $1 AND event_id = $2 FOR UPDATE',
      [conversationId, event.id],
    );
    const sessionId = scope.rows[0]?.session_id;
    if (!sessionId) throw notFound('Conversacion no encontrada');
    const guest = await client.query<{ id: string; removed_at: Date | null }>(
      'SELECT id, removed_at FROM guests WHERE event_id = $1 AND session_id = $2 FOR UPDATE',
      [event.id, sessionId],
    );
    if (guest.rows[0]?.removed_at) throw conflict(UNBLOCK_REMOVED_MESSAGE);
    await client.query('UPDATE chat_scopes SET blocked_at = NULL WHERE event_id = $1 AND session_id = $2', [
      event.id,
      sessionId,
    ]);
    if (guest.rows[0]) {
      await client.query('UPDATE guests SET blocked_at = NULL WHERE id = $1', [guest.rows[0].id]);
      await audit(client, event.id, 'guest_unblocked');
    }
    return {
      outcome: 'unblocked' as const,
      conversationId,
      message: 'Sesion desbloqueada.',
    };
  });
}

/**
 * Stores one chat turn under the scope lock. A model or tool turn is refused when the
 * revision captured at the user turn has moved, or when the session was blocked.
 * The caller keeps provider HTTP outside this transaction.
 */
export async function appendChatTurn(
  pool: Pool,
  eventId: string,
  sessionId: string,
  role: HistoryRole,
  parts: StoredPart[],
  expectedRevision?: string,
): Promise<{ id: string; revision: string }> {
  return withTransaction(pool, async (client) => {
    const scope = await lockScope(client, eventId, sessionId);
    if (scope.blocked_at) throw new ModerationHold();
    const guest = await client.query<{ blocked_at: Date | null; removed_at: Date | null }>(
      'SELECT blocked_at, removed_at FROM guests WHERE event_id = $1 AND session_id = $2',
      [eventId, sessionId],
    );
    if (guestAccessRevoked(guest.rows[0])) throw new ModerationHold();
    if (expectedRevision !== undefined && scope.revision !== expectedRevision) {
      throw new ModerationHold(INTERRUPTED_MESSAGE);
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO chat_messages (event_id, session_id, role, parts)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id::text AS id`,
      [eventId, sessionId, role, JSON.stringify(parts)],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw notFound('Mensaje no encontrado');
    return { id, revision: scope.revision };
  });
}

export async function assertChatRevision(
  db: Queryable,
  eventId: string,
  sessionId: string,
  expectedRevision: string,
): Promise<void> {
  await assertSessionMayAct(db, eventId, sessionId);
  const { rows } = await db.query<{ revision: string }>(
    'SELECT revision::text AS revision FROM chat_scopes WHERE event_id = $1 AND session_id = $2',
    [eventId, sessionId],
  );
  if (rows[0]?.revision !== expectedRevision) throw new ModerationHold(INTERRUPTED_MESSAGE);
}
