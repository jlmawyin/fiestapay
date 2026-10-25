-- Persistence and access. Additive only: existing money, ledger, slugs and payments stay.
-- Events are never deleted when they have orders or ledger rows. Retention tombstones in place.

ALTER TABLE events ADD COLUMN ends_at timestamptz;
ALTER TABLE events ADD COLUMN closed_at timestamptz;
ALTER TABLE events ADD COLUMN purged_at timestamptz;
ALTER TABLE events ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN admin_key_hash bytea;
ALTER TABLE events ADD COLUMN access_code_hash bytea;

-- Legacy rows had no end. Four hours after the start is a bounded backfill, not a new party.
UPDATE events SET ends_at = starts_at + interval '4 hours' WHERE ends_at IS NULL;
ALTER TABLE events ALTER COLUMN ends_at SET NOT NULL;
ALTER TABLE events ADD CONSTRAINT events_ends_after_start CHECK (ends_at > starts_at);

-- Only rows we can prove were demo seeds. A real paid party is never marked demo by guesswork.
UPDATE events e
   SET is_demo = true
 WHERE EXISTS (
   SELECT 1 FROM audit_log a WHERE a.event_id = e.id AND a.action = 'demo_seeded'
 );

CREATE INDEX events_retention_idx ON events (ends_at) WHERE purged_at IS NULL;

-- Proof of a private code for one browser session. The code itself is never stored.
CREATE TABLE event_unlocks (
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, session_id)
);

CREATE OR REPLACE FUNCTION fiestapay_reject_event_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM payment_ledger WHERE event_id = OLD.id)
     OR EXISTS (SELECT 1 FROM orders WHERE event_id = OLD.id) THEN
    RAISE EXCEPTION 'no se elimina un evento con registros de pago';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS events_reject_money_delete ON events;
CREATE TRIGGER events_reject_money_delete
  BEFORE DELETE ON events
  FOR EACH ROW
  EXECUTE FUNCTION fiestapay_reject_event_delete();
