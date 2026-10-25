import type { Queryable } from './read.js';

/** Audit actions are a closed vocabulary: the dashboard exposes only action + timestamp. */
export type AuditAction =
  | 'event_created'
  | 'demo_seeded'
  | 'demo_reset'
  | 'guest_joined'
  | 'rsvp_updated'
  | 'quote_created'
  | 'order_created'
  | 'order_superseded'
  | 'payment_captured'
  // Verified money captured on an order that was no longer the live obligation: real, counted
  // once, and flagged apart from a normal payment because it is an overpayment to reconcile.
  | 'payment_captured_stale_order'
  | 'payment_refunded'
  // PayPal reported a declined capture: nothing is ever marked paid from it.
  | 'payment_capture_declined'
  // A capture call succeeded but its order failed verification (receiver, amount, currency):
  // the claim stays frozen for a human instead of being released or marked paid.
  | 'payment_capture_unverified'
  // A signed notification that can never apply: recorded so it is not retried forever.
  | 'payment_webhook_rejected'
  // A reversal (chargeback-like) that we cannot price automatically.
  | 'payment_reversal_manual'
  // A stale capture claim released after PayPal confirmed no capture exists.
  | 'payment_claim_released'
  | 'event_confirmed'
  | 'chat_message';

export async function audit(db: Queryable, eventId: string | null, action: AuditAction): Promise<void> {
  await db.query('INSERT INTO audit_log (event_id, action) VALUES ($1, $2)', [eventId, action]);
}

export async function auditTrail(
  db: Queryable,
  eventId: string,
  limit = 50,
): Promise<{ action: string; createdAt: string }[]> {
  const { rows } = await db.query<{ action: string; created_at: Date }>(
    'SELECT action, created_at FROM audit_log WHERE event_id = $1 ORDER BY id DESC LIMIT $2',
    [eventId, limit],
  );
  return rows.map((r) => ({ action: r.action, createdAt: r.created_at.toISOString() }));
}
