package org.booklore.model.dto.request;

import org.booklore.model.enums.AuditAction;

public record BackupAuditEventRequest(AuditAction action, String description) {
}