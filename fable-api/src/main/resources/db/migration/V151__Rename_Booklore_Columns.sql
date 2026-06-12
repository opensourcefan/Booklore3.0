-- Rename sync_with_booklore_reader to sync_with_fable_reader
ALTER TABLE koreader_user RENAME COLUMN sync_with_booklore_reader TO sync_with_fable_reader;

-- Rename booklore_user_id to fable_user_id
ALTER TABLE koreader_user RENAME COLUMN booklore_user_id TO fable_user_id;

-- Rename foreign key constraint fk_booklore_user to fk_fable_user
ALTER TABLE koreader_user DROP FOREIGN KEY fk_booklore_user;
ALTER TABLE koreader_user ADD CONSTRAINT fk_fable_user FOREIGN KEY (fable_user_id) REFERENCES users (id);

-- Rename permission_bulk_reset_booklore_read_progress to permission_bulk_reset_fable_read_progress
ALTER TABLE user_permissions RENAME COLUMN permission_bulk_reset_booklore_read_progress TO permission_bulk_reset_fable_read_progress;
