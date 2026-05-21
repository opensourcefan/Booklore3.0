-- Composite index for continue-reading / continue-listening queries.
-- Covers the WHERE clause (user_id, read_status) and the ORDER BY (last_read_time DESC),
-- eliminating filesort on queries that join user_book_progress and sort by last read time.
CREATE INDEX IF NOT EXISTS idx_ubp_user_status_lastread
    ON user_book_progress(user_id, read_status, last_read_time DESC);
