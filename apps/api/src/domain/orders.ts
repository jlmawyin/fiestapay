import type { Guest, OrderResult } from '@fiestapay/shared';
import type { Config } from '../config.js';
import { withTransaction, type Pool, type PoolClient } from '../db/pool.js';
import { badGateway, conflict, forbidden, notFound, unavailable } from '../errors.js';
import { newId, requestIdFor } from '../lib/ids.js';
import { PayPalError, type PayPalAdapter } from '../paypal/types.js';
import { approveUrlOf } from '../paypal/verify.js';
import { assertPrivateAccess } from './access.js';
import { REVOKED_MESSAGE, assertSessionMayAct, guestAccessRevoked } from './moderation.js';
import { audit } from './audit.js';
import { assertAcceptingGuests } from './events.js';
import { decideFundingIfDue, fundingBlocksNewCharge } from './funding.js';
import { concealExpired, isPastRetention, tombstoneEvent } from './retention.js';
import { convergeCapture, isApplied, type CaptureOutcome } from './payments.js';
import { requireUsableQuote, type QuoteRow } from './quotes.js';
import {
  ORDER_COLUMNS,
  OPEN_ORDER_SQL,
  findEventById,
  findEventBySlug,
  findGuestById,
  findGuestBySession,
  findOrderByAnyId,
  loadGuestByEvent,
  lockEvent,
  lockGuest,
  lockOrder,
  type EventRow,
  type GuestRow,
  type OrderRow,
  type OrderStatus,
} from './read.js';
import { assertCanOwe } from './rsvp.js';

export interface PayPalDeps {
  paypal: PayPalAdapter;
  merchantId: string;
  /** Public origin the payer's browser comes back to; return URLs are built per invitation. */
  origin?: string;
}

/** Throws the honest 503 when PayPal is not configured, instead of faking a payment. */
export function requirePayPal(config: Config, paypal: PayPalAdapter | null): PayPalDeps {
  if (!config.paypal || !paypal) {
    throw unavailable(config.paypalDisabledReason ?? 'PayPal no esta configurado en este servidor');
  }
  const origin = config.publicOrigin ?? config.allowedOrigins[0];
  return {
    paypal,
    merchantId: config.paypal.merchantId,
    ...(origin ? { origin } : {}),
  };
}

/**
 * PayPal returns the payer to the invitation itself, which is a route the front end actually
 * serves, with `?paypal=approved|cancelled` as a hint. Coming back is never a charge: there is
 * no server route that captures on a return visit, the front end still has to ask the person
 * to confirm and then POST the capture.
 */
export function paypalReturnUrls(origin: string | undefined, slug: string): { returnUrl?: string; cancelUrl?: string } {
  if (!origin) return {};
  const invitation = `${origin}/e/${encodeURIComponent(slug)}`;
  return { returnUrl: `${invitation}?paypal=approved`, cancelUrl: `${invitation}?paypal=cancelled` };
}

type ReservedOrder =
  | { blocked: string }
  | { order: OrderRow; event: EventRow; quote: QuoteRow };

const CAPTURE_IN_FLIGHT = 'Tu pago anterior esta en verificacion con PayPal; espera a que se confirme';

async function openOrderForGuest(client: PoolClient, guestId: string): Promise<OrderRow | null> {
  const { rows } = await client.query<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders
       WHERE guest_id = $1 AND status IN (${OPEN_ORDER_SQL})
       FOR UPDATE`,
    [guestId],
  );
  return rows[0] ?? null;
}

/**
 * Records the order intent in our database *before* talking to PayPal, with the stable request
 * id it will use. If the network call then times out, the next attempt finds this row and
 * replays the same PayPal-Request-Id, so PayPal returns the original order instead of a second
 * one. At most one order is open per guest obligation.
 */
async function reserveOrderIntent(
  pool: Pool,
  sessionId: string,
  slug: string,
  quoteId: string,
  merchantId: string,
  presentedKey: string | null,
): Promise<ReservedOrder> {
  const visible = await findEventBySlug(pool, slug);
  if (!visible) throw notFound('Evento no encontrado');
  await concealExpired(pool, visible);
  return withTransaction(pool, async (client) => {
    const found = await client.query<{ id: string }>('SELECT id FROM events WHERE slug = $1', [slug]);
    const eventId = found.rows[0]?.id;
    if (!eventId) throw notFound('Evento no encontrado');
    const locked = await lockEvent(client, eventId);
    const settled = await decideFundingIfDue(client, locked);
    const blocked = fundingBlocksNewCharge(settled.event, settled.at);
    if (blocked) return { blocked };
    const event = settled.event;
    // Archived, closed, purged, or past retention cannot open a new payment.
    assertAcceptingGuests(event);
    await assertPrivateAccess(client, event, sessionId, presentedKey);

    const guestRow = await findGuestBySession(client, event.id, sessionId);
    if (!guestRow) throw notFound('Primero unete a la invitacion');
    const guest = await lockGuest(client, guestRow.id);
    await assertSessionMayAct(client, event.id, sessionId);
    assertCanOwe(guest);

    const quote = await requireUsableQuote(client, quoteId, event, guest);

    const open = await openOrderForGuest(client, guest.id);
    if (open) {
      if (open.status === 'capturing') {
        // A capture is already in flight for this guest. Superseding it and opening a second
        // order is precisely the double-charge sequence; refuse until the money is known.
        throw conflict(CAPTURE_IN_FLIGHT);
      }
      const sameObligation =
        open.obligation_version === guest.obligation_version && open.amount_cents === quote.amount_cents;
      if (sameObligation) {
        // Reuse the open attempt: same row, same request id, no second PayPal order.
        return { order: open, event, quote };
      }
      await client.query(`UPDATE orders SET status = 'superseded', updated_at = now() WHERE id = $1`, [open.id]);
      await audit(client, event.id, 'order_superseded');
    }

    const id = newId();
    const { rows } = await client.query<OrderRow>(
      `INSERT INTO orders (id, event_id, guest_id, quote_id, obligation_version, generation, request_id,
          amount_cents, currency, payee_merchant_id, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'USD',$9,'intent')
        RETURNING ${ORDER_COLUMNS}`,
      [
        id,
        event.id,
        guest.id,
        quote.id,
        guest.obligation_version,
        event.generation,
        requestIdFor(id),
        quote.amount_cents,
        merchantId,
      ],
    );
    await audit(client, event.id, 'order_created');
    return { order: rows[0]!, event, quote };
  });
}

/** Statuses in which an order we just created at PayPal is still usable by its guest. */
const USABLE_AFTER_CREATE = new Set<OrderStatus>(['created', 'approved']);

/**
 * Writes the PayPal order id back without ever reviving an attempt that stopped being valid
 * while the network call was out. The whole decision happens under the event lock, so it
 * serializes against the RSVP change and the demo reset that could have superseded it.
 *
 * The PayPal id is stored in every case, even on an order that can no longer be used: it is
 * the only handle we would have to reconcile a capture that happens anyway. Only the promotion
 * `intent -> created` is conditional, so nothing here can collide with the one-open-order index
 * (both are open statuses on the same row) or return 500 on it.
 */
async function settleCreatedOrder(
  pool: Pool,
  order: OrderRow,
  paypalOrderId: string,
  approveUrl: string | undefined,
): Promise<OrderRow> {
  return withTransaction(pool, async (client) => {
    const event = await lockEvent(client, order.event_id);
    await lockGuest(client, order.guest_id);
    const current = await lockOrder(client, order.id);
    const paypalId = current.paypal_order_id ?? paypalOrderId;

    if (current.status !== 'intent') {
      // Superseded by an RSVP change, or already settled by a concurrent identical call.
      const { rows } = await client.query<OrderRow>(
        `UPDATE orders SET paypal_order_id = $2, updated_at = now() WHERE id = $1 RETURNING ${ORDER_COLUMNS}`,
        [current.id, paypalId],
      );
      return rows[0]!;
    }

    if (event.archived) {
      // The invitation was archived mid-flight: the attempt dies here instead of becoming an
      // open order on an archived generation, and the guest's open slot is freed.
      const { rows } = await client.query<OrderRow>(
        `UPDATE orders SET paypal_order_id = $2, status = 'superseded', updated_at = now()
           WHERE id = $1 RETURNING ${ORDER_COLUMNS}`,
        [current.id, paypalId],
      );
      await audit(client, event.id, 'order_superseded');
      return rows[0]!;
    }

    const { rows } = await client.query<OrderRow>(
      `UPDATE orders SET paypal_order_id = $2, status = 'created', approve_url = $3, updated_at = now()
         WHERE id = $1 RETURNING ${ORDER_COLUMNS}`,
      [current.id, paypalId, approveUrl ?? null],
    );
    return rows[0]!;
  });
}

const asOrderResult = (order: OrderRow): OrderResult => ({
  orderId: order.paypal_order_id!,
  status: order.status,
  ...(order.approve_url ? { approveUrl: order.approve_url } : {}),
});

export async function createOrderForSession(
  pool: Pool,
  deps: PayPalDeps,
  sessionId: string,
  slug: string,
  quoteId: string,
  presentedKey: string | null = null,
): Promise<OrderResult> {
  const reserved = await reserveOrderIntent(pool, sessionId, slug, quoteId, deps.merchantId, presentedKey);
  if ('blocked' in reserved) throw conflict(reserved.blocked);
  const { order, quote } = reserved;

  if (order.paypal_order_id) return asOrderResult(order);

  try {
    const created = await deps.paypal.createOrder({
      requestId: order.request_id,
      amountCents: order.amount_cents,
      currency: 'USD',
      referenceId: order.id,
      customId: order.id,
      invoiceId: order.request_id,
      description: quote.summary,
      ...paypalReturnUrls(deps.origin, slug),
    });
    const settled = await settleCreatedOrder(pool, order, created.id, created.approveUrl ?? approveUrlOf(created.raw));
    if (!USABLE_AFTER_CREATE.has(settled.status)) {
      // The PayPal order exists and its id is stored, but this attempt is no longer the live
      // obligation, so no approval link is handed out for it.
      throw conflict('Tu pago dejo de ser valido mientras se creaba; pide una cotizacion nueva');
    }
    return asOrderResult(settled);
  } catch (err) {
    if (!(err instanceof PayPalError)) throw err;

    // A concurrent call sharing this intent replays the same PayPal-Request-Id, and PayPal
    // answers the loser with a duplicate/rate-limit error. The order it completed must not be
    // marked failed, so read the row back before concluding anything.
    const settled = await findOrderByAnyId(pool, order.id);
    if (settled?.paypal_order_id && USABLE_AFTER_CREATE.has(settled.status)) return asOrderResult(settled);

    const status = err.status ?? 500;
    // Timeouts, server errors, rate limits and duplicate-request rejections are all ambiguous:
    // the order may exist at PayPal. Keep the intent and its request id so the next attempt
    // replays it and gets the original order back instead of creating a second one.
    if (err.timeout || status >= 500 || status === 409 || status === 422 || status === 429) {
      throw badGateway('PayPal no confirmo la creacion; vuelve a intentar el mismo pago');
    }
    await pool.query(`UPDATE orders SET status = 'failed', updated_at = now() WHERE id = $1 AND status = 'intent'`, [
      order.id,
    ]);
    throw badGateway('PayPal rechazo la creacion de la orden');
  }
}

interface OwnedOrder {
  order: OrderRow;
  guest: GuestRow;
}

/** Only the guest who owns the order may capture or read it. */
async function requireOwnOrder(
  pool: Pool,
  sessionId: string,
  orderId: string,
  presentedKey: string | null,
): Promise<OwnedOrder> {
  const order = await findOrderByAnyId(pool, orderId);
  if (!order) throw notFound('Orden no encontrada');
  const guest = await findGuestById(pool, order.guest_id);
  if (!guest) throw notFound('Orden no encontrada');
  if (guest.session_id !== sessionId) throw forbidden('Esta orden pertenece a otro invitado');
  const event = await findEventById(pool, order.event_id);
  if (!event) throw notFound('Orden no encontrada');
  // Ownership stays with the guest. A private code still gates the order after a code change.
  await assertPrivateAccess(pool, event, sessionId, presentedKey);
  return { order, guest };
}

export interface CaptureResponse {
  status: string;
  guest: Guest;
}

type CaptureClaim =
  | { kind: 'paid' }
  | { kind: 'claimed'; order: OrderRow }
  /** Not the live obligation any more: never start a capture, only reconcile an existing one. */
  | { kind: 'reconcile'; order: OrderRow; reason: string };

/**
 * Claims the order for capture in our own database before anything touches the network.
 *
 * Everything is decided under the event lock (then the guest, then the order — the same order
 * every money path takes, so these cannot deadlock each other). Once the row says `capturing`,
 * a racing RSVP change or a second order attempt is refused by `setRsvp` and
 * `reserveOrderIntent`, and the partial unique index refuses it at the database level too. That
 * is what makes the capture call safe to make at all: there is no window in which the old
 * amount can be in flight while a new obligation is opened for the same guest.
 */
async function claimOrderForCapture(pool: Pool, known: OrderRow): Promise<CaptureClaim> {
  return withTransaction(pool, async (client) => {
    // event_id and guest_id never change on an order, so taking them from the unlocked read is
    // safe and lets the event lock still be the first one acquired.
    const locked = await lockEvent(client, known.event_id);
    const settled = await decideFundingIfDue(client, locked);
    const event = settled.event;
    const guest = await lockGuest(client, known.guest_id);
    const order = await lockOrder(client, known.id);

    if (order.status === 'paid') return { kind: 'paid' };
    if (event.purged_at || isPastRetention(event.ends_at)) {
      if (!event.purged_at) await tombstoneEvent(client, event.id, 'retention_purged');
      return { kind: 'reconcile', order, reason: 'Este evento ya no esta disponible' };
    }
    if (!order.paypal_order_id) {
      throw conflict('La orden aun no se creo en PayPal; vuelve a intentarlo');
    }
    if (order.status === 'superseded' || order.status === 'failed' || order.status === 'intent') {
      return { kind: 'reconcile', order, reason: 'Esta orden fue reemplazada; pide una cotizacion nueva' };
    }
    if (event.archived) {
      return {
        kind: 'reconcile',
        order,
        reason: 'Esta invitacion fue archivada por un reinicio de demo; no se inician pagos nuevos',
      };
    }
    if (order.obligation_version !== guest.obligation_version) {
      return {
        kind: 'reconcile',
        order,
        reason: 'Tu asistencia cambio despues de esta orden; pide una cotizacion nueva',
      };
    }
    const blocked = fundingBlocksNewCharge(event, settled.at);
    if (blocked) return { kind: 'reconcile', order, reason: blocked };
    // A fresh capture POST is a new action. An order already in `capturing` was sent before
    // this check and must still be retried with the same request id.
    if (order.status !== 'capturing' && guestAccessRevoked(guest)) {
      return { kind: 'reconcile', order, reason: REVOKED_MESSAGE };
    }

    const { rows } = await client.query<OrderRow>(
      `UPDATE orders SET status = 'capturing', updated_at = now()
         WHERE id = $1 AND status IN ('created','approved','capturing')
       RETURNING ${ORDER_COLUMNS}`,
      [order.id],
    );
    const claimed = rows[0];
    if (!claimed) throw conflict('El estado de la orden cambio; vuelve a consultarla');
    return { kind: 'claimed', order: claimed };
  });
}

/**
 * Captures the guest's own order and only then applies the payment, after verifying merchant,
 * amount, currency, order and capture id. Capturing twice, or racing the webhook, converges on
 * the same single ledger entry.
 */
export async function captureOwnOrder(
  pool: Pool,
  deps: PayPalDeps,
  sessionId: string,
  orderIdParam: string,
  presentedKey: string | null = null,
): Promise<CaptureResponse> {
  const { order, guest } = await requireOwnOrder(pool, sessionId, orderIdParam, presentedKey);
  const paid = async (): Promise<CaptureResponse> => ({ status: 'paid', guest: await loadGuestByEvent(pool, guest) });

  const claim = await claimOrderForCapture(pool, order);
  if (claim.kind === 'paid') return paid();

  if (claim.kind === 'reconcile') {
    // No capture is *started* for an order that stopped being the live obligation or whose
    // invitation was archived. But money PayPal already captured is real: it is counted once,
    // against its own (possibly archived) event, with its own audit action.
    const historic = await convergeCapture(pool, deps.paypal, deps.merchantId, claim.order, null);
    if (isApplied(historic)) return paid();
    throw conflict(claim.reason);
  }

  const claimed = claim.order;
  let outcome: CaptureOutcome;
  try {
    const captured = await deps.paypal.captureOrder({
      paypalOrderId: claimed.paypal_order_id!,
      requestId: `${claimed.request_id}-capture`,
    });
    outcome = await convergeCapture(pool, deps.paypal, deps.merchantId, claimed, captured);
  } catch (err) {
    if (!(err instanceof PayPalError)) {
      // The request may already have moved money; a local parse/DB failure is not a rejection.
      throw err;
    }
    // The order may already be captured (duplicate click, webhook first, timeout after
    // PayPal captured). Reconcile from the authoritative order before reporting a failure.
    outcome = await convergeCapture(pool, deps.paypal, deps.merchantId, claimed, null);
    if (!isApplied(outcome)) {
      if (err.timeout) {
        // The claim stays. Retrying replays the very same capture request id, so PayPal either
        // reports the original capture or captures once — never a second order, and meanwhile
        // the obligation cannot move underneath it.
        throw badGateway('PayPal no respondio a tiempo; el pago quedo en verificacion, consulta el estado de la orden');
      }
      // A second concurrent request can fail while the first is still settling. Keep the
      // durable claim and allow only retries with the same id, never a fresh obligation.
      throw badGateway('PayPal no confirmó la captura; consulta el estado o reintenta esta misma orden');
    }
  }

  if (!isApplied(outcome)) {
    if (outcome.transient) {
      // PayPal accepted the call but has not published a capture yet: keep the claim, the money
      // may still land and the obligation must stay frozen until we know.
      throw badGateway('PayPal aun no confirma la captura; consulta el estado de la orden');
    }
    // The capture call succeeded but the order does not verify (receiver, amount, currency).
    // Releasing the claim here would let a new obligation open next to money that may well
    // have moved, so the order stays frozen for a human instead.
    await audit(pool, claimed.event_id, 'payment_capture_unverified');
    throw conflict(outcome.reason);
  }
  return paid();
}

/** Owner-only reconciliation: re-reads PayPal when we still believe the order is open. */
const RECONCILABLE_ON_READ = new Set<OrderStatus>(['created', 'approved', 'capturing']);

export async function readOwnOrder(
  pool: Pool,
  deps: PayPalDeps | null,
  sessionId: string,
  orderIdParam: string,
  presentedKey: string | null = null,
): Promise<CaptureResponse> {
  const { order, guest } = await requireOwnOrder(pool, sessionId, orderIdParam, presentedKey);
  let status: string = order.status;

  if (deps && order.paypal_order_id && RECONCILABLE_ON_READ.has(order.status)) {
    try {
      const outcome = await convergeCapture(pool, deps.paypal, deps.merchantId, order, null);
      if (isApplied(outcome)) status = 'paid';
    } catch {
      // Reconciliation is best-effort: a PayPal outage must not break the status read.
    }
  }

  return { status, guest: await loadGuestByEvent(pool, guest) };
}

/** What a signed CHECKOUT.ORDER.APPROVED notification could do with our records. */
export type ApprovalOutcome = 'approved' | 'unknown' | 'ignored';

/**
 * Marks an order approved from a signed webhook. APPROVED is never "paid".
 *
 * `unknown` means the notification arrived before the order's PayPal id was stored, which is a
 * race, not a bad notification: the caller asks PayPal to redeliver rather than consuming it.
 */
export async function markOrderApproved(pool: Pool, paypalOrderId: string): Promise<ApprovalOutcome> {
  return withTransaction(pool, async (client) => {
    const found = await client.query<{ id: string; event_id: string; guest_id: string; status: OrderStatus }>(
      'SELECT id, event_id, guest_id, status FROM orders WHERE paypal_order_id = $1',
      [paypalOrderId],
    );
    const row = found.rows[0];
    if (!row) return 'unknown';
    await lockEvent(client, row.event_id);
    await lockGuest(client, row.guest_id);
    const order = await lockOrder(client, row.id);
    if (order.status !== 'intent' && order.status !== 'created') return 'ignored';
    await client.query(`UPDATE orders SET status = 'approved', updated_at = now() WHERE id = $1`, [order.id]);
    return 'approved';
  });
}
