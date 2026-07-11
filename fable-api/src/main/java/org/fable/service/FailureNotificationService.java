package org.fable.service;

import org.fable.config.security.service.AuthenticationService;
import org.fable.model.entity.LogNotificationEntity;
import org.fable.model.enums.PermissionType;
import org.fable.model.websocket.LogNotification;
import org.fable.model.websocket.Severity;
import org.fable.model.websocket.Topic;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Set;

/**
 * Central helper: every failure must persist and reach the bell Notifications inbox.
 */
@Slf4j
@Service
@AllArgsConstructor
public class FailureNotificationService {

    private final LogNotificationService logNotificationService;
    private final NotificationService notificationService;
    private final AuthenticationService authenticationService;

    @Transactional
    public LogNotification reportError(String message) {
        return report(message, Severity.ERROR, resolveCurrentUserId());
    }

    @Transactional
    public LogNotification reportError(String message, Long triggeredByUserId) {
        return report(message, Severity.ERROR, triggeredByUserId);
    }

    @Transactional
    public LogNotification reportWarn(String message) {
        return report(message, Severity.WARN, resolveCurrentUserId());
    }

    @Transactional
    public LogNotification report(String message, Severity severity, Long triggeredByUserId) {
        if (severity != Severity.ERROR && severity != Severity.WARN) {
            severity = Severity.ERROR;
        }
        String safeMessage = sanitize(message);
        LogNotificationEntity saved = logNotificationService.persist(safeMessage, severity, triggeredByUserId);
        LogNotification dto = logNotificationService.toDto(saved);

        if (triggeredByUserId != null) {
            var user = authenticationService.getAuthenticatedUser();
            if (user != null && triggeredByUserId.equals(user.getId())) {
                notificationService.sendMessageToUser(user.getUsername(), Topic.LOG, dto);
            } else {
                // Actor may not be the current security context (async/cron) — broadcast to operators
                notificationService.sendMessageToPermissions(Topic.LOG, dto,
                        Set.of(PermissionType.ADMIN, PermissionType.MANAGE_LIBRARY));
            }
        } else {
            notificationService.sendMessageToPermissions(Topic.LOG, dto,
                    Set.of(PermissionType.ADMIN, PermissionType.MANAGE_LIBRARY));
        }
        return dto;
    }

    private Long resolveCurrentUserId() {
        try {
            var user = authenticationService.getAuthenticatedUser();
            return user != null ? user.getId() : null;
        } catch (Exception e) {
            return null;
        }
    }

    static String sanitize(String message) {
        if (message == null || message.isBlank()) {
            return "Unknown error";
        }
        // Strip tags so inbox can render as text safely
        return message.replaceAll("<[^>]*>", "").trim();
    }
}
