CREATE TABLE IF NOT EXISTS log_notification
(
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    message    TEXT         NOT NULL,
    severity   VARCHAR(10)  NOT NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

CREATE INDEX idx_log_notification_created_at ON log_notification (created_at);
