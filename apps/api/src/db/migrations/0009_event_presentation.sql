-- Optional presentation metadata. Legacy rows stay valid with NULL and no backfill.
-- Money, funding, RSVP, and access columns are unchanged.

ALTER TABLE events
  ADD COLUMN organizer_name text,
  ADD COLUMN theme text;

ALTER TABLE events
  ADD CONSTRAINT events_organizer_name_len
  CHECK (organizer_name IS NULL OR char_length(organizer_name) BETWEEN 1 AND 100);

ALTER TABLE events
  ADD CONSTRAINT events_theme_matches_template
  CHECK (
    theme IS NULL
    OR (template = 'comida' AND theme IN ('mesa', 'huerto', 'brindis', 'fogata'))
    OR (template = 'casa' AND theme IN ('patio', 'sala', 'terraza', 'jardin'))
    OR (template = 'viaje' AND theme IN ('camino', 'montana', 'costa', 'ciudad'))
    OR (template = 'evento' AND theme IN ('escenario', 'galeria', 'taller', 'noche'))
  );
