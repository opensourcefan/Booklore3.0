package org.fable.model.dto.request;

import org.fable.model.enums.AuditAction;

public record BackupAuditEventRequest(AuditAction action, String description) {
}