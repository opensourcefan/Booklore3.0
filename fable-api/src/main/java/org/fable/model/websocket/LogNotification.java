package org.fable.model.websocket;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Getter;

import java.time.Instant;


@Getter
@JsonInclude(JsonInclude.Include.NON_NULL)
public class LogNotification {

    private final Long id;
    private final Instant timestamp;
    private final String message;
    private final Severity severity;

    public LogNotification(String message, Severity severity) {
        this(null, message, severity, Instant.now());
    }

    public LogNotification(Long id, String message, Severity severity, Instant timestamp) {
        this.id = id;
        this.message = message;
        this.severity = severity;
        this.timestamp = timestamp != null ? timestamp : Instant.now();
    }

    public static LogNotification createLogNotification(String message, Severity severity) {
        return new LogNotification(message, severity);
    }

    public static LogNotification info(String message) {
        return new LogNotification(message, Severity.INFO);
    }

    public static LogNotification warn(String message) {
        return new LogNotification(message, Severity.WARN);
    }

    public static LogNotification error(String message) {
        return new LogNotification(message, Severity.ERROR);
    }
}
