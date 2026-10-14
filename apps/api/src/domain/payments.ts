import { sumToCents, withTransaction, type Pool } from '../db/pool.js';
import { conflict } from '../errors.js';
import { newId } from '../lib/ids.js';
import type { PayPalAdapter, PayPalOrder } from '../paypal/types.js';
import { captureIdFromRefund, verifyCapturedOrder, verifyRefund } from '../paypal/verify.js';
import { audit } from './audit.js';
import { findGuestById, lockEvent, lockOrder, type OrderRow } from './read.js';

export interface CaptureApplication {
  applied: boolean;
  /** True when this capture had already been recorded (callback and webhook converging). */
  duplicate: boolean;
  captureId: string;
  amountCents: number;
}

export interface CaptureRejection {
  applied: false;
  duplicate: false;
  reason: string;
  /** True while PayPal may still publish this capture: the caller must retry, not record it. */
  transient: boolean;
}

export type CaptureOutcome = CaptureApplication | CaptureRejection;

export const isApplied = (outcome: CaptureOutcome): outcome is CaptureApplication =>
  (outcome as CaptureApplication).captureId !== undefined;

/** Statuses in which an order is still the guest's live, chargeable obligation. */
const LIVE_FOR_CAPTURE = new Set(['created', 'approved', 'capturing']);

/**
 * The single place where money becomes "paid". The capture call, the signed webhook and the
 * owner reconciliation read all funnel through here, so a capture is applied exactly once no
 * matter how many notification paths deliver it.
 *
 * `candidate` is an order representation we already hold (the capture response); it is trusted
 * only if it verifies. Otherwise the order is re-read from PayPal.
 */
export async function convergeCapture(
  pool: Pool,
  paypal: PayPalAdapter,
  merchantId: string,
  order: OrderRow,
  candidate?: PayPalOrder | null,
): Promise<CaptureOutcome> {
  const paypalOrderId = order.paypal_order_id;
  if (!paypalOrderId) {
    // The create call may not have settled its PayPal id yet: a notification about this order
    // is early, not wrong, so the caller must ask for it again.
    return {
      applied: false,
      duplicate: false,
      reason: 'La orden aun no tiene identificador de PayPal',
      transient: true,
    };
  }
  if (order.payee_merchant_id !== merchantId) {
    return {
      applied: false,
      duplicate: false,
      reason: 'El receptor configurado no coincide con el de la orden',
      transient: false,
    };
  }

  const expectation = {
    paypalOrderId,
    amountCents: order.amount_cents,
    currency: 'USD' as const,
    merchantId,
    customId: order.id,
  };

  let check = verifyCapturedOrder(candidate ?? null, expectation);
  if (!check.ok) {
    const fresh = await paypal.getOrder(paypalOrderId);
    check = verifyCapturedOrder(fresh, expectation);
  }
  if (!check.ok) {
    return { applied: false, duplicate: false, reason: check.reason, transient: check.transient };
  }

  const { captureId, amountCents } = check;

  return withTransaction(pool, async (client) => {
    const event = await lockEvent(client, order.event_id);
    const current = await lockOrder(client, order.id);

    if (current.capture_id !== null && current.capture_id !== captureId) {
      // Two different captures on one order: never apply both, surface it instead.
      throw conflict('La orden tiene otra captura registrada; requiere conciliacion manual');
    }

    // Money that PayPal really moved is always recorded, and always against the event the
    // order belongs to — including an archived generation, so a late capture lands on the
    // invitation it was paid for instead of inflating the current one.
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO payment_ledger (id, event_id, guest_id, order_id, kind, amount_cents, external_id, capture_id)
         VALUES ($1, $2, $3, $4, 'capture', $5, $6, $6)
       ON CONFLICT (kind, external_id) DO NOTHING
       RETURNING id`,
      [newId(), current.event_id, current.guest_id, current.id, amountCents, captureId],
    );
    const applied = inserted.rows.length > 0;

    await client.query(
      `UPDATE orders SET status = 'paid', capture_id = $2, updated_at = now() WHERE id = $1`,
      [current.id, captureId],
    );
    // A capture on an order that was no longer the live obligation is still real money, but it
    // is an overpayment awaiting human reconciliation: it must not look like a normal payment
    // in the audit trail. Staleness is decided from facts here, so every path that applies a
    // capture — browser, webhook, owner read — marks it the same way.
    if (applied) {
      const guest = await findGuestById(client, current.guest_id);
      const stale =
        !LIVE_FOR_CAPTURE.has(current.status) ||
        event.archived ||
        guest?.obligation_version !== current.obligation_version;
      await audit(client, current.event_id, stale ? 'payment_captured_stale_order' : 'payment_captured');
    }

    return { applied, duplicate: !applied, captureId, amountCents };
  });
}

export interface RefundOutcome {
  applied: boolean;
  duplicate: boolean;
  refundId?: string;
  reason?: string;
  /** True while the refund may still become applicable: retry it instead of consuming it. */
  transient?: boolean;
  /** Event the refund belongs to, when we got far enough to know it. */
  eventId?: string;
}

interface LedgerBase {
  order_id: string;
  event_id: string;
  guest_id: string;
  captured: string | null;
  refunded: string | null;
}

const CAPTURE_SUMS = `SELECT order_id, event_id, guest_id,
          SUM(CASE WHEN kind = 'capture' THEN amount_cents ELSE 0 END) AS captured,
          SUM(CASE WHEN kind = 'refund' THEN amount_cents ELSE 0 END) AS refunded
     FROM payment_ledger
     WHERE capture_id = $1
     GROUP BY order_id, event_id, guest_id`;

/**
 * Applies a refund once. The refund must point at a capture we already recorded and must not
 * exceed what is still refundable on it; a redelivered webhook changes nothing.
 *
 * Order matters here. The duplicate check runs first and under the event lock, so a refund
 * redelivered with a fresh webhook id is reported as the duplicate it is instead of as "exceeds
 * the capture" once the balance has already dropped to zero. The balance itself is then
 * recomputed inside the same transaction, so two different refunds racing each other cannot
 * both read a stale remainder and together give back more than was captured.
 */
export async function convergeRefund(pool: Pool, paypal: PayPalAdapter, refundId: string): Promise<RefundOutcome> {
  const refund = await paypal.getRefund(refundId);
  const externalId = refund?.id;
  if (typeof externalId !== 'string') {
    return { applied: false, duplicate: false, reason: 'Reembolso sin identificador', transient: false };
  }
  const captureId = captureIdFromRefund(refund);
  if (!captureId) {
    return { applied: false, duplicate: false, reason: 'El reembolso no referencia una captura', transient: false };
  }

  // Only used to pick the row to lock. Captures are never deleted, so this cannot go stale in a
  // way that matters: every amount is read again inside the transaction below.
  const located = await pool.query<{ event_id: string }>(
    `SELECT event_id FROM payment_ledger WHERE capture_id = $1 AND kind = 'capture' LIMIT 1`,
    [captureId],
  );
  const eventId = located.rows[0]?.event_id;
  if (!eventId) {
    // The capture notification may simply be behind the refund notification.
    return {
      applied: false,
      duplicate: false,
      reason: 'No hay captura registrada para ese reembolso',
      transient: true,
    };
  }

  return withTransaction(pool, async (client) => {
    await lockEvent(client, eventId);

    const seen = await client.query<{ id: string }>(
      `SELECT id FROM payment_ledger WHERE kind = 'refund' AND external_id = $1`,
      [externalId],
    );
    if (seen.rows.length > 0) {
      return { applied: false, duplicate: true, refundId: externalId, eventId };
    }

    const { rows } = await client.query<LedgerBase>(CAPTURE_SUMS, [captureId]);
    const base = rows[0];
    const captured = sumToCents(base?.captured);
    if (!base || captured < 1) {
      return {
        applied: false,
        duplicate: false,
        reason: 'No hay captura registrada para ese reembolso',
        transient: true,
        eventId,
      };
    }

    const check = verifyRefund(refund, {
      currency: 'USD',
      knownCaptureIds: [captureId],
      maxRefundableCents: captured - sumToCents(base.refunded),
    });
    if (!check.ok) {
      return {
        applied: false,
        duplicate: false,
        reason: check.reason,
        transient: check.transient,
        eventId: base.event_id,
      };
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO payment_ledger (id, event_id, guest_id, order_id, kind, amount_cents, external_id, capture_id)
         VALUES ($1, $2, $3, $4, 'refund', $5, $6, $7)
       ON CONFLICT (kind, external_id) DO NOTHING
       RETURNING id`,
      [newId(), base.event_id, base.guest_id, base.order_id, check.amountCents, check.refundId, check.captureId],
    );
    const applied = inserted.rows.length > 0;
    if (applied) await audit(client, base.event_id, 'payment_refunded');
    // A refund lowers the collected progress; it never cancels the event by itself.
    return { applied, duplicate: !applied, refundId: check.refundId, eventId: base.event_id };
  });
}
