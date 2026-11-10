import { estimateOrganizerFee, fixedQuote, formatMoney, type Locale, type Quote } from '@fiestapay/shared';
import { withTransaction, type Pool, type PoolClient } from '../db/pool.js';
import { conflict, notFound } from '../errors.js';
import { newId } from '../lib/ids.js';
import { assertPrivateAccess } from './access.js';
import { assertSessionMayAct } from './moderation.js';
import { audit } from './audit.js';
import { assertAcceptingGuests } from './events.js';
import { decideFundingIfDue, fundingBlocksNewCharge, type FundingGate } from './funding.js';
import { concealExpired } from './retention.js';
import { assertCanOwe } from './rsvp.js';
import {
  OPEN_ORDER_SQL,
  findEventBySlug,
  findGuestBySession,
  guestPaidCents,
  lockEvent,
  lockGuest,
  type EventRow,
  type GuestRow,
  type Queryable,
} from './read.js';

export interface QuoteRow {
  id: string;
  event_id: string;
  guest_id: string;
  obligation_version: number;
  people: number;
  unit_cents: number;
  total_cents: number;
  paid_cents: number;
  amount_cents: number;
  summary: string;
  expires_at: Date;
  invalidated_at: Date | null;
}

const QUOTE_COLUMNS = `id, event_id, guest_id, obligation_version, people, unit_cents, total_cents,
  paid_cents, amount_cents, summary, expires_at, invalidated_at`;

export const toQuote = (row: QuoteRow, locale: Locale = 'es'): Quote => ({
  id: row.id,
  guestId: row.guest_id,
  people: row.people,
  unitCents: row.unit_cents,
  totalCents: row.total_cents,
  paidCents: row.paid_cents,
  amountCents: row.amount_cents,
  // Always rendered by the server from persisted numbers in the request language. The stored
  // summary is never trusted as the answer text (it could come from an older request locale).
  summary: quoteSummary(row.people, row.unit_cents, row.total_cents, row.amount_cents, locale),
  expiresAt: row.expires_at.toISOString(),
  // Shown before PayPal is opened. It is not added to amountCents.
  feeEstimate: estimateOrganizerFee(row.amount_cents),
});

export function quoteSummary(
  people: number,
  unitCents: number,
  totalCents: number,
  amountCents: number,
  locale: Locale = 'es',
): string {
  const money = (cents: number) => formatMoney(cents, locale);
  const head = locale === 'en'
    ? `${people} ${people === 1 ? 'person' : 'people'} at ${money(unitCents)}, total ${money(totalCents)}`
    : `${people} ${people === 1 ? 'persona' : 'personas'} por ${money(unitCents)}, total ${money(totalCents)}`;
  if (amountCents === totalCents) return head;
  if (amountCents === 0) return locale === 'en' ? `${head}; already paid` : `${head}; ya esta pagado`;
  return locale === 'en'
    ? `${head}; you already paid ${money(totalCents - amountCents)} and ${money(amountCents)} is left`
    : `${head}; ya pagaste ${money(totalCents - amountCents)} y falta ${money(amountCents)}`;
}

/** Server-side numbers only: price, people and prior verified payments all come from the DB. */
export function computeQuote(event: EventRow, guest: GuestRow, paidCents: number, locale: Locale = 'es') {
  const people = 1 + guest.companions;
  const { totalCents, amountCents } = fixedQuote(event.price_cents, people, paidCents);
  return {
    people,
    unitCents: event.price_cents,
    totalCents,
    paidCents,
    amountCents,
    summary: quoteSummary(people, event.price_cents, totalCents, amountCents, locale),
  };
}

async function insertQuote(
  client: PoolClient,
  event: EventRow,
  guest: GuestRow,
  ttlSeconds: number,
): Promise<QuoteRow> {
  const paid = await guestPaidCents(client, guest.id);
  const computed = computeQuote(event, guest, paid);

  // A fresh quote supersedes the guest's earlier ones: at most one live quote per obligation.
  await client.query('UPDATE quotes SET invalidated_at = now() WHERE guest_id = $1 AND invalidated_at IS NULL', [
    guest.id,
  ]);

  const { rows } = await client.query<QuoteRow>(
    `INSERT INTO quotes (id, event_id, guest_id, obligation_version, people, unit_cents, total_cents,
        paid_cents, amount_cents, summary, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() + ($11 || ' seconds')::interval)
      RETURNING ${QUOTE_COLUMNS}`,
    [
      newId(),
      event.id,
      guest.id,
      guest.obligation_version,
      computed.people,
      computed.unitCents,
      computed.totalCents,
      computed.paidCents,
      computed.amountCents,
      computed.summary,
      String(ttlSeconds),
    ],
  );
  await audit(client, event.id, 'quote_created');
  return rows[0]!;
}

/** Latest non-invalidated quote for the guest. Expiry is checked by the caller. */
async function findLiveQuote(client: PoolClient, guestId: string): Promise<QuoteRow | null> {
  const { rows } = await client.query<QuoteRow>(
    `SELECT ${QUOTE_COLUMNS} FROM quotes
      WHERE guest_id = $1 AND invalidated_at IS NULL
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [guestId],
  );
  return rows[0] ?? null;
}

/**
 * While an order is open (intent/created/approved/capturing), its quote is the live one for the
 * guest even if its TTL has passed: invalidating it or opening a second quote next to it is how
 * one obligation turns into two payment attempts. A capture in flight is an open order, not a
 * new payment, so it also keeps its quote.
 */
async function findOpenOrderQuote(client: PoolClient, guestId: string): Promise<QuoteRow | null> {
  const { rows } = await client.query<{ quote_id: string }>(
    `SELECT quote_id FROM orders
      WHERE guest_id = $1 AND status IN (${OPEN_ORDER_SQL})
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [guestId],
  );
  const quoteId = rows[0]?.quote_id;
  return quoteId ? findQuote(client, quoteId) : null;
}

export async function createQuoteForSession(
  pool: Pool,
  sessionId: string,
  slug: string,
  ttlSeconds: number,
  presentedKey: string | null = null,
  locale: Locale = 'es',
): Promise<Quote> {
  const visible = await findEventBySlug(pool, slug);
  if (!visible) throw notFound('Evento no encontrado');
  await concealExpired(pool, visible);
  const outcome = await withTransaction<FundingGate<{ quote: Quote }>>(pool, async (client) => {
    const found = await client.query<{ id: string }>('SELECT id FROM events WHERE slug = $1', [slug]);
    const eventId = found.rows[0]?.id;
    if (!eventId) throw notFound('Evento no encontrado');
    const locked = await lockEvent(client, eventId);
    const settled = await decideFundingIfDue(client, locked);
    const blocked = fundingBlocksNewCharge(settled.event, settled.at);
    if (blocked) return { blocked };
    const event = settled.event;
    assertAcceptingGuests(event);
    await assertPrivateAccess(client, event, sessionId, presentedKey);
    const guestRow = await findGuestBySession(client, event.id, sessionId);
    if (!guestRow) throw notFound('Primero unete a la invitacion');
    const guest = await lockGuest(client, guestRow.id);
    await assertSessionMayAct(client, event.id, sessionId);
    assertCanOwe(guest);

    const openOrderQuote = await findOpenOrderQuote(client, guest.id);
    if (openOrderQuote) return { quote: toQuote(openOrderQuote, locale) };

    const paid = await guestPaidCents(client, guest.id);
    const current = computeQuote(event, guest, paid, locale);
    const existing = await findLiveQuote(client, guest.id);
    const compatible =
      existing !== null &&
      existing.expires_at.getTime() > Date.now() &&
      existing.obligation_version === guest.obligation_version &&
      existing.people === current.people &&
      existing.unit_cents === current.unitCents &&
      existing.total_cents === current.totalCents &&
      existing.paid_cents === current.paidCents &&
      existing.amount_cents === current.amountCents;
    if (compatible) return { quote: toQuote(existing, locale) };

    return { quote: toQuote(await insertQuote(client, event, guest, ttlSeconds), locale) };
  });
  if ('blocked' in outcome) throw conflict(outcome.blocked);
  return outcome.quote;
}

export async function findQuote(db: Queryable, quoteId: string): Promise<QuoteRow | null> {
  const { rows } = await db.query<QuoteRow>(`SELECT ${QUOTE_COLUMNS} FROM quotes WHERE id = $1`, [quoteId]);
  return rows[0] ?? null;
}

/**
 * Re-validates a quote at the moment of use: it must belong to this guest, still be live, match
 * the current obligation version and still agree with what the server computes right now.
 */
export async function requireUsableQuote(
  client: PoolClient,
  quoteId: string,
  event: EventRow,
  guest: GuestRow,
): Promise<QuoteRow> {
  const quote = await findQuote(client, quoteId);
  if (!quote || quote.guest_id !== guest.id || quote.event_id !== event.id) {
    throw notFound('Cotizacion no encontrada');
  }
  if (quote.invalidated_at !== null) throw conflict('La cotizacion ya no es valida; pide una nueva');
  if (quote.expires_at.getTime() <= Date.now()) throw conflict('La cotizacion expiro; pide una nueva');
  if (quote.obligation_version !== guest.obligation_version) {
    throw conflict('Tu asistencia cambio despues de esta cotizacion; pide una nueva');
  }

  const paid = await guestPaidCents(client, guest.id);
  const current = computeQuote(event, guest, paid);
  if (current.totalCents !== quote.total_cents || current.amountCents !== quote.amount_cents) {
    await client.query('UPDATE quotes SET invalidated_at = now() WHERE id = $1', [quote.id]);
    throw conflict('El importe cambio desde la cotizacion; pide una nueva');
  }
  if (quote.amount_cents < 1) throw conflict('No hay saldo pendiente por pagar');
  return quote;
}
