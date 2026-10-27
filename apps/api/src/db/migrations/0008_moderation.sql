-- Logical moderation. Guests are never deleted: orders, the payment ledger and
-- refund tasks hang off guests, and a physical delete would cascade the book.

ALTER TABLE guests
  ADD COLUMN blocked_at timestamptz,
  ADD COLUMN removed_at timestamptz;

CREATE INDEX guests_blocked_idx ON guests (event_id) WHERE blocked_at IS NOT NULL;
CREATE INDEX guests_removed_idx ON guests (event_id) WHERE removed_at IS NOT NULL;

-- Soft delete keeps OpenAI tool-call pairing inspectable. Reads skip deleted rows
-- and a scope revision tells an in-flight reply not to write itself back.
ALTER TABLE chat_messages
  ADD COLUMN deleted_at timestamptz;

CREATE INDEX chat_messages_visible_idx
  ON chat_messages (event_id, session_id, id)
  WHERE deleted_at IS NULL;

-- public_id is the only conversation handle an organizer sees. session_id stays here.
CREATE TABLE chat_scopes (
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES sessions(id),
  public_id  uuid NOT NULL,
  revision   bigint NOT NULL DEFAULT 0,
  blocked_at timestamptz,
  PRIMARY KEY (event_id, session_id),
  UNIQUE (public_id)
);

CREATE INDEX chat_scopes_event_idx ON chat_scopes (event_id, public_id);
