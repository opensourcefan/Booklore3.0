package org.booklore.app.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@Tag(name = "App Metadata", description = "Mobile metadata management interfaces")
@RequiredArgsConstructor
@RestController
@RequestMapping("/api/v1/app/metadata")
public class AppMetadataController {
    
    @Operation(summary = "Update single book metadata via mobile client")
    @PostMapping("/update/{bookId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> updateMobileMetadata(@PathVariable Long bookId) {
        return ResponseEntity.ok(Map.of("status", "success", "message", "Metadata mobile parity endpoint stub initialized."));
    }
}
