ALTER TABLE book
    ADD COLUMN removed_from_library BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_book_removed_from_library ON book (removed_from_library);