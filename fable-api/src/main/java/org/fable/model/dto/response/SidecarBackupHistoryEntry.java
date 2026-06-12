package org.fable.model.dto.response;

import java.time.LocalDateTime;

public record SidecarBackupHistoryEntry(
        String status,
        int attempted,
        int exported,
        int failed,
        String firstError,
        String description,
        String username,
        LocalDateTime createdAt
) {
}