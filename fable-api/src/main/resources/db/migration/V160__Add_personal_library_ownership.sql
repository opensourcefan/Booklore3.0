-- Personal library ownership + optional visibility in the admin working catalog.
-- Personal libs (owner_user_id set) are excluded from admin books/search/stats/sidebar/AI
-- unless show_in_admin_catalog is true (Create User "Show library" → USERS sidebar).

ALTER TABLE library
    ADD COLUMN owner_user_id BIGINT NULL,
    ADD COLUMN show_in_admin_catalog BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE library
    ADD CONSTRAINT fk_library_owner_user
        FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE SET NULL;

CREATE INDEX idx_library_owner_user_id ON library (owner_user_id);
CREATE INDEX idx_library_show_in_admin_catalog ON library (show_in_admin_catalog);
