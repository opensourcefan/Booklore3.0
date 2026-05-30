package org.booklore.app.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.booklore.service.task.TaskService;
import java.util.Map;

@Tag(name = "App Tasks", description = "Mobile-friendly endpoints for background tasks and operator flows")
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/v1/app/tasks")
public class AppTaskController {
    private final TaskService taskService;

    @Operation(summary = "Get currently active background tasks for mobile admin views")
    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> getMobileTasks() {
        return ResponseEntity.ok(Map.of("message", "Task parity endpoint stub initialized.", "activeTasks", java.util.List.of()));
    }
}
