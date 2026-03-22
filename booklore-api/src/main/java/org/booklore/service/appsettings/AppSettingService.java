package org.booklore.service.appsettings;

import jakarta.transaction.Transactional;
import org.booklore.config.AppProperties;
import org.booklore.config.security.service.AuthenticationService;
import org.booklore.exception.ApiError;
import org.booklore.model.dto.BookLoreUser;
import org.booklore.model.dto.request.MetadataRefreshOptions;
import org.booklore.model.dto.settings.*;
import org.booklore.model.entity.AppSettingEntity;
import org.booklore.model.enums.AuditAction;
import org.booklore.model.enums.PermissionType;
import org.booklore.service.audit.AuditService;
import org.booklore.util.UserPermissionUtils;
import org.springframework.boot.sql.init.dependency.DependsOnDatabaseInitialization;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.context.annotation.Lazy;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;
import java.util.stream.Collectors;

@Service
@DependsOnDatabaseInitialization
public class AppSettingService {

    private final AppProperties appProperties;
    private final SettingPersistenceHelper settingPersistenceHelper;
    private final AuthenticationService authenticationService;
    private final AuditService auditService;
    private final ObjectMapper objectMapper;

    private volatile AppSettings appSettings;
    private final ReentrantLock lock = new ReentrantLock();

    public AppSettingService(AppProperties appProperties, SettingPersistenceHelper settingPersistenceHelper, @Lazy AuthenticationService authenticationService, @Lazy AuditService auditService, ObjectMapper objectMapper) {
        this.appProperties = appProperties;
        this.settingPersistenceHelper = settingPersistenceHelper;
        this.authenticationService = authenticationService;
        this.auditService = auditService;
        this.objectMapper = objectMapper;
    }

    public AppSettingsTransferFile exportSettings() {
        BookLoreUser user = authenticationService.getAuthenticatedUser();
        Map<String, String> settingsMap = getSettingsMap();

        List<SettingRequest> exportableSettings = Arrays.stream(AppSettingKey.values())
                .filter(this::isApplicationWideSetting)
                .filter(key -> hasPermissionForKey(key, user))
                .map(key -> {
                    SettingRequest request = new SettingRequest();
                    request.setName(key.name());
                    Object deserializedValue = deserializeSettingValue(key, settingsMap.get(key.toString()));
                    request.setValue(redactSensitiveData(deserializedValue));
                    return request;
                })
                .toList();

        return AppSettingsTransferFile.builder()
                .version(1)
                .exportedAt(OffsetDateTime.now(ZoneOffset.UTC).toString())
                .settings(exportableSettings)
                .build();
    }

    @CacheEvict(value = "publicSettings", allEntries = true)
    @Transactional
    public void importSettings(AppSettingsTransferFile transferFile) throws JacksonException {
        if (transferFile == null || transferFile.getVersion() == null || transferFile.getVersion() != 1) {
            throw ApiError.GENERIC_BAD_REQUEST.createException("Invalid settings file version");
        }
        if (transferFile.getSettings() == null) {
            throw ApiError.GENERIC_BAD_REQUEST.createException("Settings file does not contain any settings");
        }

        for (SettingRequest settingRequest : transferFile.getSettings()) {
            if (settingRequest == null || settingRequest.getName() == null || settingRequest.getName().isBlank()) {
                continue;
            }

            AppSettingKey key;
            try {
                key = AppSettingKey.valueOf(settingRequest.getName());
            } catch (IllegalArgumentException ex) {
                throw ApiError.GENERIC_BAD_REQUEST.createException("Unknown setting key in import file: " + settingRequest.getName());
            }

            if (!isApplicationWideSetting(key)) {
                continue;
            }

            updateSetting(key, settingRequest.getValue());
        }
    }

    public AppSettings getAppSettings() {
        if (appSettings == null) {
            lock.lock();
            try {
                if (appSettings == null) {
                    appSettings = buildAppSettings();
                }
            } finally {
                lock.unlock();
            }
        }
        return appSettings;
    }

    @CacheEvict(value = "publicSettings", allEntries = true)
    @Transactional
    public void updateSetting(AppSettingKey key, Object val) throws JacksonException {
        BookLoreUser user = authenticationService.getAuthenticatedUser();

        validatePermission(key, user);

        if (key == AppSettingKey.OIDC_FORCE_ONLY_MODE) {
            validateOidcForceOnlyMode(val);
        }

        var setting = settingPersistenceHelper.appSettingsRepository.findByName(key.toString());
        if (setting == null) {
            setting = new AppSettingEntity();
            setting.setName(key.toString());
        }
        setting.setVal(settingPersistenceHelper.serializeSettingValue(key, val));
        settingPersistenceHelper.appSettingsRepository.save(setting);
        refreshCache();

        AuditAction action = switch (key) {
            case AppSettingKey k when k == AppSettingKey.OIDC_FORCE_ONLY_MODE -> AuditAction.OIDC_FORCE_ONLY_MODE_CHANGED;
            case AppSettingKey k when k.name().startsWith("OIDC_") -> AuditAction.OIDC_CONFIG_CHANGED;
            default -> AuditAction.SETTINGS_UPDATED;
        };
        auditService.log(action, "Updated setting: " + key);
    }

    private void validateOidcForceOnlyMode(Object val) {
        boolean enabling = Boolean.parseBoolean(String.valueOf(val));
        if (!enabling) return;

        AppSettings current = getAppSettings();
        if (!current.isOidcEnabled()) {
            throw ApiError.GENERIC_BAD_REQUEST.createException("Cannot enable OIDC-only mode: OIDC must be enabled first");
        }
        OidcProviderDetails details = current.getOidcProviderDetails();
        if (details == null || details.getIssuerUri() == null || details.getIssuerUri().isBlank()
                || details.getClientId() == null || details.getClientId().isBlank()) {
            throw ApiError.GENERIC_BAD_REQUEST.createException("Cannot enable OIDC-only mode: OIDC must be configured with issuer URI and client ID");
        }
    }

    private void validatePermission(AppSettingKey key, BookLoreUser user) {
        List<PermissionType> requiredPermissions = key.getRequiredPermissions();
        if (requiredPermissions.isEmpty()) {
            return;
        }

        boolean hasPermission = requiredPermissions.stream().anyMatch(permission ->
                UserPermissionUtils.hasPermission(user.getPermissions(), permission)
        );

        if (!hasPermission) {
            throw new AccessDeniedException("User does not have permission to update " + key.getDbKey());
        }
    }

    private boolean hasPermissionForKey(AppSettingKey key, BookLoreUser user) {
        List<PermissionType> requiredPermissions = key.getRequiredPermissions();
        if (requiredPermissions.isEmpty()) {
            return true;
        }

        return requiredPermissions.stream().anyMatch(permission ->
                UserPermissionUtils.hasPermission(user.getPermissions(), permission)
        );
    }

    private boolean isApplicationWideSetting(AppSettingKey key) {
        return !key.getRequiredPermissions().isEmpty();
    }

    private Object deserializeSettingValue(AppSettingKey key, String rawValue) {
        if (rawValue == null) {
            return null;
        }
        if (!key.isJson()) {
            return rawValue;
        }

        try {
            return objectMapper.readValue(rawValue, Object.class);
        } catch (JacksonException ex) {
            return rawValue;
        }
    }

    private Object redactSensitiveData(Object value) {
        if (value == null) {
            return null;
        }

        try {
            JsonNode node = objectMapper.valueToTree(value);
            redactSensitiveNode(node);
            return objectMapper.treeToValue(node, Object.class);
        } catch (Exception ex) {
            return value;
        }
    }

    private void redactSensitiveNode(JsonNode node) {
        if (node == null) {
            return;
        }

        if (node.isObject()) {
            ObjectNode objectNode = (ObjectNode) node;
            if (objectNode.has("clientSecret")) {
                objectNode.putNull("clientSecret");
            }
            if (objectNode.has("apiKey")) {
                objectNode.putNull("apiKey");
            }
            if (objectNode.has("cookie")) {
                objectNode.putNull("cookie");
            }
            objectNode.forEach(this::redactSensitiveNode);
            return;
        }

        if (node.isArray()) {
            for (JsonNode child : node) {
                redactSensitiveNode(child);
            }
        }
    }

    @Cacheable("publicSettings")
    public PublicAppSetting getPublicSettings() {
        return buildPublicSetting();
    }

    private void refreshCache() {
        lock.lock();
        try {
            appSettings = buildAppSettings();
        } finally {
            lock.unlock();
        }
    }

    private Map<String, String> getSettingsMap() {
        return settingPersistenceHelper.appSettingsRepository.findAll().stream()
                .filter(entity -> entity.getName() != null && entity.getVal() != null)
                .collect(Collectors.toMap(AppSettingEntity::getName, AppSettingEntity::getVal));
    }

    private PublicAppSetting buildPublicSetting() {
        Map<String, String> settingsMap = getSettingsMap();
        PublicAppSetting.PublicAppSettingBuilder builder = PublicAppSetting.builder();

        builder.oidcEnabled(Boolean.parseBoolean(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.OIDC_ENABLED, "false")));
        builder.remoteAuthEnabled(appProperties.getRemoteAuth().isEnabled());
        OidcProviderDetails details = settingPersistenceHelper.getJsonSetting(settingsMap, AppSettingKey.OIDC_PROVIDER_DETAILS, OidcProviderDetails.class, null, false);
        if (details != null) {
            details.setClientSecret(null);
        }
        builder.oidcProviderDetails(details);
        builder.oidcForceOnlyMode(Boolean.parseBoolean(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.OIDC_FORCE_ONLY_MODE, "false")));

        return builder.build();
    }

    private AppSettings buildAppSettings() {
        Map<String, String> settingsMap = getSettingsMap();

        AppSettings.AppSettingsBuilder builder = AppSettings.builder();
        builder.remoteAuthEnabled(appProperties.getRemoteAuth().isEnabled());

        builder.defaultMetadataRefreshOptions(settingPersistenceHelper.getJsonSetting(settingsMap, AppSettingKey.QUICK_BOOK_MATCH, MetadataRefreshOptions.class, settingPersistenceHelper.getDefaultMetadataRefreshOptions(), true));
        builder.libraryMetadataRefreshOptions(settingPersistenceHelper.getJsonSetting(settingsMap, AppSettingKey.LIBRARY_METADATA_REFRESH_OPTIONS, new TypeReference<>() {
        }, List.of(), true));
        builder.oidcProviderDetails(settingPersistenceHelper.getJsonSetting(settingsMap, AppSettingKey.OIDC_PROVIDER_DETAILS, OidcProviderDetails.class, null, false));
        builder.oidcAutoProvisionDetails(settingPersistenceHelper.getJsonSetting(settingsMap, AppSettingKey.OIDC_AUTO_PROVISION_DETAILS, OidcAutoProvisionDetails.class, new OidcAutoProvisionDetails(), true));
        builder.metadataProviderSettings(settingPersistenceHelper.getJsonSetting(settingsMap, AppSettingKey.METADATA_PROVIDER_SETTINGS, MetadataProviderSettings.class, settingPersistenceHelper.getDefaultMetadataProviderSettings(), true));
        builder.metadataMatchWeights(settingPersistenceHelper.getJsonSetting(settingsMap, AppSettingKey.METADATA_MATCH_WEIGHTS, MetadataMatchWeights.class, settingPersistenceHelper.getDefaultMetadataMatchWeights(), true));
        builder.metadataPersistenceSettings(settingPersistenceHelper.getJsonSetting(settingsMap, AppSettingKey.METADATA_PERSISTENCE_SETTINGS, MetadataPersistenceSettings.class, settingPersistenceHelper.getDefaultMetadataPersistenceSettings(), true));
        builder.metadataPublicReviewsSettings(settingPersistenceHelper.getJsonSetting(settingsMap, AppSettingKey.METADATA_PUBLIC_REVIEWS_SETTINGS, MetadataPublicReviewsSettings.class, settingPersistenceHelper.getDefaultMetadataPublicReviewsSettings(), true));
        builder.koboSettings(settingPersistenceHelper.getJsonSetting(settingsMap, AppSettingKey.KOBO_SETTINGS, KoboSettings.class, settingPersistenceHelper.getDefaultKoboSettings(), true));
        builder.coverCroppingSettings(settingPersistenceHelper.getJsonSetting(settingsMap, AppSettingKey.COVER_CROPPING_SETTINGS, CoverCroppingSettings.class, settingPersistenceHelper.getDefaultCoverCroppingSettings(), true));
        builder.metadataProviderSpecificFields(
            settingPersistenceHelper.getJsonSetting(
                settingsMap,
                AppSettingKey.METADATA_PROVIDER_SPECIFIC_FIELDS,
                MetadataProviderSpecificFields.class,
                settingPersistenceHelper.getDefaultMetadataProviderSpecificFields(),
                true
            )
        );
        builder.autoBookSearch(Boolean.parseBoolean(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.AUTO_BOOK_SEARCH, "false")));
        builder.uploadPattern(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.UPLOAD_FILE_PATTERN, "{authors}/<{series}/><{seriesIndex}. >/{title}/{title}< - {authors}>< ({year})>"));
        builder.similarBookRecommendation(Boolean.parseBoolean(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.SIMILAR_BOOK_RECOMMENDATION, "true")));
        builder.opdsServerEnabled(Boolean.parseBoolean(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.OPDS_SERVER_ENABLED, "false")));
        builder.komgaApiEnabled(Boolean.parseBoolean(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.KOMGA_API_ENABLED, "false")));
        builder.komgaGroupUnknown(Boolean.parseBoolean(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.KOMGA_GROUP_UNKNOWN, "true")));
        builder.telemetryEnabled(Boolean.parseBoolean(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.TELEMETRY_ENABLED, "true")));
        builder.pdfCacheSizeInMb(Integer.parseInt(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.PDF_CACHE_SIZE_IN_MB, "5120")));
        builder.maxFileUploadSizeInMb(Integer.parseInt(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.MAX_FILE_UPLOAD_SIZE_IN_MB, "100")));
        builder.metadataDownloadOnBookdrop(Boolean.parseBoolean(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.METADATA_DOWNLOAD_ON_BOOKDROP, "true")));
        builder.libraryHealthCheckIntervalSeconds(Integer.parseInt(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.LIBRARY_HEALTH_CHECK_INTERVAL_SECONDS, "120")));

        String sessionDurationStr = settingsMap.get(AppSettingKey.OIDC_SESSION_DURATION_HOURS.getDbKey());
        if (sessionDurationStr != null && !sessionDurationStr.isBlank()) {
            try {
                builder.oidcSessionDurationHours(Integer.parseInt(sessionDurationStr));
            } catch (NumberFormatException _) {
            }
        }

        boolean settingEnabled = Boolean.parseBoolean(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.OIDC_ENABLED, "false"));
        Boolean forceDisable = appProperties.getForceDisableOidc();
        boolean finalEnabled = settingEnabled && (forceDisable == null || !forceDisable);
        builder.oidcEnabled(finalEnabled);

        builder.oidcGroupSyncMode(settingPersistenceHelper.getOrCreateSetting(
                AppSettingKey.OIDC_GROUP_SYNC_MODE, "DISABLED"));

        builder.oidcForceOnlyMode(Boolean.parseBoolean(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.OIDC_FORCE_ONLY_MODE, "false")));

        builder.diskType(appProperties.getDiskType());

        return builder.build();
    }

    public String getSettingValue(String key) {
        var setting = settingPersistenceHelper.appSettingsRepository.findByName(key);
        return setting != null ? setting.getVal() : null;
    }

    @CacheEvict(value = "publicSettings", allEntries = true)
    @Transactional
    public void saveSetting(String key, String value) {
        var setting = settingPersistenceHelper.appSettingsRepository.findByName(key);
        if (setting == null) {
            setting = new AppSettingEntity();
            setting.setName(key);
        }
        setting.setVal(value);
        settingPersistenceHelper.appSettingsRepository.save(setting);
    }
}
