-- Ensure the 'AIS' tag exists in the tag table
INSERT INTO tag (name)
SELECT 'AIS'
FROM dual
WHERE NOT EXISTS (SELECT 1 FROM tag WHERE name = 'AIS');

-- Map any book that has embeddings in book_embeddings to the 'AIS' tag
INSERT INTO book_metadata_tag_mapping (book_id, tag_id)
SELECT DISTINCT be.book_id, t.id
FROM book_embeddings be
JOIN tag t ON t.name = 'AIS'
WHERE NOT EXISTS (
    SELECT 1 FROM book_metadata_tag_mapping m
    WHERE m.book_id = be.book_id AND m.tag_id = t.id
);
