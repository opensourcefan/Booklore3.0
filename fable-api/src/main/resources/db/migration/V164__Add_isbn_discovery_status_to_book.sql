ALTER TABLE book
    ADD COLUMN isbn_discovery_status VARCHAR(32) NULL,
    ADD COLUMN isbn_discovery_checked_at TIMESTAMP NULL,
    ADD COLUMN isbn_discovery_detail VARCHAR(1000) NULL;

CREATE INDEX idx_book_isbn_discovery_status ON book (isbn_discovery_status);
