CREATE TABLE voice_leases (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id),
  event_id uuid NOT NULL REFERENCES events(id),
  reserved_seconds integer NOT NULL CHECK (reserved_seconds > 0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX voice_leases_budget_idx ON voice_leases (created_at);
