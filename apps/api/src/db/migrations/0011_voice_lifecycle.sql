-- Voice lifecycle: one live reservation per browser session, idempotent release,
-- real idle expiry, and a public informational audience that needs no event or guest.
-- Migrations 0001-0010 are immutable; this file only widens voice_leases.
-- Financial tables are untouched.

-- 0010 added an inline CHECK. PostgreSQL 12+ names it voice_leases_audience_check,
-- but a differently named constraint must not be able to keep rejecting 'public'.
ALTER TABLE voice_leases DROP CONSTRAINT IF EXISTS voice_leases_audience_check;
DO $$
DECLARE audience_constraint text;
BEGIN
  SELECT conname INTO audience_constraint
    FROM pg_constraint
   WHERE conrelid = 'voice_leases'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%audience%'
     AND pg_get_constraintdef(oid) NOT LIKE '%event_id%';
  IF audience_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE voice_leases DROP CONSTRAINT %I', audience_constraint);
  END IF;
END $$;
ALTER TABLE voice_leases
  ADD CONSTRAINT voice_leases_audience_check
  CHECK (audience IN ('guest', 'organizer', 'public'));

-- Public informational voice has no event. Guest and organizer leases still require one.
ALTER TABLE voice_leases ALTER COLUMN event_id DROP NOT NULL;
ALTER TABLE voice_leases
  ADD CONSTRAINT voice_leases_public_event_check
  CHECK (
    (audience = 'public' AND event_id IS NULL)
    OR (audience <> 'public' AND event_id IS NOT NULL)
  );

-- activity_at is written only by real client interaction (speech/reply events) or a
-- server-side tool call. It never extends expires_at, so activity cannot keep a lease
-- alive past the seconds that were reserved and charged to the daily budget.
ALTER TABLE voice_leases ADD COLUMN activity_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE voice_leases ADD COLUMN released_at timestamptz;
ALTER TABLE voice_leases ADD COLUMN release_reason text;

-- Older rows may have overlapping open leases. Keep only the newest per session so the
-- unique index below can be created without discarding reserved seconds.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY session_id ORDER BY created_at DESC, id DESC) AS position
    FROM voice_leases
   WHERE released_at IS NULL
)
UPDATE voice_leases AS lease
   SET released_at = now(),
       -- An image that only reads expires_at must also see the superseded lease as dead.
       expires_at = LEAST(lease.expires_at, now()),
       release_reason = 'migration_superseded'
  FROM ranked
 WHERE lease.id = ranked.id
   AND ranked.position > 1;

-- Previous images wrote released_at without touching expires_at. Normalize those rows so
-- a legacy live check (`expires_at > now()`) cannot revive a lease that is already closed.
-- Reserved seconds are untouched: this is not a refund.
UPDATE voice_leases
   SET expires_at = LEAST(expires_at, released_at)
 WHERE released_at IS NOT NULL
   AND expires_at > released_at;

-- Authoritative concurrent guard: a session can have at most one unreleased lease,
-- across guest, organizer and public audiences.
CREATE UNIQUE INDEX voice_leases_one_open_per_session
  ON voice_leases (session_id)
  WHERE released_at IS NULL;

CREATE INDEX voice_leases_session_recent_idx
  ON voice_leases (session_id, created_at);

CREATE INDEX voice_leases_live_idx
  ON voice_leases (session_id, expires_at, activity_at)
  WHERE released_at IS NULL;

COMMENT ON COLUMN voice_leases.activity_at IS
  'Last real interaction. Leases inactive for 60 seconds are no longer valid.';
COMMENT ON COLUMN voice_leases.released_at IS
  'Set once by an idempotent release. reserved_seconds still count toward the daily budget.';
