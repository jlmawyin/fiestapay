import { randomUUID } from 'node:crypto';
import { withTransaction, type Pool, type PoolClient } from '../db/pool.js';
import { PayPalError, type PayPalAdapter, type PayPalRefund } from '../paypal/types.js';
import { captureIdFromRefund } from '../paypal/verify.js';
import { usdToCents } from '../lib/money.js';
import { lockEvent } from './read.js';
import { decideDueEvents, fundingNow, refreshFailedRefunds } from './funding.js';
import { convergeRefund } from './payments.js';

/** OAuth retries plus the refund POST and the follow-up GET, each with one replay. */
export const FUNDING_LEASE_ATTEMPTS = 16;

export function fundingLeaseMs(timeoutMs: number): number {
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 120_000) : 12_000;
  return Math.min(FUNDING_LEASE_ATTEMPTS * timeout + 15_000, 30 * 60 * 1000);
}

const defaultBackoff = (attempt: number): number => Math.min(15 * 60 * 1000, 1000 * 2 ** Math.min(Math.max(attempt, 0), 10));

export interface FundingPassOptions {
  timeoutMs?: number;
  leaseMs?: number;
  batch?: number;
  owner?: string;
  backoffMs?: (attempt: number) => number;
}

export interface FundingPassResult {
  decided: number;
  refreshed: number;
  claimed: number;
  refunded: number;
  pending: number;
  review: number;
}

interface TaskRow {
  id: string;
  event_id: string;
  capture_id: string;
  amount_cents: number;
  request_id: string;
  request_body: string;
  paypal_refund_id: string | null;
  status: string;
  attempt_count: number;
  lease_token: string | null;
}

const ambiguous = (err: PayPalError): boolean =>
  err.timeout || err.status === null || err.status >= 500 || err.status === 429;

async function claimBatch(pool: Pool, owner: string, leaseMs: number, batch: number): Promise<TaskRow[]> {
  const nowMs = fundingNow().getTime();
  const now = new Date(nowMs).toISOString();
  const until = new Date(nowMs + leaseMs).toISOString();
  return withTransaction(pool, async (client) => {
    const { rows } = await client.query<TaskRow>(
      `WITH picked AS (
         SELECT id FROM funding_refund_tasks
          WHERE (
            status IN ('pending', 'pending_provider')
            AND next_attempt_at <= $3::timestamptz
            AND (lease_until IS NULL OR lease_until <= $3::timestamptz)
          ) OR (
            status = 'leased' AND lease_until <= $3::timestamptz
          )
          ORDER BY next_attempt_at, id
          LIMIT $4
          FOR UPDATE SKIP LOCKED
       )
       UPDATE funding_refund_tasks t
          SET status = 'leased',
              lease_owner = $1,
              lease_token = gen_random_uuid()::text,
              lease_until = $2::timestamptz,
              attempt_count = attempt_count + 1,
              updated_at = clock_timestamp()
         FROM picked
        WHERE t.id = picked.id
        RETURNING t.id, t.event_id, t.capture_id, t.amount_cents, t.request_id, t.request_body,
                  t.paypal_refund_id, t.status, t.attempt_count, t.lease_token`,
      [owner, until, now, batch],
    );
    return rows;
  });
}

async function stillLeased(client: PoolClient, id: string, token: string): Promise<TaskRow | null> {
  const { rows } = await client.query<TaskRow>(
    `SELECT id, event_id, capture_id, amount_cents, request_id, request_body, paypal_refund_id,
            status, attempt_count, lease_token
       FROM funding_refund_tasks
      WHERE id = $1 AND lease_token = $2 AND status = 'leased'
      FOR UPDATE`,
    [id, token],
  );
  return rows[0] ?? null;
}

async function releaseRetry(pool: Pool, id: string, token: string, attempt: number, reason: string, backoffMs: (n: number) => number): Promise<boolean> {
  const when = new Date(fundingNow().getTime() + backoffMs(attempt)).toISOString();
  const { rowCount } = await pool.query(
    `UPDATE funding_refund_tasks
        SET status = 'pending',
            lease_owner = NULL,
            lease_token = NULL,
            lease_until = NULL,
            next_attempt_at = $3::timestamptz,
            last_error = $4,
            updated_at = clock_timestamp()
      WHERE id = $1 AND lease_token = $2 AND status = 'leased'`,
    [id, token, when, reason.slice(0, 500)],
  );
  return (rowCount ?? 0) > 0;
}

async function markReview(pool: Pool, id: string, token: string, reason: string, refundId: string | null): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE funding_refund_tasks
        SET status = 'needs_review',
            paypal_refund_id = COALESCE(paypal_refund_id, $3),
            lease_owner = NULL,
            lease_token = NULL,
            lease_until = NULL,
            last_error = $4,
            updated_at = clock_timestamp()
      WHERE id = $1 AND lease_token = $2 AND status = 'leased'`,
    [id, token, refundId, reason.slice(0, 500)],
  );
  return (rowCount ?? 0) > 0;
}

async function markRejected(pool: Pool, id: string, token: string, reason: string, refundId: string | null): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE funding_refund_tasks
        SET status = 'rejected',
            paypal_refund_id = COALESCE(paypal_refund_id, $3),
            lease_owner = NULL,
            lease_token = NULL,
            lease_until = NULL,
            last_error = $4,
            updated_at = clock_timestamp()
      WHERE id = $1 AND lease_token = $2 AND status = 'leased'`,
    [id, token, refundId, reason.slice(0, 500)],
  );
  return (rowCount ?? 0) > 0;
}

async function markPendingProvider(pool: Pool, id: string, token: string, refundId: string, attempt: number, backoffMs: (n: number) => number): Promise<boolean> {
  const when = new Date(fundingNow().getTime() + backoffMs(attempt)).toISOString();
  const { rowCount } = await pool.query(
    `UPDATE funding_refund_tasks
        SET status = 'pending_provider',
            paypal_refund_id = $3,
            lease_owner = NULL,
            lease_token = NULL,
            lease_until = NULL,
            next_attempt_at = $4::timestamptz,
            last_error = NULL,
            updated_at = clock_timestamp()
      WHERE id = $1 AND lease_token = $2 AND status = 'leased'`,
    [id, token, refundId, when],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Closes a leased task only when this lease still owns it and the ledger has
 * the refund. A stale worker's token updates nothing, including a terminal row.
 */
export async function completeLeasedRefund(pool: Pool, id: string, token: string, refundId: string): Promise<boolean> {
  return withTransaction(pool, async (client) => {
    const task = await stillLeased(client, id, token);
    if (!task) return false;
    await lockEvent(client, task.event_id);
    const ledger = await client.query(
      `SELECT 1 FROM payment_ledger WHERE kind = 'refund' AND external_id = $1 AND capture_id = $2`,
      [refundId, task.capture_id],
    );
    if ((ledger.rowCount ?? 0) < 1) return false;
    const updated = await client.query(
      `UPDATE funding_refund_tasks
          SET status = 'refunded',
              paypal_refund_id = COALESCE(paypal_refund_id, $3),
              lease_owner = NULL,
              lease_token = NULL,
              lease_until = NULL,
              last_error = NULL,
              updated_at = clock_timestamp()
        WHERE id = $1 AND lease_token = $2 AND status = 'leased'`,
      [id, token, refundId],
    );
    return (updated.rowCount ?? 0) > 0;
  });
}

function refundMatches(task: TaskRow, refund: PayPalRefund): boolean {
  if (refund.status !== 'COMPLETED' || typeof refund.id !== 'string') return false;
  if (refund.amount?.currency_code !== 'USD') return false;
  const amount = usdToCents(refund.amount?.value);
  if (amount === null || amount !== task.amount_cents) return false;
  return captureIdFromRefund(refund) === task.capture_id;
}

async function executeTask(
  pool: Pool,
  paypal: PayPalAdapter,
  task: TaskRow,
  backoffMs: (n: number) => number,
): Promise<'refunded' | 'pending' | 'review'> {
  const token = task.lease_token;
  if (!token) return 'review';
  let refund: PayPalRefund | null = null;
  try {
    refund = task.paypal_refund_id
      ? await paypal.getRefund(task.paypal_refund_id)
      : await paypal.refundCapture({ captureId: task.capture_id, requestId: task.request_id, body: task.request_body });
  } catch (err) {
    if (!(err instanceof PayPalError) || ambiguous(err)) {
      await releaseRetry(pool, task.id, token, task.attempt_count, err instanceof Error ? err.message : 'error de red', backoffMs);
      return 'pending';
    }
    // 422 and any other definite 4xx are not completion. The body stays put.
    await markReview(pool, task.id, token, err.message, null);
    return 'review';
  }

  if (!refund || typeof refund.id !== 'string' || refund.id.length === 0) {
    await releaseRetry(pool, task.id, token, task.attempt_count, 'respuesta de reembolso sin identificador', backoffMs);
    return 'pending';
  }
  if (refund.status === 'PENDING') {
    await markPendingProvider(pool, task.id, token, refund.id, task.attempt_count, backoffMs);
    return 'pending';
  }
  if (refund.status === 'FAILED' || refund.status === 'CANCELLED') {
    await markRejected(pool, task.id, token, `PayPal informo ${refund.status}`, refund.id);
    return 'review';
  }
  if (!refundMatches(task, refund)) {
    await markReview(pool, task.id, token, 'El reembolso devuelto no coincide con el monto, la moneda o la captura', refund.id);
    return 'review';
  }

  const outcome = await convergeRefund(pool, paypal, refund.id);
  const closed = await completeLeasedRefund(pool, task.id, token, refund.id);
  if (closed) return 'refunded';
  const { rows } = await pool.query<{ status: string }>(
    'SELECT status FROM funding_refund_tasks WHERE id = $1',
    [task.id],
  );
  // The ledger path may already have closed the task inside convergeRefund.
  if (rows[0]?.status === 'refunded') return 'refunded';
  if (outcome.transient) {
    await markPendingProvider(pool, task.id, token, refund.id, task.attempt_count, backoffMs);
    return 'pending';
  }
  await markReview(pool, task.id, token, outcome.reason ?? 'El libro mayor no registro el reembolso', refund.id);
  return 'review';
}

/**
 * One deterministic pass: decide overdue events (including closed, archived and
 * tombstoned), refresh failed refunds, then lease a batch. HTTP happens only
 * after the lease transaction commits. Tests call this directly. The process
 * loop is not started in tests.
 */
export async function runFundingPass(
  pool: Pool,
  paypal: PayPalAdapter | null,
  opts: FundingPassOptions = {},
): Promise<FundingPassResult> {
  const decided = await decideDueEvents(pool);
  const refreshed = await refreshFailedRefunds(pool);
  const result: FundingPassResult = { decided, refreshed, claimed: 0, refunded: 0, pending: 0, review: 0 };
  if (!paypal) return result;

  const leaseMs = opts.leaseMs ?? fundingLeaseMs(opts.timeoutMs ?? 12_000);
  const backoffMs = opts.backoffMs ?? defaultBackoff;
  const claimed = await claimBatch(pool, opts.owner ?? `fp-${process.pid}-${randomUUID()}`, leaseMs, opts.batch ?? 20);
  result.claimed = claimed.length;
  for (const task of claimed) {
    const outcome = await executeTask(pool, paypal, task, backoffMs);
    result[outcome] += 1;
  }
  return result;
}

/**
 * Startup tick plus a bounded interval. The returned function waits for the
 * tick that is already inside HTTP or a transaction. Overlapping ticks are skipped.
 */
export function startFundingLoop(
  pool: Pool,
  paypal: PayPalAdapter | null,
  onError: (err: unknown) => void,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): () => Promise<void> {
  let stopped = false;
  let current: Promise<void> | null = null;
  const tick = (): void => {
    if (stopped || current) return;
    current = runFundingPass(pool, paypal, { timeoutMs: opts.timeoutMs ?? 12_000 })
      .then(() => undefined)
      .catch(onError)
      .finally(() => {
        current = null;
      });
  };
  tick();
  const timer = setInterval(tick, opts.intervalMs ?? 60_000);
  timer.unref?.();
  return async () => {
    stopped = true;
    clearInterval(timer);
    if (current) await current;
  };
}
