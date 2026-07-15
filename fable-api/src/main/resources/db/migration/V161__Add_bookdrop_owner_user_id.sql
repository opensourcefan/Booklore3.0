-- Stage 2: personal BookDrop inboxes under /books/_users/{id}/bookdrop.
-- owner_user_id NULL = global admin inbox (app.bookdrop-folder).
-- owner_user_id set = that user's personal inbox rows only.

ALTER TABLE bookdrop_file
    ADD COLUMN owner_user_id BIGINT NULL;

ALTER TABLE bookdrop_file
    ADD CONSTRAINT fk_bookdrop_file_owner_user
        FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX idx_bookdrop_file_owner_user_id ON bookdrop_file (owner_user_id);
CREATE INDEX idx_bookdrop_file_status_owner ON bookdrop_file (status, owner_user_id);
