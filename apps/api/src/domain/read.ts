import type { AgendaItem, FiestaEvent, Guest, RsvpStatus, TemplateKind } from '@fiestapay/shared';
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
}

export interface GuestRow {
  id: string;
  event_id: string;
  session_id: string;
  name: string;
  status: RsvpStatus;
  companions: number;
  obligation_version: number;
}

export const EVENT_COLUMNS = `id, slug, organizer_session_id, generation, archived, title, template, meal,
  description, starts_at, location, includes, agenda, price_cents, capacity, goal_cents, minimum_cents,
  confirmed, created_at, ends_at, closed_at, purged_at, is_demo, admin_key_hash, access_code_hash`;

export const GUEST_COLUMNS = 'id, event_id, session_id, name, status, companions, obligation_version';

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
}

export async function eventTotals(db: Queryable, eventId: string): Promise<EventTotals> {
  const { rows } = await db.query<{ collected: string | null; people: string | null }>(
    `SELECT
       (SELECT COALESCE(SUM(CASE WHEN kind = 'capture' THEN amount_cents ELSE -amount_cents END), 0)
          FROM payment_ledger WHERE event_id = $1) AS collected,
       (SELECT COALESCE(SUM(1 + companions), 0)
          FROM guests WHERE event_id = $1 AND status = 'yes') AS people`,
    [eventId],
  );
  return {
    collectedCents: sumToCents(rows[0]?.collected),
    confirmedPeople: sumToCents(rows[0]?.people),
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
