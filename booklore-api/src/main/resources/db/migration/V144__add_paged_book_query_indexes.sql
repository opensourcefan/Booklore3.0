-- Composite index for the dominant paged-book query pattern:
-- "all non-deleted books in library X, sorted by added_on DESC".
-- Covers the WHERE clause (library_id, deleted) and ORDER BY (added_on DESC),
-- eliminating filesort on the most common book browser query.
CREATE INDEX IF NOT EXISTS idx_book_library_deleted_added
    ON book(library_id, deleted, added_on DESC);

-- Index for media-type filtering on the book.file_type column.
-- The paged endpoint filters by file_type for custom media type views.
CREATE INDEX IF NOT EXISTS idx_book_file_type
    ON book(file_type);
