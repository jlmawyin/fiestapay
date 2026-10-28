/** Bounded reconcile schedule for an external PayPal return. Not a payment decision. */

export const RETURN_RETRY_DELAYS_MS = [2_000, 4_000, 8_000] as const;
export const RETURN_BUDGET_MS = 20_000;

export type ReturnServerAction = 'capture' | 'retry' | 'stop';

const CAPTURE_STATUSES = new Set(['approved', 'paid', 'capturing']);

/** Server order status decides the next step. Focus, storage, and URL flags never do. */
export function returnServerAction(status: string): ReturnServerAction {
  if (CAPTURE_STATUSES.has(status)) return 'capture';
  if (status === 'created') return 'retry';
  return 'stop';
}

/**
 * Delay before another GET. `finishedGets` is how many reconciles already finished.
 * The first GET is immediate and is not a delay. Null means stop.
 */
export function nextReturnDelay(finishedGets: number, startedAt: number, now: number): number | null {
  if (!Number.isFinite(finishedGets) || finishedGets < 1) return null;
  if (!Number.isFinite(startedAt) || !Number.isFinite(now) || now < startedAt) return null;
  const delay = RETURN_RETRY_DELAYS_MS[finishedGets - 1];
  if (delay === undefined) return null;
  const elapsed = now - startedAt;
  if (elapsed >= RETURN_BUDGET_MS) return null;
  if (elapsed + delay > RETURN_BUDGET_MS) return null;
  return delay;
}
