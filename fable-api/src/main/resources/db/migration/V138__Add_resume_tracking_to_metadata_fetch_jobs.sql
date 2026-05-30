ALTER TABLE metadata_fetch_jobs
    ADD COLUMN requested_book_ids LONGTEXT NULL,
    ADD COLUMN completed_book_ids LONGTEXT NULL;