package org.fable.controller;

import org.fable.model.dto.settings.AppSettingsTransferFile;
import org.fable.model.dto.settings.OidcProviderDetails;
import org.fable.model.dto.settings.SettingRequest;
import org.fable.model.enums.AuditAction;
import org.fable.service.appsettings.AppSettingService;
import org.fable.service.audit.AuditService;
import org.fable.service.oidc.OidcDiagnosticService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AppSettingControllerTest {

    @Mock
    private AppSettingService appSettingService;

    @Mock
    private OidcDiagnosticService oidcDiagnosticService;

    @Mock
    private AuditService auditService;

    @InjectMocks
    private AppSettingController controller;

    @Test
    void exportSettings_shouldReturnServiceResult() {
        AppSettingsTransferFile expected = AppSettingsTransferFile.builder()
                .version(1)
                .exportedAt("2026-03-20T10:00:00Z")
                .settings(List.of())
                .build();

        when(appSettingService.exportSettings()).thenReturn(expected);

        AppSettingsTransferFile result = controller.exportSettings();

        assertThat(result).isSameAs(expected);
        verify(auditService).log(AuditAction.SETTINGS_EXPORTED, "Exported 0 application setting(s)");
    }

    @Test
    void importSettings_shouldDelegateToService() throws Exception {
        AppSettingsTransferFile file = AppSettingsTransferFile.builder()
                .version(1)
                .exportedAt("2026-03-20T10:00:00Z")
                .settings(List.of())
                .build();

        controller.importSettings(file);

        verify(appSettingService).importSettings(file);
        verify(auditService).log(AuditAction.SETTINGS_IMPORTED, "Imported 0 application setting(s) from a settings transfer file");
    }

    @Test
    void updateSettings_shouldDelegateEachSettingToService() throws Exception {
        SettingRequest requestA = new SettingRequest();
        requestA.setName("AUTO_BOOK_SEARCH");
        requestA.setValue(true);

        SettingRequest requestB = new SettingRequest();
        requestB.setName("MAX_FILE_UPLOAD_SIZE_IN_MB");
        requestB.setValue(250);

        controller.updateSettings(List.of(requestA, requestB));

        verify(appSettingService).updateSetting(org.fable.model.dto.settings.AppSettingKey.AUTO_BOOK_SEARCH, true);
        verify(appSettingService).updateSetting(org.fable.model.dto.settings.AppSettingKey.MAX_FILE_UPLOAD_SIZE_IN_MB, 250);
    }

    @Test
    void testOidcConnection_shouldDelegateToDiagnosticService() {
        OidcProviderDetails details = new OidcProviderDetails();
        OidcDiagnosticService.OidcTestResult result = new OidcDiagnosticService.OidcTestResult(true, List.of());
        when(oidcDiagnosticService.testConnection(details)).thenReturn(result);

        OidcDiagnosticService.OidcTestResult actual = controller.testOidcConnection(details);

        assertThat(actual).isSameAs(result);
    }
}