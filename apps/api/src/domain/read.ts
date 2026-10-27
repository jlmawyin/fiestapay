import type { AgendaItem, FiestaEvent, FundingStatus, Guest, RefundSummary, RsvpStatus, TemplateKind } from '@fiestapay/shared';
import { sumToCents, type Pool, type PoolClient } from '../db/pool.js';
import { notFound } from '../errors.js';

export type Queryable = Pool | PoolClient;

export interface EventRow {
  id: string;
  slug: string;
  organizer_session_id: string;
  generation: number;
  archived: boolean;
  title: string;
  template: TemplateKind;
  meal: 'desayuno' | 'almuerzo' | 'cena';
  description: string;
  starts_at: Date;
  location: string;
  includes: unknown;
  agenda: unknown;
  price_cents: number;
  capacity: number | null;
  goal_cents: number | null;
  minimum_cents: number | null;
  confirmed: boolean;
  created_at: Date;
  ends_at: Date;
  closed_at: Date | null;
  purged_at: Date | null;
  is_demo: boolean;
  admin_key_hash: Buffer | null;
  access_code_hash: Buffer | null;
  funding_deadline_at: Date | null;
  funding_status: FundingStatus;
  funding_decided_at: Date | null;
  funding_basis_cents: number | null;
}

export interface GuestRow {
  id: string;
  event_id: string;
  session_id: string;
  name: string;
  status: RsvpStatus;
  companions: number;
  obligation_version: number;
  /** Present when the row was loaded with GUEST_COLUMNS. Dashboard SQL that omits them leaves these unset. */
  blocked_at?: Date | null;
  removed_at?: Date | null;
}

export const EVENT_COLUMNS = `id, slug, organizer_session_id, generation, archived, title, template, meal,
  description, starts_at, location, includes, agenda, price_cents, capacity, goal_cents, minimum_cents,
  confirmed, created_at, ends_at, closed_at, purged_at, is_demo, admin_key_hash, access_code_hash,
  funding_deadline_at, funding_status, funding_decided_at, funding_basis_cents`;

export const GUEST_COLUMNS =
  'id, event_id, session_id, name, status, companions, obligation_version, blocked_at, removed_at';

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

const asAgenda = (value: unknown): AgendaItem[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AgendaItem[] => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record.time !== 'string' || typeof record.title !== 'string') return [];
    return [
      {
        time: record.time,
        title: record.title,
        ...(typeof record.speaker === 'string' ? { speaker: record.speaker } : {}),
      },
    ];
  });
};

export async function findEventById(db: Queryable, eventId: string): Promise<EventRow | null> {
  const { rows } = await db.query<EventRow>(`SELECT ${EVENT_COLUMNS} FROM events WHERE id = $1`, [eventId]);
  return rows[0] ?? null;
}

export async function findEventBySlug(db: Queryable, slug: string): Promise<EventRow | null> {
  const { rows } = await db.query<EventRow>(`SELECT ${EVENT_COLUMNS} FROM events WHERE slug = $1`, [slug]);
  return rows[0] ?? null;
}

export async function getEventBySlug(db: Queryable, slug: string): Promise<EventRow> {
  const row = await findEventBySlug(db, slug);
  if (!row) throw notFound('Evento no encontrado');
  return row;
}

/** Locks the event row: every money or capacity mutation serializes behind this. */
export async function lockEvent(client: PoolClient, eventId: string): Promise<EventRow> {
  const { rows } = await client.query<EventRow>(`SELECT ${EVENT_COLUMNS} FROM events WHERE id = $1 FOR UPDATE`, [
    eventId,
  ]);
  const row = rows[0];
  if (!row) throw notFound('Evento no encontrado');
  return row;
}

export interface EventTotals {
  /** Verified captures minus refunds, in cents. Gross, before PayPal fees. */
  collectedCents: number;
  confirmedPeople: number;
  /**
   * Holders plus companions only when verified net covers price times that full party.
   * A partial remainder counts as zero people. Independent of RSVP.
   */
  paidPeople: number;
  refundSummary: RefundSummary;
}

export async function eventTotals(db: Queryable, eventId: string): Promise<EventTotals> {
  const { rows } = await db.query<{
    collected: string | null;
    refunded: string | null;
    people: string | null;
    paid_people: string | null;
    pending: string | null;
    needs_review: string | null;
  }>(
    `SELECT
       (SELECT COALESCE(SUM(CASE WHEN kind = 'capture' THEN amount_cents ELSE -amount_cents END), 0)
          FROM payment_ledger WHERE event_id = $1) AS collected,
       (SELECT COALESCE(SUM(CASE WHEN kind = 'refund' THEN amount_cents ELSE 0 END), 0)
          FROM payment_ledger WHERE event_id = $1) AS refunded,
       (SELECT COALESCE(SUM(1 + companions), 0)
          FROM guests WHERE event_id = $1 AND status = 'yes') AS people,
       (SELECT COALESCE(SUM(1 + g.companions), 0)
          FROM guests g
          JOIN events ev ON ev.id = g.event_id
         WHERE g.event_id = $1
           AND COALESCE((
             SELECT SUM(CASE WHEN l.kind = 'capture' THEN l.amount_cents ELSE -l.amount_cents END)
               FROM payment_ledger l WHERE l.guest_id = g.id
           ), 0) >= ev.price_cents::bigint * (1 + g.companions)) AS paid_people,
       (SELECT COALESCE(SUM(amount_cents) FILTER (WHERE status IN ('pending', 'leased', 'pending_provider')), 0)
          FROM funding_refund_tasks WHERE event_id = $1) AS pending,
       (SELECT COALESCE(SUM(amount_cents) FILTER (WHERE status = 'needs_review'), 0)
          FROM funding_refund_tasks WHERE event_id = $1)
        + (SELECT COALESCE(SUM(amount_cents), 0)
             FROM (
               SELECT DISTINCT ON (capture_id) amount_cents
                 FROM funding_refund_tasks t
                WHERE t.event_id = $1
                  AND t.status = 'rejected'
                  AND NOT EXISTS (
                    SELECT 1 FROM funding_refund_tasks live
                     WHERE live.capture_id = t.capture_id
                       AND live.status IN ('pending', 'leased', 'pending_provider', 'needs_review')
                  )
                ORDER BY capture_id, created_at DESC, id DESC
             ) open_rejected) AS needs_review`,
    [eventId],
  );
  const collectedCents = sumToCents(rows[0]?.collected);
  return {
    collectedCents,
    confirmedPeople: sumToCents(rows[0]?.people),
    paidPeople: sumToCents(rows[0]?.paid_people),
    refundSummary: {
      refundedCents: sumToCents(rows[0]?.refunded),
      pendingCents: sumToCents(rows[0]?.pending),
      needsReviewCents: sumToCents(rows[0]?.needs_review),
      outstandingCents: collectedCents,
    },
  };
}

/** Net verified money for one guest: captures minus refunds. */
export async function guestPaidCents(db: Queryable, guestId: string): Promise<number> {
  const { rows } = await db.query<{ paid: string | null }>(
    `SELECT COALESCE(SUM(CASE WHEN kind = 'capture' THEN amount_cents ELSE -amount_cents END), 0) AS paid
       FROM payment_ledger WHERE guest_id = $1`,
    [guestId],
  );
  return sumToCents(rows[0]?.paid);
}

export const obligationCents = (event: EventRow, guest: GuestRow): number =>
  guest.status === 'yes' ? event.price_cents * (1 + guest.companions) : 0;

export const peopleOf = (guest: GuestRow): number => (guest.status === 'yes' ? 1 + guest.companions : 0);

export function toFiestaEvent(row: EventRow, totals: EventTotals): FiestaEvent {
  const minimumCents = row.minimum_cents;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    template: row.template,
    meal: row.meal,
    description: row.description,
    startsAt: row.starts_at.toISOString(),
    location: row.location,
    includes: asStringArray(row.includes),
    agenda: asAgenda(row.agenda),
    priceCents: row.price_cents,
    capacity: row.capacity,
    goalCents: row.goal_cents,
    minimumCents,
    confirmed: row.confirmed,
    collectedCents: totals.collectedCents,
    confirmedPeople: totals.confirmedPeople,
    minimumReached: minimumCents !== null && totals.collectedCents >= minimumCents,
    createdAt: row.created_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    closed: row.closed_at !== null,
    accessRestricted: row.access_code_hash !== null,
    fundingDeadlineAt: row.funding_deadline_at ? row.funding_deadline_at.toISOString() : null,
    fundingStatus: row.funding_status,
    paidPeople: totals.paidPeople,
    refundSummary: totals.refundSummary,
    fundingBasisCents: row.funding_basis_cents,
  };
}

export async function loadFiestaEvent(db: Queryable, row: EventRow): Promise<FiestaEvent> {
  return toFiestaEvent(row, await eventTotals(db, row.id));
}

export function toGuestWithPrice(row: GuestRow, priceCents: number, paidCents: number): Guest {
  const obligation = row.status === 'yes' ? priceCents * (1 + row.companions) : 0;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    companions: row.companions,
    paidCents,
    // Overpayment (for example after reducing companions) is never auto-refunded: it simply
    // leaves nothing due and waits for human reconciliation.
    dueCents: Math.max(0, obligation - paidCents),
    // Only a real timestamp is published. A loader that did not select the columns must not
    // pretend the guest was checked and found unblocked.
    ...(row.blocked_at ? { blockedAt: row.blocked_at.toISOString() } : {}),
    ...(row.removed_at ? { removedAt: row.removed_at.toISOString() } : {}),
  };
}

export const toGuest = (row: GuestRow, event: EventRow, paidCents: number): Guest =>
  toGuestWithPrice(row, event.price_cents, paidCents);

/** Guest view when only the guest row is at hand (order flows): reads its event price. */
export async function loadGuestByEvent(db: Queryable, row: GuestRow): Promise<Guest> {
  const { rows } = await db.query<{ price_cents: number }>('SELECT price_cents FROM events WHERE id = $1', [
    row.event_id,
  ]);
  const price = rows[0]?.price_cents;
  if (price === undefined) throw notFound('Evento no encontrado');
  return toGuestWithPrice(row, price, await guestPaidCents(db, row.id));
}

export async function loadGuest(db: Queryable, row: GuestRow, event: EventRow): Promise<Guest> {
  return toGuest(row, event, await guestPaidCents(db, row.id));
}

export async function findGuestBySession(
  db: Queryable,
  eventId: string,
  sessionId: string,
): Promise<GuestRow | null> {
  const { rows } = await db.query<GuestRow>(
    `SELECT ${GUEST_COLUMNS} FROM guests WHERE event_id = $1 AND session_id = $2`,
    [eventId, sessionId],
  );
  return rows[0] ?? null;
}

export async function findGuestById(db: Queryable, guestId: string): Promise<GuestRow | null> {
  const { rows } = await db.query<GuestRow>(`SELECT ${GUEST_COLUMNS} FROM guests WHERE id = $1`, [guestId]);
  return rows[0] ?? null;
}

/** Locks a guest row (after its event) so quotes, RSVP and orders cannot interleave. */
export async function lockGuest(client: PoolClient, guestId: string): Promise<GuestRow> {
  const { rows } = await client.query<GuestRow>(`SELECT ${GUEST_COLUMNS} FROM guests WHERE id = $1 FOR UPDATE`, [
    guestId,
  ]);
  const row = rows[0];
  if (!row) throw notFound('Invitado no encontrado');
  return row;
}

/**
 * `capturing` is a durable claim written before the capture request leaves the process: the
 * money is uncertain, so the obligation is frozen until PayPal answers (see migration 0003).
 */
export type OrderStatus =
  | 'intent'
  | 'created'
  | 'approved'
  | 'capturing'
  | 'paid'
  | 'superseded'
  | 'failed';

export interface OrderRow {
  id: string;
  event_id: string;
  guest_id: string;
  quote_id: string;
  obligation_version: number;
  generation: number;
  request_id: string;
  paypal_order_id: string | null;
  amount_cents: number;
  currency: string;
  payee_merchant_id: string;
  status: OrderStatus;
  approve_url: string | null;
  capture_id: string | null;
}

export const ORDER_COLUMNS = `id, event_id, guest_id, quote_id, obligation_version, generation, request_id,
  paypal_order_id, amount_cents, currency, payee_merchant_id, status, approve_url, capture_id`;

/** Mirrors the partial unique index `orders_one_open_per_guest`. */
export const OPEN_ORDER_STATUSES: OrderStatus[] = ['intent', 'created', 'approved', 'capturing'];

/** SQL list form of the open set, so the index and every query agree on one definition. */
export const OPEN_ORDER_SQL = `'intent','created','approved','capturing'`;

/**
 * A capture already handed to PayPal for this guest. While one exists the guest's obligation
 * must not move: superseding it or opening a second order next to it is exactly how one
 * obligation turns into two charges.
 */
export async function findCapturingOrder(client: PoolClient, guestId: string): Promise<OrderRow | null> {
  const { rows } = await client.query<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE guest_id = $1 AND status = 'capturing' LIMIT 1`,
    [guestId],
  );
  return rows[0] ?? null;
}

/**
 * Orders are addressable by the PayPal order id (what the browser holds) or by our internal id
 * (useful for reconciliation). Both are unguessable, so there is no ambiguity.
 */
export async function findOrderByAnyId(db: Queryable, id: string): Promise<OrderRow | null> {
  const { rows } = await db.query<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE paypal_order_id = $1 OR id::text = $1 LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function lockOrder(client: PoolClient, orderId: string): Promise<OrderRow> {
  const { rows } = await client.query<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = $1 FOR UPDATE`, [
    orderId,
  ]);
  const row = rows[0];
  if (!row) throw notFound('Orden no encontrada');
  return row;
}
