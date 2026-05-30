ALTER TABLE book
    ADD COLUMN last_metadata_fetch_at TIMESTAMP NULL AFTER metadata_updated_at;

UPDATE book
SET last_metadata_fetch_at = metadata_updated_at
WHERE metadata_updated_at IS NOT NULL
  AND last_metadata_fetch_at IS NULL;