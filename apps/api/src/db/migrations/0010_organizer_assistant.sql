-- Organizer assistant storage and voice-lease audience.
-- Guest leases stay valid: audience defaults to guest. Financial tables are untouched.

ALTER TABLE voice_leases
  ADD COLUMN audience text NOT NULL DEFAULT 'guest'
  CHECK (audience IN ('guest', 'organizer'));

CREATE TABLE organizer_chat_messages (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES sessions(id),
  role text NOT NULL CHECK (role IN ('user', 'model', 'function')),
  parts jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX organizer_chat_messages_scope_idx
  ON organizer_chat_messages (event_id, session_id, id);
