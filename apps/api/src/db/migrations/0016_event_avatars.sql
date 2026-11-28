-- Somos Panas NAP-F6s: avatar Napster con la foto del organizador por evento.
-- Depende de `events` (0001) y es aditiva. Una fila por evento; la foto se borra al quedar listo.

CREATE TABLE IF NOT EXISTS event_avatars (
  event_id uuid PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  consent_at timestamptz NOT NULL,
  first_name text NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 60),
  photo_mime text NOT NULL CHECK (photo_mime IN ('image/jpeg', 'image/png')),
  photo_bytes bytea,
  photo_token text NOT NULL UNIQUE,
  companion_id text,
  agent_id_es text,
  agent_id_en text,
  status text NOT NULL CHECK (status IN ('uploaded', 'generating', 'ready', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_avatars_status_idx ON event_avatars (status);
