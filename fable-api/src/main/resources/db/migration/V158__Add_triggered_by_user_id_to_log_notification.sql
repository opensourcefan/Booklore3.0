ALTER TABLE log_notification
    ADD COLUMN triggered_by_user_id BIGINT NULL;

CREATE INDEX idx_log_notification_triggered_by ON log_notification (triggered_by_user_id);

CREATE INDEX idx_log_notification_severity_created ON log_notification (severity, created_at);
