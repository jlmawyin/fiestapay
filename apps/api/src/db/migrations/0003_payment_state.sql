-- Durable capture claim.
--
-- Before this migration an order went straight from 'approved' to 'paid' and the capture call
-- travelled the network with nothing recorded about it. A timeout, a crash or a concurrent RSVP
-- change could therefore leave one obligation charged twice: the in-flight capture of the old
-- amount plus a brand new order for the new amount.
--
-- 'capturing' is written to this table *before* the capture request leaves the process and is
-- part of the "at most one open order per guest" set, so while a capture is uncertain no second
-- obligation can be opened for that guest and the RSVP cannot move.

DO $$
DECLARE existing record;
BEGIN
  -- The status CHECK was declared inline in 0001, so drop it by definition rather than by a
  -- name we only assume PostgreSQL generated.
  FOR existing IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'orders'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%superseded%'
  LOOP
    EXECUTE format('ALTER TABLE orders DROP CONSTRAINT %I', existing.conname);
  END LOOP;
END $$;

ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('intent','created','approved','capturing','paid','superseded','failed'));

-- The open set now includes the claim: superseding or inserting around a capture in flight is
-- exactly how one obligation becomes two charges, so the database refuses it.
DROP INDEX IF EXISTS orders_one_open_per_guest;
CREATE UNIQUE INDEX orders_one_open_per_guest
  ON orders (guest_id)
  WHERE status IN ('intent','created','approved','capturing');

-- Supports finding claims old enough that PayPal has had time to publish their capture.
CREATE INDEX orders_capturing_idx ON orders (updated_at) WHERE status = 'capturing';
