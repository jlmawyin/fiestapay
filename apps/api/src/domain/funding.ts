import type { EventInput, FundingStatus } from '@fiestapay/shared';
import { withTransaction, sumToCents, type Pool, type PoolClient } from '../db/pool.js';
import { badRequest, conflict } from '../errors.js';
import { newId } from '../lib/ids.js';
import { centsToUsd } from '../lib/money.js';
import { audit } from './audit.js';
import { EVENT_COLUMNS, lockEvent, type EventRow } from './read.js';

const UNIQUE_VIOLATION = '23505';

/**
 * Read only after the event row lock is held. Transaction `now()` is the start
 * of the transaction, so a lock wait can make it older than the deadline.
 * Callers pass this instant into the ledger row as well. It is never moved
 * backward to make a late capture look on time.
 */
const defaultClock = (): Date => new Date();
let fundingClock: () => Date = defaultClock;

export function fundingNow(): Date {
  return fundingClock();
}

/** Test-only. Production keeps the wall clock. */
export function setFundingClockForTests(clock: (() => Date) | null): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('El reloj de financiamiento solo se sustituye en pruebas');
  fundingClock = clock ?? defaultClock;
}

export interface FundingInstant {
  event: EventRow;
  /** Instant read after the caller locked the event. */
  at: Date;
}

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION;

export function assertDeadlineOpen(deadline: Date, startsAt: Date, now: Date): void {
  if (Number.isNaN(deadline.getTime()) || Number.isNaN(startsAt.getTime())) throw badRequest('Fecha limite invalida');
  if (deadline.getTime() <= now.getTime()) throw badRequest('La fecha limite debe ser posterior a este momento');
  if (deadline.getTime() > startsAt.getTime()) throw badRequest('La fecha limite no puede ser posterior al inicio');
}

/** New events only. A minimum with no explicit deadline is armed at startsAt. */
export function fundingForNewEvent(input: EventInput, now: Date): { status: 'inactive' | 'open'; deadline: Date | null } {
  const startsAt = new Date(input.startsAt);
  if (input.minimumCents === null) {
    if (typeof input.fundingDeadlineAt === 'string') throw badRequest('Sin minimo no hay fecha limite de financiamiento');
    return { status: 'inactive', deadline: null };
  }
  const deadline = input.fundingDeadlineAt ? new Date(input.fundingDeadlineAt) : startsAt;
  assertDeadlineOpen(deadline, startsAt, now);
  return { status: 'open', deadline };
}

const sameTime = (left: Date | null, right: Date | null): boolean => {
  if (left === null || right === null) return left === right;
  return left.getTime() === right.getTime();
};

/**
 * Update rules. Omission preserves a legacy NULL deadline. Title edits and an
 * explicit deadline both leave that exemption in place. Funded and failed never move.
 */
export function nextFundingTerms(
  event: EventRow,
  input: EventInput,
  startsAt: Date,
  orderCount: number,
  now: Date,
): { status: FundingStatus; deadline: Date | null } {
  const omitted = input.fundingDeadlineAt === undefined;
  const requested: Date | null | undefined = omitted
    ? undefined
    : input.fundingDeadlineAt === null
      ? null
      : new Date(input.fundingDeadlineAt);
  if (requested instanceof Date && Number.isNaN(requested.getTime())) throw badRequest('Fecha limite invalida');
  const deadlineChanged = requested !== undefined && !sameTime(event.funding_deadline_at, requested);
  const minimumChanged = event.minimum_cents !== input.minimumCents;
  const frozen = event.funding_status === 'funded' || event.funding_status === 'failed';
  if (frozen && (deadlineChanged || minimumChanged)) throw conflict('La decision de financiamiento ya es definitiva');
  if (orderCount > 0 && (deadlineChanged || minimumChanged)) {
    throw conflict('No se pueden cambiar el minimo ni la fecha limite cuando ya hay una orden');
  }
  if (!deadlineChanged && !minimumChanged) {
    if (event.funding_deadline_at && event.funding_deadline_at.getTime() > startsAt.getTime()) {
      throw conflict('La fecha limite de financiamiento quedaria despues del inicio');
    }
    return { status: event.funding_status, deadline: event.funding_deadline_at };
  }
  if (input.minimumCents === null) {
    if (requested) throw badRequest('Sin minimo no hay fecha limite de financiamiento');
    return { status: 'inactive', deadline: null };
  }
  // Legacy NULL stays exempt, including a pre-migration minimum. A title edit omits
  // the deadline. Sending one does not opt the row in.
  if (event.funding_status === 'legacy') {
    if (deadlineChanged) throw badRequest('Un evento anterior conserva la exencion y no admite fecha limite');
    return { status: 'legacy', deadline: null };
  }

  const deadline = !omitted ? requested ?? null : event.funding_deadline_at ?? startsAt;
  if (deadline === null) throw badRequest('Un minimo requiere fecha limite de financiamiento');
  assertDeadlineOpen(deadline, startsAt, now);
  return { status: 'open', deadline };
}

/** Null when a new charge may start. Failed, and a due row not yet decided, block. */
export function fundingBlocksNewCharge(event: EventRow, at: Date): string | null {
  if (event.funding_status === 'failed') return 'El minimo no se alcanzo a tiempo; no se inician cobros nuevos';
  if (
    event.funding_status === 'open' &&
    event.funding_deadline_at &&
    at.getTime() >= event.funding_deadline_at.getTime()
  ) {
    return 'La fecha limite de financiamiento vencio; el cobro espera la decision';
  }
  return null;
}

async function basisBefore(client: PoolClient, eventId: string, deadline: Date): Promise<number> {
  const { rows } = await client.query<{ net: string | null }>(
    `SELECT COALESCE(SUM(
        CASE
          WHEN kind = 'capture' AND created_at < $2::timestamptz THEN amount_cents
          WHEN kind = 'refund' AND created_at < $2::timestamptz THEN -amount_cents
          ELSE 0
        END
      ), 0) AS net
       FROM payment_ledger
      WHERE event_id = $1`,
    [eventId, deadline.toISOString()],
  );
  return sumToCents(rows[0]?.net);
}

/**
 * Full refund is an empty JSON object. A smaller outstanding balance is a partial
 * amount. The string is stored and resent byte-for-byte.
 */
export function refundRequestBody(capturedCents: number, remainingCents: number): string {
  if (!Number.isSafeInteger(capturedCents) || !Number.isSafeInteger(remainingCents)) {
    throw new Error('Centavos de reembolso invalidos');
  }
  if (remainingCents < 1 || remainingCents > capturedCents) throw new Error('Restante de reembolso invalido');
  if (remainingCents === capturedCents) return '{}';
  return JSON.stringify({ amount: { currency_code: 'USD', value: centsToUsd(remainingCents) } });
}

interface CaptureBalance {
  capture_id: string;
  order_id: string;
  guest_id: string;
  captured: string | null;
  refunded: string | null;
}

interface TaskHead {
  id: string;
  amount_cents: number;
  status: string;
  attempt_count: number;
  paypal_refund_id: string | null;
  lease_token: string | null;
}

/**
 * One active task per capture for the outstanding verified balance.
 * A task that has not been sent can be resized. A sent body is never edited
 * and does not get a second request id while it is still active.
 * Ledger refunds, and only those, close a task.
 */
export async function syncRefundTasks(client: PoolClient, eventId: string): Promise<void> {
  const { rows } = await client.query<CaptureBalance>(
    `SELECT capture_id, order_id, guest_id,
            SUM(CASE WHEN kind = 'capture' THEN amount_cents ELSE 0 END) AS captured,
            SUM(CASE WHEN kind = 'refund' THEN amount_cents ELSE 0 END) AS refunded
       FROM payment_ledger
      WHERE event_id = $1
      GROUP BY capture_id, order_id, guest_id`,
    [eventId],
  );

  for (const row of rows) {
    const captured = sumToCents(row.captured);
    const refunded = sumToCents(row.refunded);
    const remaining = captured - refunded;
    if (captured < 1) continue;

    if (remaining < 1 && refunded > 0) {
      await client.query(
        `UPDATE funding_refund_tasks
            SET status = 'refunded',
                lease_owner = NULL,
                lease_token = NULL,
                lease_until = NULL,
                updated_at = clock_timestamp()
          WHERE capture_id = $1
            AND status IN ('pending', 'leased', 'pending_provider', 'needs_review')`,
        [row.capture_id],
      );
      continue;
    }
    if (remaining < 1) continue;

    const active = await client.query<TaskHead>(
      `SELECT id, amount_cents, status, attempt_count, paypal_refund_id, lease_token
         FROM funding_refund_tasks
        WHERE capture_id = $1
          AND status IN ('pending', 'leased', 'pending_provider', 'needs_review')
        ORDER BY created_at
        LIMIT 1`,
      [row.capture_id],
    );
    const task = active.rows[0];
    if (task) {
      const unsent = task.status === 'pending' && task.attempt_count === 0 && task.paypal_refund_id === null && task.lease_token === null;
      if (unsent && task.amount_cents !== remaining) {
        await client.query(
          `UPDATE funding_refund_tasks
              SET amount_cents = $2, request_body = $3, updated_at = clock_timestamp()
            WHERE id = $1 AND status = 'pending' AND attempt_count = 0 AND paypal_refund_id IS NULL`,
          [task.id, remaining, refundRequestBody(captured, remaining)],
        );
      } else if (!unsent && task.amount_cents !== remaining && task.status !== 'leased' && task.status !== 'needs_review') {
        await client.query(
          `UPDATE funding_refund_tasks
              SET status = 'needs_review',
                  last_error = $2,
                  lease_owner = NULL,
                  lease_token = NULL,
                  lease_until = NULL,
                  updated_at = clock_timestamp()
            WHERE id = $1 AND status = $3`,
          [task.id, 'El saldo cambio despues de enviar una solicitud inmutable', task.status],
        );
      }
      continue;
    }

    const prior = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM funding_refund_tasks WHERE capture_id = $1`,
      [row.capture_id],
    );
    const generation = (prior.rows[0]?.n ?? 0) + 1;
    const id = newId();
    try {
      await client.query(
        `INSERT INTO funding_refund_tasks (
           id, event_id, order_id, guest_id, capture_id, amount_cents, currency,
           request_id, request_body, status
         ) VALUES ($1,$2,$3,$4,$5,$6,'USD',$7,$8,'pending')`,
        [
          id,
          eventId,
          row.order_id,
          row.guest_id,
          row.capture_id,
          remaining,
          `fp-rfd-${id}`,
          refundRequestBody(captured, remaining),
        ],
      );
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
}

/**
 * Decide only when the post-lock instant is at or after the deadline.
 * The basis excludes ledger rows timestamped at or after that deadline, and
 * this function does not insert money. Failed closes the event and is permanent.
 */
export async function decideFundingIfDue(client: PoolClient, event: EventRow): Promise<FundingInstant> {
  const at = fundingNow();
  if (event.funding_status !== 'open' || !event.funding_deadline_at || event.minimum_cents === null) {
    return { event, at };
  }
  if (at.getTime() < event.funding_deadline_at.getTime()) return { event, at };

  const basis = await basisBefore(client, event.id, event.funding_deadline_at);
  const failed = basis < event.minimum_cents;
  const status = failed ? 'failed' : 'funded';
  const { rows } = await client.query<EventRow>(
    `UPDATE events SET
       funding_status = $2,
       funding_decided_at = $3::timestamptz,
       funding_basis_cents = $4,
       confirmed = CASE WHEN $2 = 'failed' THEN false ELSE confirmed END,
       closed_at = CASE WHEN $2 = 'failed' THEN COALESCE(closed_at, $3::timestamptz) ELSE closed_at END
     WHERE id = $1 AND funding_status = 'open'
     RETURNING ${EVENT_COLUMNS}`,
    [event.id, status, at.toISOString(), basis],
  );
  const updated = rows[0] ?? (await lockEvent(client, event.id));
  if (rows[0]) {
    await audit(client, event.id, failed ? 'funding_failed' : 'funding_met');
    if (failed) await syncRefundTasks(client, event.id);
  }
  return { event: updated, at };
}

export async function decideDueEvents(pool: Pool, batch = 20): Promise<number> {
  let decided = 0;
  for (let round = 0; round < 5; round += 1) {
    const count = await withTransaction(pool, async (client) => {
      const due = await client.query<{ id: string }>(
        `SELECT id FROM events
          WHERE funding_status = 'open'
            AND funding_deadline_at IS NOT NULL
            AND funding_deadline_at <= $1::timestamptz
          ORDER BY funding_deadline_at, id
          LIMIT $2
          FOR UPDATE SKIP LOCKED`,
        [fundingNow().toISOString(), batch],
      );
      let n = 0;
      for (const row of due.rows) {
        const locked = await lockEvent(client, row.id);
        if (locked.funding_status !== 'open') continue;
        const settled = await decideFundingIfDue(client, locked);
        if (settled.event.funding_status !== 'open') n += 1;
      }
      return n;
    });
    decided += count;
    if (count === 0) break;
  }
  return decided;
}

/** Recompute unsent tasks for events already failed, including tombstoned ones. */
export async function refreshFailedRefunds(pool: Pool, batch = 50): Promise<number> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM events WHERE funding_status = 'failed' ORDER BY funding_decided_at NULLS FIRST, id LIMIT $1`,
    [batch],
  );
  let touched = 0;
  for (const row of rows) {
    await withTransaction(pool, async (client) => {
      const locked = await lockEvent(client, row.id);
      if (locked.funding_status !== 'failed') return;
      await syncRefundTasks(client, locked.id);
    });
    touched += 1;
  }
  return touched;
}
