package org.fable.controller;

import org.fable.model.dto.request.BackupAuditEventRequest;
import org.fable.model.enums.AuditAction;
import org.fable.service.audit.AuditService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class AuditLogControllerTest {

    @Mock
    private AuditService auditService;

    @InjectMocks
    private AuditLogController controller;

    @Test
    void recordDatabaseHelperAuditEvent_acceptsAllowedAction() {
        var request = new BackupAuditEventRequest(
                AuditAction.DATABASE_BACKUP_COMMAND_COPIED,
                "Prepared export command for /srv/fable/backups/fable_backup.sql"
        );

        var response = controller.recordDatabaseHelperAuditEvent(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(auditService).log(AuditAction.DATABASE_BACKUP_COMMAND_COPIED,
                "Prepared export command for /srv/fable/backups/fable_backup.sql");
    }

    @Test
    void recordDatabaseHelperAuditEvent_rejectsNonDatabaseAction() {
        var request = new BackupAuditEventRequest(AuditAction.SETTINGS_UPDATED, "nope");

        var response = controller.recordDatabaseHelperAuditEvent(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verifyNoInteractions(auditService);
    }
}