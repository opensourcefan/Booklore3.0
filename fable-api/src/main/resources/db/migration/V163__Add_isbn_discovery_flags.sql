ALTER TABLE book_metadata
    ADD COLUMN isbn_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN isbn_written_to_file BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_book_metadata_isbn_verified ON book_metadata (isbn_verified);
CREATE INDEX idx_book_metadata_isbn_written_to_file ON book_metadata (isbn_written_to_file);
