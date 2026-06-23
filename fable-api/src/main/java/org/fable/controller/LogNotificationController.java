package org.fable.controller;

import org.fable.model.websocket.LogNotification;
import org.fable.service.LogNotificationService;
import lombok.AllArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@AllArgsConstructor
@RestController
@RequestMapping("/api/v1/notifications")
public class LogNotificationController {

    private final LogNotificationService logNotificationService;

    @GetMapping("/recent")
    @PreAuthorize("@securityUtil.canAccessTaskManager() or @securityUtil.isAdmin()")
    public ResponseEntity<List<LogNotification>> getRecentNotifications(
            @RequestParam(defaultValue = "50") int limit) {
        int cappedLimit = Math.min(limit, 200);
        List<LogNotification> notifications = logNotificationService.getRecentNotifications(cappedLimit);
        return ResponseEntity.ok(notifications);
    }
}
