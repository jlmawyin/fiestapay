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

-- Functions live in the schema that is current while this file runs (the isolated test
-- schema, or the production schema). They are never created as public.<name>.
-- The legacy production writer omits ends_at. Fill that only on INSERT, with the same
-- four-hour span as the backfill above. An explicit end is kept, and UPDATE does not
-- recompute starts_at or ends_at.
DO $fp$
DECLARE
  sch text := current_schema();
BEGIN
  EXECUTE format($fn$
    CREATE OR REPLACE FUNCTION %1$I.fiestapay_reject_event_delete()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO %1$I, pg_catalog
    AS $body$
    BEGIN
      IF EXISTS (SELECT 1 FROM payment_ledger WHERE event_id = OLD.id)
         OR EXISTS (SELECT 1 FROM orders WHERE event_id = OLD.id) THEN
        RAISE EXCEPTION 'no se elimina un evento con registros de pago';
      END IF;
      RETURN OLD;
    END;
    $body$
  $fn$, sch);

  EXECUTE format('DROP TRIGGER IF EXISTS events_reject_money_delete ON %1$I.events', sch);
  EXECUTE format(
    'CREATE TRIGGER events_reject_money_delete BEFORE DELETE ON %1$I.events FOR EACH ROW EXECUTE FUNCTION %1$I.fiestapay_reject_event_delete()',
    sch
  );

  EXECUTE format($fn$
    CREATE OR REPLACE FUNCTION %1$I.fiestapay_fill_legacy_ends_at()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO pg_catalog
    AS $body$
    BEGIN
      IF NEW.ends_at IS NULL THEN
        NEW.ends_at := NEW.starts_at + interval '4 hours';
      END IF;
      RETURN NEW;
    END;
    $body$
  $fn$, sch);

  EXECUTE format('DROP TRIGGER IF EXISTS events_fill_legacy_ends_at ON %1$I.events', sch);
  EXECUTE format(
    'CREATE TRIGGER events_fill_legacy_ends_at BEFORE INSERT ON %1$I.events FOR EACH ROW EXECUTE FUNCTION %1$I.fiestapay_fill_legacy_ends_at()',
    sch
  );
END
$fp$;
