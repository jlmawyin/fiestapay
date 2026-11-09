import type { Dashboard, Guest, GuestTotals, PaymentListItem, RsvpStatus } from '@fiestapay/shared';
import { sumToCents, type Pool } from '../db/pool.js';
import { assertAdminKey } from './access.js';
import { auditTrail } from './audit.js';
import {
  getEventBySlug,
  loadFiestaEvent,
  toGuestWithPrice,
  type EventRow,
  type GuestRow,
  type Queryable,
} from './read.js';
import { concealExpired } from './retention.js';

interface GuestWithPaidRow extends GuestRow {
  paid: string | null;
}

/**
 * Guest balances from SQL in integer cents. Dashboard and reminder drafts share this exact
 * query and the same due formula (`toGuestWithPrice`), so no route re-implements the math.
 */
export async function loadGuestBalances(db: Queryable, event: EventRow): Promise<Guest[]> {
  const { rows } = await db.query<GuestWithPaidRow>(
    `SELECT g.id, g.event_id, g.session_id, g.name, g.status, g.companions, g.obligation_version,
            COALESCE(SUM(CASE WHEN l.kind = 'capture' THEN l.amount_cents ELSE -l.amount_cents END), 0) AS paid
       FROM guests g
       LEFT JOIN payment_ledger l ON l.guest_id = g.id
      WHERE g.event_id = $1
      GROUP BY g.id
      ORDER BY g.created_at ASC`,
    [event.id],
  );

  return rows.map((row) =>
    toGuestWithPrice(
      {
        id: row.id,
        event_id: row.event_id,
        session_id: row.session_id,
        name: row.name,
        status: row.status as RsvpStatus,
        companions: row.companions,
        obligation_version: row.obligation_version,
      },
      event.price_cents,
      sumToCents(row.paid),
    ),
  );
}

/**
 * Totals over exactly the rows returned to the organizer. People are confirmed attendees
 * (1 + companions per "yes"), while amounts come from each row's server-computed balance.
 */
function guestTotalsOf(guests: Guest[]): GuestTotals {
  let people = 0;
  let paidCents = 0;
  let dueCents = 0;
  for (const guest of guests) {
    if (guest.status === 'yes') people += 1 + guest.companions;
    paidCents += guest.paidCents;
    dueCents += guest.dueCents;
  }
  if (![people, paidCents, dueCents].every(Number.isSafeInteger)) {
    throw new Error('Totales de invitados invalidos');
  }
  return { people, paidCents, dueCents };
}

/** Organizer view. A keyed event accepts only X-Fiesta-Admin-Key, never the session cookie. */
export async function dashboardFor(pool: Pool, slug: string, presentedKey: string | null): Promise<Dashboard> {
  const eventRow = await getEventBySlug(pool, slug);
  assertAdminKey(eventRow, presentedKey);
  await concealExpired(pool, eventRow);

  const guests = await loadGuestBalances(pool, eventRow);

  const payments = await pool.query<{
    order_id: string;
    guest_name: string;
    amount_cents: number;
    status: string;
    created_at: Date;
  }>(
    `SELECT COALESCE(o.paypal_order_id, o.id::text) AS order_id,
            g.name AS guest_name,
            o.amount_cents,
            o.status,
            o.created_at
       FROM orders o
       JOIN guests g ON g.id = o.guest_id
      WHERE o.event_id = $1
      ORDER BY o.created_at DESC
      LIMIT 100`,
    [eventRow.id],
  );
  const paymentItems: PaymentListItem[] = payments.rows.map((row) => ({
    orderId: row.order_id,
    guestName: row.guest_name,
    amountCents: row.amount_cents,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  }));

  return {
    event: await loadFiestaEvent(pool, eventRow),
    guests,
    guestTotals: guestTotalsOf(guests),
    payments: paymentItems,
    audit: await auditTrail(pool, eventRow.id),
  };
}
