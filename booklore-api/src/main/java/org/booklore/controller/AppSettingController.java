package org.booklore.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AllArgsConstructor;
import org.booklore.model.dto.settings.AppSettingKey;
import org.booklore.model.dto.settings.AppSettingsTransferFile;
import org.booklore.model.dto.settings.AppSettings;
import org.booklore.model.dto.settings.OidcProviderDetails;
import org.booklore.model.dto.settings.SettingRequest;
import org.booklore.model.enums.AuditAction;
import org.booklore.service.appsettings.AppSettingService;
import org.booklore.service.audit.AuditService;
import org.booklore.service.oidc.OidcDiagnosticService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tools.jackson.core.JacksonException;

import java.util.List;

@Tag(name = "App Settings", description = "Endpoints for retrieving and updating application settings")
@AllArgsConstructor
@RestController
@RequestMapping("/api/v1/settings")
public class AppSettingController {

    private final AppSettingService appSettingService;
    private final OidcDiagnosticService oidcDiagnosticService;
    private final AuditService auditService;

    @Operation(summary = "Get application settings", description = "Retrieve all application settings.")
    @ApiResponse(responseCode = "200", description = "Application settings returned successfully")
    @GetMapping
    public AppSettings getAppSettings() {
        return appSettingService.getAppSettings();
    }

    @Operation(summary = "Update application settings", description = "Update one or more application settings.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Settings updated successfully"),
        @ApiResponse(responseCode = "400", description = "Invalid request")
    })
    @PutMapping
    public void updateSettings(@Parameter(description = "List of settings to update") @RequestBody List<SettingRequest> settingRequests) throws JacksonException {
        for (SettingRequest settingRequest : settingRequests) {
            if (settingRequest == null || settingRequest.getName() == null || settingRequest.getName().isBlank()) {
                continue;
            }
            AppSettingKey key = AppSettingKey.valueOf(settingRequest.getName());
            appSettingService.updateSetting(key, settingRequest.getValue());
        }
    }

    @Operation(summary = "Export application settings", description = "Export all application-wide settings that the current user can manage.")
    @ApiResponse(responseCode = "200", description = "Application settings export created successfully")
    @GetMapping("/export")
    public AppSettingsTransferFile exportSettings() {
        AppSettingsTransferFile transferFile = appSettingService.exportSettings();
        auditService.log(
                AuditAction.SETTINGS_EXPORTED,
                "Exported " + transferFile.getSettings().size() + " application setting(s)"
        );
        return transferFile;
    }

    @Operation(summary = "Import application settings", description = "Import a previously exported application settings file.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "Settings imported successfully"),
        @ApiResponse(responseCode = "400", description = "Invalid import file")
    })
    @PostMapping("/import")
    public void importSettings(@RequestBody AppSettingsTransferFile transferFile) throws JacksonException {
        appSettingService.importSettings(transferFile);
        int importedCount = transferFile == null || transferFile.getSettings() == null ? 0 : transferFile.getSettings().size();
        auditService.log(
                AuditAction.SETTINGS_IMPORTED,
                "Imported " + importedCount + " application setting(s) from a settings transfer file"
        );
    }

    @PostMapping("/oidc/test")
    @PreAuthorize("@securityUtil.isAdmin()")
    public OidcDiagnosticService.OidcTestResult testOidcConnection(@RequestBody OidcProviderDetails providerDetails) {
        var result = oidcDiagnosticService.testConnection(providerDetails);
        auditService.log(AuditAction.OIDC_CONNECTION_TEST, "OIDC connection test: " + (result.success() ? "passed" : "failed"));
        return result;
    }
}