-- Remove any duplicate library paths (keep the one with the lowest id)
DELETE lp1 FROM library_path lp1
    INNER JOIN library_path lp2
    WHERE lp1.id > lp2.id
      AND lp1.library_id = lp2.library_id
      AND lp1.path = lp2.path;

-- Add unique constraint to prevent duplicate paths per library
ALTER TABLE library_path
    ADD CONSTRAINT uq_library_path UNIQUE (library_id, path(255));
