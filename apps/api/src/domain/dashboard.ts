import type { Dashboard, Guest, RsvpStatus } from '@fiestapay/shared';
import { sumToCents, type Pool } from '../db/pool.js';
import { auditTrail } from './audit.js';
import { assertOrganizer } from './events.js';
import { getEventBySlug, loadFiestaEvent, toGuestWithPrice, type GuestRow } from './read.js';

interface GuestWithPaidRow extends GuestRow {
  paid: string | null;
}

/** Organizer-only view: guests with verified money, plus the audit trail of this event. */
export async function dashboardFor(pool: Pool, sessionId: string, slug: string): Promise<Dashboard> {
  const eventRow = await getEventBySlug(pool, slug);
  assertOrganizer(eventRow, sessionId);

  const { rows } = await pool.query<GuestWithPaidRow>(
    `SELECT g.id, g.event_id, g.session_id, g.name, g.status, g.companions, g.obligation_version,
            COALESCE(SUM(CASE WHEN l.kind = 'capture' THEN l.amount_cents ELSE -l.amount_cents END), 0) AS paid
       FROM guests g
       LEFT JOIN payment_ledger l ON l.guest_id = g.id
      WHERE g.event_id = $1
      GROUP BY g.id
      ORDER BY g.created_at ASC`,
    [eventRow.id],
  );

  const guests: Guest[] = rows.map((row) =>
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
      eventRow.price_cents,
      sumToCents(row.paid),
    ),
  );

  return {
    event: await loadFiestaEvent(pool, eventRow),
    guests,
    audit: await auditTrail(pool, eventRow.id),
  };
}
