package org.fable.service.appsettings;

import jakarta.transaction.Transactional;
import org.fable.config.AppProperties;
import org.fable.config.security.service.AuthenticationService;
import org.fable.exception.ApiError;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.request.MetadataRefreshOptions;
import org.fable.model.dto.settings.*;
import org.fable.model.entity.AppSettingEntity;
import org.fable.model.enums.AuditAction;
import org.fable.model.enums.PermissionType;
import org.fable.service.audit.AuditService;
import org.fable.util.UserPermissionUtils;
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

import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.client.RestTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

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
    private final RestTemplate restTemplate;
    private final JdbcTemplate jdbcTemplate;
    private static final Logger logger = LoggerFactory.getLogger(AppSettingService.class);

    private volatile AppSettings appSettings;
    private final ReentrantLock lock = new ReentrantLock();

    public AppSettingService(AppProperties appProperties, SettingPersistenceHelper settingPersistenceHelper, @Lazy AuthenticationService authenticationService, @Lazy AuditService auditService, ObjectMapper objectMapper, RestTemplate restTemplate, JdbcTemplate jdbcTemplate) {
        this.appProperties = appProperties;
        this.settingPersistenceHelper = settingPersistenceHelper;
        this.authenticationService = authenticationService;
        this.auditService = auditService;
        this.objectMapper = objectMapper;
        this.restTemplate = restTemplate;
        this.jdbcTemplate = jdbcTemplate;
    }

    public AppSettingsTransferFile exportSettings() {
        FableUser user = authenticationService.getAuthenticatedUser();
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
        FableUser user = authenticationService.getAuthenticatedUser();

        validatePermission(key, user);

        if (key == AppSettingKey.OIDC_FORCE_ONLY_MODE) {
            validateOidcForceOnlyMode(val);
        }

        var setting = settingPersistenceHelper.appSettingsRepository.findByName(key.toString());
        AiSearchSettings oldAiSearch = null;
        if (key == AppSettingKey.AI_SEARCH_SETTINGS) {
            oldAiSearch = getAppSettings().getAiSearchSettings();
        }

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

        if (key == AppSettingKey.AI_SEARCH_SETTINGS) {
            String serialized = settingPersistenceHelper.serializeSettingValue(key, val);
            AiSearchSettings newSettings = serialized != null ? objectMapper.readValue(serialized, AiSearchSettings.class) : null;
            handleAiSearchSettingsUpdate(newSettings, oldAiSearch);
        } else if (key == AppSettingKey.AI_PANEL_SETTINGS) {
            String serialized = settingPersistenceHelper.serializeSettingValue(key, val);
            AiPanelSettings newSettings = serialized != null ? objectMapper.readValue(serialized, AiPanelSettings.class) : null;
            handleAiPanelSettingsUpdate(newSettings);
        }
    }

    private void handleAiSearchSettingsUpdate(AiSearchSettings newSettings, AiSearchSettings oldSettings) {
        // Auto-heal sequence if embedding provider/model or chunking/dimension settings changed.
        // When the embedding model or chunk parameters change, ALL embeddings become invalid or inconsistent.
        // Mark books with embeddings for re-embed, then delete all embeddings.
        boolean providerChanged = oldSettings != null && !java.util.Objects.equals(oldSettings.getEmbeddingProvider(), newSettings.getEmbeddingProvider());
        boolean modelChanged = oldSettings != null && !java.util.Objects.equals(oldSettings.getEmbeddingModel(), newSettings.getEmbeddingModel());
        boolean externalUrlChanged = oldSettings != null && !java.util.Objects.equals(oldSettings.getExternalEmbeddingUrl(), newSettings.getExternalEmbeddingUrl());
        boolean chunkSizeChanged = oldSettings != null && !java.util.Objects.equals(oldSettings.getChunkSize(), newSettings.getChunkSize());
        boolean chunkOverlapChanged = oldSettings != null && !java.util.Objects.equals(oldSettings.getChunkOverlap(), newSettings.getChunkOverlap());
        boolean matryoshkaChanged = oldSettings != null && !java.util.Objects.equals(oldSettings.getMatryoshkaDimensions(), newSettings.getMatryoshkaDimensions());
        
        if (providerChanged || modelChanged || externalUrlChanged || chunkSizeChanged || chunkOverlapChanged || matryoshkaChanged) {
            logger.info("Embedding model/provider/chunking settings changed, initiating auto-heal database sequence.");
            try {
                jdbcTemplate.update("UPDATE book SET marked_for_ai_search = true WHERE id IN (SELECT book_id FROM book_embeddings)");
                jdbcTemplate.update("DELETE FROM book_embeddings");
                jdbcTemplate.update("DELETE FROM book_metadata_tag_mapping WHERE tag_id IN (SELECT id FROM tag WHERE name = 'AIS')");
                logger.info("Auto-heal sequence completed successfully.");
            } catch (Exception e) {
                logger.error("Failed to execute auto-heal sequence", e);
            }
        }

        // Fire Webhook
        String url = appProperties.getAiSearch().getBaseUrl() + "/v1/config";
        fireWebhook(url, newSettings);
    }

    private void handleAiPanelSettingsUpdate(AiPanelSettings newSettings) {
        String url = appProperties.getAi().getBaseUrl() + "/v1/config";
        fireWebhook(url, newSettings);
    }

    private void fireWebhook(String url, Object payload) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Object> request = new HttpEntity<>(payload, headers);
            // Fire in background with a brief delay to allow DB transaction to settle
            // before the Python service begins reloading models
            java.util.concurrent.CompletableFuture.runAsync(() -> {
                try {
                    Thread.sleep(500);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    return;
                }
                // Retry up to 3 times with exponential backoff
                int maxAttempts = 3;
                for (int attempt = 1; attempt <= maxAttempts; attempt++) {
                    try {
                        restTemplate.postForEntity(url, request, String.class);
                        logger.info("Successfully pushed config to {}", url);
                        return;
                    } catch (Exception e) {
                        if (attempt < maxAttempts) {
                            long backoff = (long) Math.pow(2, attempt) * 1000; // 2s, 4s
                            logger.warn("Failed to push config to {} (attempt {}/{}), retrying in {}ms: {}",
                                    url, attempt, maxAttempts, backoff, e.getMessage());
                            try {
                                Thread.sleep(backoff);
                            } catch (InterruptedException ie) {
                                Thread.currentThread().interrupt();
                                return;
                            }
                        } else {
                            logger.error("Failed to push config to {} after {} attempts: {}",
                                    url, maxAttempts, e.getMessage());
                        }
                    }
                }
            });
        } catch (Exception e) {
            logger.error("Error setting up webhook to {}", url, e);
        }
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

    private void validatePermission(AppSettingKey key, FableUser user) {
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

    private boolean hasPermissionForKey(AppSettingKey key, FableUser user) {
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
        builder.aiPanelDetectionEnabled(Boolean.parseBoolean(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.AI_PANEL_DETECTION_ENABLED, "false")));
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
        builder.aiPanelDetectionEnabled(Boolean.parseBoolean(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.AI_PANEL_DETECTION_ENABLED, "false")));
        builder.aiSearchEnabled(Boolean.parseBoolean(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.AI_SEARCH_ENABLED, "false")));
        builder.aiPanelSettings(settingPersistenceHelper.getJsonSetting(settingsMap, AppSettingKey.AI_PANEL_SETTINGS, AiPanelSettings.class, new AiPanelSettings(), true));
        builder.aiSearchSettings(settingPersistenceHelper.getJsonSetting(settingsMap, AppSettingKey.AI_SEARCH_SETTINGS, AiSearchSettings.class, new AiSearchSettings(), true));
        builder.pdfCacheSizeInMb(Integer.parseInt(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.PDF_CACHE_SIZE_IN_MB, "5120")));
        builder.maxFileUploadSizeInMb(Integer.parseInt(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.MAX_FILE_UPLOAD_SIZE_IN_MB, "100")));
        builder.metadataDownloadOnBookdrop(Boolean.parseBoolean(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.METADATA_DOWNLOAD_ON_BOOKDROP, "true")));
        builder.libraryHealthCheckIntervalSeconds(Integer.parseInt(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.LIBRARY_HEALTH_CHECK_INTERVAL_SECONDS, "120")));
        builder.allowFileDeletion(Boolean.parseBoolean(settingPersistenceHelper.getOrCreateSetting(AppSettingKey.ALLOW_FILE_DELETION, "false")));

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

        builder.oidcRedirectUris(settingPersistenceHelper.getJsonSetting(settingsMap, AppSettingKey.OIDC_REDIRECT_URIS, new TypeReference<>() {
        }, List.of("fable://oauth2-callback"), true));

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

    @SuppressWarnings("unchecked")
    public Map<String, Object> testAiConnection(AiTestConnectionRequest request, String path) {
        String url = appProperties.getAiSearch().getBaseUrl() + path;
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            Map<String, String> body = Map.of(
                "provider", request.getProvider() != null ? request.getProvider() : "",
                "url", request.getUrl() != null ? request.getUrl() : "",
                "apiKey", request.getApiKey() != null ? request.getApiKey() : "",
                "model", request.getModel() != null ? request.getModel() : ""
            );
            HttpEntity<Map<String, String>> entity = new HttpEntity<>(body, headers);
            var response = restTemplate.postForEntity(url, entity, Map.class);
            return response.getBody() != null ? response.getBody() : Map.of("success", false, "message", "Empty response");
        } catch (Exception e) {
            logger.error("AI connection test failed for {}: {}", path, e.getMessage());
            return Map.of("success", false, "message", "Could not reach AI Search service: " + e.getMessage());
        }
    }
}
