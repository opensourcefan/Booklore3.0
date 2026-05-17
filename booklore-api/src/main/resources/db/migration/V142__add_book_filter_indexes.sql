-- Add indexes for frequent filter/sort columns on the book table

-- Index for "Recently Added" sort / "added within days" filter
CREATE INDEX IF NOT EXISTS idx_book_added_on ON book(added_on);

-- Index for metadata fetch scheduling queries
CREATE INDEX IF NOT EXISTS idx_book_last_metadata_fetch_at ON book(last_metadata_fetch_at);

-- Index for scan state filtering
CREATE INDEX IF NOT EXISTS idx_book_scanned_on ON book(scanned_on);

-- Index for "Currently Reading" dashboard filter
CREATE INDEX IF NOT EXISTS idx_book_is_currently_reading ON book(is_currently_reading);

-- Composite index: dominant query pattern is (user_id, read_status)
CREATE INDEX IF NOT EXISTS idx_user_book_progress_user_read_status ON user_book_progress(user_id, read_status);

-- Single-column index on read_status for queries filtering by status only
CREATE INDEX IF NOT EXISTS idx_user_book_progress_read_status ON user_book_progress(read_status);