CREATE TABLE comic_panel_flow (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    book_id BIGINT NOT NULL,
    flow_data LONGTEXT NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_comic_panel_flow_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_comic_panel_flow_book FOREIGN KEY (book_id) REFERENCES book(id) ON DELETE CASCADE,
    UNIQUE KEY uk_comic_panel_flow_user_book (user_id, book_id),
    INDEX idx_comic_panel_flow_book_user (book_id, user_id)
);
