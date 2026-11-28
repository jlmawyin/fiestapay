-- Somos Panas NAP-S3: avatar elegida por el organizador para recibir a sus invitados.
-- Depende de `events` (0001) y del catálogo versionado. Aditiva; no rellena eventos viejos.

ALTER TABLE events
  ADD COLUMN avatar_id text NULL;

ALTER TABLE events
  ADD CONSTRAINT events_avatar_id_slug
  CHECK (avatar_id IS NULL OR avatar_id ~ '^[a-z0-9-]{1,40}$');
