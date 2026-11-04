-- Optional organizer mailbox and single-use recovery tokens.
-- The ledger, orders and event row stay. Tombstone deletes only these two tables' rows.
-- Tokens and admin keys are stored as sha256 digests. The mailbox is kept so a later
-- configured provider can send; purge removes it.

CREATE TABLE organizer_contacts (
  event_id    uuid PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  email       text NOT NULL,
  email_hash  bytea NOT NULL,
  verified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizer_contacts_email_len CHECK (char_length(email) BETWEEN 3 AND 254),
  CONSTRAINT organizer_contacts_email_single_line CHECK (email !~ '[\r\n]')
);

CREATE TABLE recovery_tokens (
  id              uuid PRIMARY KEY,
  event_id        uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  purpose         text NOT NULL CHECK (purpose IN ('verify', 'recover')),
  token_hash      bytea NOT NULL UNIQUE,
  email_hash      bytea NOT NULL,
  admin_key_hash  bytea,
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz,
  -- accepted: the outbound SMTP server accepted the message. It is not inbox delivery.
  delivery_status text NOT NULL CHECK (delivery_status IN ('pending', 'accepted', 'rejected', 'timeout', 'failed')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX recovery_tokens_event_idx ON recovery_tokens (event_id);

-- One row per America/Guayaquil calendar day. Reserved before the provider call.
CREATE TABLE email_daily_budget (
  day      date PRIMARY KEY,
  reserved integer NOT NULL CHECK (reserved >= 0)
);

-- Hashed IP or slug. Raw addresses are not stored. Failed attempts stay counted.
CREATE TABLE email_attempt_windows (
  scope        text NOT NULL CHECK (scope IN ('ip', 'event')),
  bucket       bytea NOT NULL,
  window_start timestamptz NOT NULL,
  hits         integer NOT NULL CHECK (hits >= 0),
  PRIMARY KEY (scope, bucket)
);
