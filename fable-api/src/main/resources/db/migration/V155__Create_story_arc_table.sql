-- Create dedicated story_arc table to persist arc identity and metadata
-- independently of book mappings. Fixes bug where removing all books
-- from a story arc would delete the arc entirely, losing summary/guide data.
CREATE TABLE story_arc (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    external_url TEXT,
    description TEXT,
    CONSTRAINT uq_story_arc_name UNIQUE (name)
);

-- Populate story_arc from existing distinct story_arc_name values in the mapping table,
-- carrying over the first non-null external_url and description for each arc.
INSERT INTO story_arc (name, external_url, description)
SELECT
    m.story_arc_name,
    (SELECT m2.external_url FROM story_arc_book_mapping m2
     WHERE m2.story_arc_name = m.story_arc_name AND m2.external_url IS NOT NULL
     LIMIT 1),
    (SELECT m2.description FROM story_arc_book_mapping m2
     WHERE m2.story_arc_name = m.story_arc_name AND m2.description IS NOT NULL
     LIMIT 1)
FROM story_arc_book_mapping m
GROUP BY m.story_arc_name;

-- Add story_arc_id column to mapping table
ALTER TABLE story_arc_book_mapping
    ADD COLUMN story_arc_id BIGINT;

-- Populate story_arc_id based on name matching
UPDATE story_arc_book_mapping m
SET m.story_arc_id = (SELECT a.id FROM story_arc a WHERE a.name = m.story_arc_name);

-- Make story_arc_id NOT NULL after population
ALTER TABLE story_arc_book_mapping
    MODIFY COLUMN story_arc_id BIGINT NOT NULL;

-- Add FK constraint
ALTER TABLE story_arc_book_mapping
    ADD CONSTRAINT fk_story_arc_mapping_arc
    FOREIGN KEY (story_arc_id) REFERENCES story_arc(id) ON DELETE CASCADE;

-- Add index for lookups by story_arc_id
CREATE INDEX idx_story_arc_mapping_arc_id ON story_arc_book_mapping(story_arc_id);
