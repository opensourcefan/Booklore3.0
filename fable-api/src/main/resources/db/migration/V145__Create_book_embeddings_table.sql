CREATE TABLE IF NOT EXISTS book_embeddings (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    book_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    chunk_index INT NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding_vector TEXT NOT NULL,
    page_number INT,
    chapter_title VARCHAR(500),
    embedding_model VARCHAR(255) DEFAULT 'BAAI/bge-small-en-v1.5',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_book_embeddings_book (book_id),
    INDEX idx_book_embeddings_user (user_id),
    INDEX idx_book_embeddings_book_user (book_id, user_id),
    FOREIGN KEY (book_id) REFERENCES book(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
