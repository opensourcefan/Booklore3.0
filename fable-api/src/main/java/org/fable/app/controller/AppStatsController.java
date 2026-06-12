package org.fable.app.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.fable.service.ReadingSessionService;
import org.fable.config.security.SecurityUtil;
import java.util.Map;

@Tag(name = "App Stats", description = "App-specific analytical and reading statistics endpoints")
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/v1/app/stats")
public class AppStatsController {
    private final ReadingSessionService readingSessionService;
    private final SecurityUtil securityUtil;

    @Operation(summary = "Get mobile client reading statistics overview")
    @GetMapping
    @PreAuthorize("@securityUtil.isAuthenticated()")
    public ResponseEntity<Map<String, Object>> getMobileStats() {
        return ResponseEntity.ok(Map.of("status", "success", "message", "Dashboard parity endpoint stub initialized."));
    }
}
