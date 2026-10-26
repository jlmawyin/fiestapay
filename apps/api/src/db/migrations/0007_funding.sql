-- Funding deadline and durable refund tasks. Additive only.
-- Existing rows keep funding_deadline_at NULL and funding_status 'legacy'.
-- NULL deadline on a legacy row is an exemption: never auto-refund, including a
-- pre-migration minimum such as the golden USD 50 capture. A later title edit
-- must not fill this in. New rows are written explicitly by the application:
-- inactive when there is no minimum, open when a deadline is armed.
--
-- ROLLBACK LIMITATION: applying this file does not make an older application
-- image safe to put back in front of the database.
-- * closed_at written when a decision fails is visible to old code, so that
--   image still refuses new RSVPs and new charges on an already-failed event.
-- * Old code ignores funding_status. It will not decide an still-open deadline
--   and it will not run the refund worker. Captures after the deadline can be
--   counted as ordinary payments, and queued refunds stay unsent.
-- * Drain pending, leased and pending_provider tasks, and decide every open
--   row, before serving with an old image. There is no tested down-migration.
-- * Do not drop funding_refund_tasks. They are not children of events and must
--   survive a tombstone or a row delete. This file declares no delete cascade.

ALTER TABLE events ADD COLUMN funding_deadline_at timestamptz;
ALTER TABLE events ADD COLUMN funding_status text NOT NULL DEFAULT 'legacy';
ALTER TABLE events ADD COLUMN funding_decided_at timestamptz;
ALTER TABLE events ADD COLUMN funding_basis_cents integer;

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_funding_status_ck;
ALTER TABLE events ADD CONSTRAINT events_funding_status_ck
  CHECK (funding_status IN ('legacy', 'inactive', 'open', 'funded', 'failed'));

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_funding_shape_ck;
ALTER TABLE events ADD CONSTRAINT events_funding_shape_ck CHECK (
  (
    funding_status IN ('legacy', 'inactive')
    AND funding_deadline_at IS NULL
    AND funding_decided_at IS NULL
    AND funding_basis_cents IS NULL
  )
  OR (
    funding_status = 'open'
    AND funding_deadline_at IS NOT NULL
    AND funding_decided_at IS NULL
    AND funding_basis_cents IS NULL
  )
  OR (
    funding_status IN ('funded', 'failed')
    AND funding_deadline_at IS NOT NULL
    AND funding_decided_at IS NOT NULL
    AND funding_basis_cents IS NOT NULL
  )
);

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_funding_deadline_before_start_ck;
ALTER TABLE events ADD CONSTRAINT events_funding_deadline_before_start_ck
  CHECK (funding_deadline_at IS NULL OR funding_deadline_at <= starts_at);

-- Due sweep. Closed, archived and tombstoned rows stay in this index on purpose:
-- deleting or purging before the deadline must not exempt the money.
CREATE INDEX events_funding_due_idx
  ON events (funding_deadline_at)
  WHERE funding_status = 'open';

-- Immutable refund work. event_id, order_id, guest_id and capture_id are copies,
-- not foreign keys, so a later schema change cannot cascade these rows away.
CREATE TABLE funding_refund_tasks (
  id                uuid PRIMARY KEY,
  event_id          uuid NOT NULL,
  order_id          uuid NOT NULL,
  guest_id          uuid NOT NULL,
  capture_id        text NOT NULL,
  amount_cents      integer NOT NULL CHECK (amount_cents >= 1),
  currency          text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  request_id        text NOT NULL UNIQUE,
  request_body      text NOT NULL,
  paypal_refund_id  text,
  status            text NOT NULL CHECK (status IN (
                      'pending', 'leased', 'pending_provider', 'needs_review', 'rejected', 'refunded'
                    )),
  attempt_count     integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  lease_owner       text,
  lease_token       text,
  lease_until       timestamptz,
  next_attempt_at   timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_error        text,
  created_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at        timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- At most one refund attempt is in flight for a capture. A rejected attempt stays
-- as history and a later row may use a new request id. refunded is not "in flight".
CREATE UNIQUE INDEX funding_refund_one_active_idx
  ON funding_refund_tasks (capture_id)
  WHERE status IN ('pending', 'leased', 'pending_provider', 'needs_review');

CREATE INDEX funding_refund_due_idx
  ON funding_refund_tasks (next_attempt_at)
  WHERE status IN ('pending', 'pending_provider', 'leased');

CREATE INDEX funding_refund_event_idx ON funding_refund_tasks (event_id);

DO $fp$
DECLARE
  sch text := current_schema();
BEGIN
  EXECUTE format($fn$
    CREATE OR REPLACE FUNCTION %1$I.fiestapay_guard_funding_refund_task()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO %1$I, pg_catalog
    AS $body$
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF (NEW.request_body IS DISTINCT FROM OLD.request_body
            OR NEW.request_id IS DISTINCT FROM OLD.request_id
            OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
            OR NEW.capture_id IS DISTINCT FROM OLD.capture_id
            OR NEW.event_id IS DISTINCT FROM OLD.event_id
            OR NEW.order_id IS DISTINCT FROM OLD.order_id
            OR NEW.guest_id IS DISTINCT FROM OLD.guest_id)
           AND (OLD.attempt_count > 0 OR OLD.paypal_refund_id IS NOT NULL OR OLD.status <> 'pending') THEN
          RAISE EXCEPTION 'solicitud de reembolso inmutable';
        END IF;
        IF NEW.status = 'refunded' AND OLD.status IS DISTINCT FROM 'refunded'
           AND NOT EXISTS (
             SELECT 1 FROM payment_ledger
              WHERE capture_id = NEW.capture_id AND kind = 'refund'
           ) THEN
          RAISE EXCEPTION 'un reembolso de financiamiento solo cierra con el libro mayor';
        END IF;
      ELSIF TG_OP = 'INSERT' AND NEW.status = 'refunded'
            AND NOT EXISTS (
              SELECT 1 FROM payment_ledger
               WHERE capture_id = NEW.capture_id AND kind = 'refund'
            ) THEN
        RAISE EXCEPTION 'un reembolso de financiamiento solo cierra con el libro mayor';
      END IF;
      RETURN NEW;
    END;
    $body$
  $fn$, sch);

  EXECUTE format('DROP TRIGGER IF EXISTS funding_refund_tasks_guard ON %1$I.funding_refund_tasks', sch);
  EXECUTE format(
    'CREATE TRIGGER funding_refund_tasks_guard BEFORE INSERT OR UPDATE ON %1$I.funding_refund_tasks FOR EACH ROW EXECUTE FUNCTION %1$I.fiestapay_guard_funding_refund_task()',
    sch
  );
END
$fp$;
