CREATE TABLE ai_requests (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id),
  event_id uuid NOT NULL REFERENCES events(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_requests_day_idx ON ai_requests (created_at);
