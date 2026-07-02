CREATE TABLE story_arc_book_mapping (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    story_arc_name VARCHAR(255) NOT NULL,
    book_id BIGINT NOT NULL,
    row_index INT NOT NULL,
    col_index INT NOT NULL,
    sequence_order DOUBLE NOT NULL,
    is_core BOOLEAN NOT NULL DEFAULT FALSE,
    row_title VARCHAR(255),
    CONSTRAINT fk_story_arc_book FOREIGN KEY (book_id) REFERENCES book(id) ON DELETE CASCADE,
    CONSTRAINT uq_story_arc_book UNIQUE (story_arc_name, book_id)
);
CREATE INDEX idx_story_arc_name ON story_arc_book_mapping(story_arc_name);
