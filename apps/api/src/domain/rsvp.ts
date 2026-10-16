import type { FiestaEvent, Guest, RsvpStatus } from '@fiestapay/shared';
import { sumToCents, withTransaction, type Pool, type PoolClient } from '../db/pool.js';
import { conflict, notFound } from '../errors.js';
import { newId } from '../lib/ids.js';
import { audit } from './audit.js';
import { assertActive } from './events.js';
import {
  GUEST_COLUMNS,
  OPEN_ORDER_SQL,
  eventTotals,
  findCapturingOrder,
  findGuestBySession,
  lockEvent,
  lockGuest,
  loadGuest,
  toFiestaEvent,
  type GuestRow,
} from './read.js';

async function eventIdBySlug(client: PoolClient, slug: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>('SELECT id FROM events WHERE slug = $1', [slug]);
  const id = rows[0]?.id;
  if (!id) throw notFound('Evento no encontrado');
  return id;
}

/** Joining a public invitation grants guest capability only, bound to this session. */
export async function joinEvent(pool: Pool, sessionId: string, slug: string, name: string): Promise<Guest> {
  return withTransaction(pool, async (client) => {
    const event = await lockEvent(client, await eventIdBySlug(client, slug));
    assertActive(event);

    const existing = await findGuestBySession(client, event.id, sessionId);
    if (existing) return loadGuest(client, existing, event);

    const { rows } = await client.query<GuestRow>(
      `INSERT INTO guests (id, event_id, session_id, name) VALUES ($1, $2, $3, $4)
       ON CONFLICT (event_id, session_id) DO UPDATE SET name = guests.name
       RETURNING ${GUEST_COLUMNS}`,
      [newId(), event.id, sessionId, name],
    );
    const guest = rows[0]!;
    await audit(client, event.id, 'guest_joined');
    return loadGuest(client, guest, event);
  });
}

/** People already holding a seat, excluding one guest. */
async function otherConfirmedPeople(client: PoolClient, eventId: string, guestId: string): Promise<number> {
  const { rows } = await client.query<{ people: string | null }>(
    `SELECT COALESCE(SUM(1 + companions), 0) AS people
       FROM guests WHERE event_id = $1 AND status = 'yes' AND id <> $2`,
    [eventId, guestId],
  );
  return sumToCents(rows[0]?.people);
}

export interface RsvpChange {
  status: RsvpStatus;
  companions: number;
}

export interface RsvpResult {
  guest: Guest;
  event: FiestaEvent;
}

/**
 * Applies an RSVP change under the event lock, so two guests racing for the last seat cannot
 * both win. The whole party (holder plus companions) is admitted or the change is rejected;
 * seats are never partially granted.
 *
 * A change invalidates outstanding quotes and supersedes the guest's open order, because the
 * amount owed just moved. Money already captured is never refunded automatically: if the guest
 * now owes less, `dueCents` becomes 0 and the surplus stays for human reconciliation.
 */
export async function setRsvp(
  pool: Pool,
  sessionId: string,
  slug: string,
  change: RsvpChange,
): Promise<RsvpResult> {
  return withTransaction(pool, async (client) => {
    const event = await lockEvent(client, await eventIdBySlug(client, slug));
    assertActive(event);

    const found = await findGuestBySession(client, event.id, sessionId);
    if (!found) throw notFound('Primero unete a la invitacion');
    const guest = await lockGuest(client, found.id);

    if (change.status === 'yes' && event.capacity !== null) {
      const others = await otherConfirmedPeople(client, event.id, guest.id);
      const requested = 1 + change.companions;
      if (others + requested > event.capacity) {
        const free = Math.max(0, event.capacity - others);
        throw conflict(`Cupo insuficiente: quedan ${free} plazas y pediste ${requested}`);
      }
    }

    const unchanged = guest.status === change.status && guest.companions === change.companions;
    if (unchanged) {
      return {
        guest: await loadGuest(client, guest, event),
        event: toFiestaEvent(event, await eventTotals(client, event.id)),
      };
    }

    // A capture already handed to PayPal must resolve before the obligation can move. Letting
    // it through here is the double-charge sequence: the old amount is still in flight while a
    // new quote and a new order are opened for the new amount.
    if (await findCapturingOrder(client, guest.id)) {
      throw conflict('Tu pago esta en verificacion con PayPal; espera a que se confirme para cambiar tu asistencia');
    }

    const { rows } = await client.query<GuestRow>(
      `UPDATE guests SET status = $2, companions = $3, obligation_version = obligation_version + 1
         WHERE id = $1 RETURNING ${GUEST_COLUMNS}`,
      [guest.id, change.status, change.companions],
    );
    const updated = rows[0]!;

    await client.query('UPDATE quotes SET invalidated_at = now() WHERE guest_id = $1 AND invalidated_at IS NULL', [
      guest.id,
    ]);
    const superseded = await client.query<{ id: string }>(
      `UPDATE orders SET status = 'superseded', updated_at = now()
         WHERE guest_id = $1 AND status IN (${OPEN_ORDER_SQL}) RETURNING id`,
      [guest.id],
    );
    for (const _order of superseded.rows) await audit(client, event.id, 'order_superseded');
    await audit(client, event.id, 'rsvp_updated');

    return {
      guest: await loadGuest(client, updated, event),
      event: toFiestaEvent(event, await eventTotals(client, event.id)),
    };
  });
}

/** Only a confirmed RSVP creates an obligation to pay. */
export function assertCanOwe(guest: GuestRow): void {
  if (guest.status !== 'yes') {
    throw conflict('Confirma tu asistencia antes de cotizar o pagar');
  }
}
