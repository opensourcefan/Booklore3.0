-- Add row_titles JSON column to persist empty chapter definitions
-- so empty chapters survive page reloads and are available in chapter dropdowns.
ALTER TABLE story_arc ADD COLUMN row_titles TEXT;
