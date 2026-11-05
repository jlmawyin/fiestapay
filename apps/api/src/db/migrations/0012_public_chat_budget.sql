-- Public informational chat has no event. Keep every existing row, foreign key and index;
-- only release the NOT NULL constraint so its ai_requests metadata can be stored.
ALTER TABLE ai_requests ALTER COLUMN event_id DROP NOT NULL;
