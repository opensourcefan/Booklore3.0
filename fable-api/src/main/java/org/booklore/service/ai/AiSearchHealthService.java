package org.booklore.service.ai;

import lombok.RequiredArgsConstructor;
import org.booklore.config.AppProperties;
import org.booklore.model.dto.ai.AiServiceStatus;
import org.booklore.service.appsettings.AppSettingService;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Service
@RequiredArgsConstructor
public class AiSearchHealthService {

    private final AppProperties appProperties;
    private final AppSettingService appSettingService;
    private final AiServiceEndpointResolver aiServiceEndpointResolver;

    public AiServiceStatus getStatus() {
        boolean enabled = appSettingService.getAppSettings().isAiSearchEnabled();
        String baseUrl = appProperties.getAiSearch().getBaseUrl();

        if (!enabled) {
            return AiServiceStatus.builder()
                    .enabled(false)
                    .serviceReachable(false)
                    .status("DISABLED")
                    .message("AI Search is disabled in settings.")
                    .error(null)
                    .baseUrl(baseUrl)
                    .modelExists(null)
                    .modelPath(null)
                    .build();
        }

        try {
            RestClient restClient = RestClient.builder()
                    .requestFactory(buildRequestFactory())
                    .build();

            @SuppressWarnings("unchecked")
            Map<String, Object> healthPayload = restClient.get()
                    .uri(baseUrl + "/health")
                    .retrieve()
                    .body(Map.class);

            return mapHealthPayload(baseUrl, healthPayload);
        } catch (Exception ex) {
            return AiServiceStatus.builder()
                    .enabled(true)
                    .serviceReachable(false)
                    .status("UNAVAILABLE")
                    .message("Could not reach AI Search service. Start the AI Search container or set AI_SEARCH_SERVICE_BASE_URL to a reachable endpoint.")
                    .error(ex.getMessage())
                    .baseUrl(baseUrl)
                    .modelExists(null)
                    .modelPath(null)
                    .embeddingModel(null)
                    .build();
        }
    }

    private AiServiceStatus mapHealthPayload(String baseUrl, Map<String, Object> healthPayload) {
        if (healthPayload == null || healthPayload.isEmpty()) {
            return AiServiceStatus.builder()
                    .enabled(true)
                    .serviceReachable(false)
                    .status("ERROR")
                    .message("AI Search service returned an empty health response.")
                    .error("Empty health response")
                    .baseUrl(baseUrl)
                    .modelExists(null)
                    .modelPath(null)
                    .embeddingModel(null)
                    .build();
        }

        String rawStatus = asNormalizedString(healthPayload.get("status"));
        boolean modelExists = asBoolean(healthPayload.get("modelExists"));
        String modelPath = asNullableString(healthPayload.get("modelPath"));
        String loadError = asNullableString(healthPayload.get("loadError"));
        String embeddingModel = asNullableString(healthPayload.get("embeddingModel"));

        return switch (rawStatus) {
            case "ok" -> AiServiceStatus.builder()
                    .enabled(true)
                    .serviceReachable(true)
                    .status("READY")
                    .message("AI Search service is ready.")
                    .error(null)
                    .baseUrl(baseUrl)
                    .modelExists(modelExists)
                    .modelPath(modelPath)
                    .embeddingModel(embeddingModel)
                    .build();
            case "warming" -> AiServiceStatus.builder()
                    .enabled(true)
                    .serviceReachable(false)
                    .status("STARTING")
                    .message(modelExists
                            ? "AI Search service is reachable and still loading the embedding model."
                            : "AI Search service is reachable and preparing the embedding model file.")
                    .error(null)
                    .baseUrl(baseUrl)
                    .modelExists(modelExists)
                    .modelPath(modelPath)
                    .embeddingModel(embeddingModel)
                    .build();
            case "load_failed" -> AiServiceStatus.builder()
                    .enabled(true)
                    .serviceReachable(false)
                    .status("ERROR")
                    .message("AI Search service is reachable but model initialization failed.")
                    .error(loadError != null ? loadError : "Model load failed — check container logs for details.")
                    .baseUrl(baseUrl)
                    .modelExists(modelExists)
                    .modelPath(modelPath)
                    .embeddingModel(embeddingModel)
                    .build();
            case "missing_model" -> AiServiceStatus.builder()
                    .enabled(true)
                    .serviceReachable(false)
                    .status("ERROR")
                    .message("AI Search service is reachable but no embedding model file is available yet.")
                    .error(modelPath == null
                            ? "Missing embedding model file"
                            : "Missing embedding model file at " + modelPath)
                    .baseUrl(baseUrl)
                    .modelExists(modelExists)
                    .modelPath(modelPath)
                    .embeddingModel(embeddingModel)
                    .build();
            default -> AiServiceStatus.builder()
                    .enabled(true)
                    .serviceReachable(false)
                    .status("ERROR")
                    .message("AI Search service returned an unrecognized health status.")
                    .error(rawStatus.isBlank() ? "Missing health status" : "Unrecognized status: " + rawStatus)
                    .baseUrl(baseUrl)
                    .modelExists(modelExists)
                    .modelPath(modelPath)
                    .embeddingModel(embeddingModel)
                    .build();
        };
    }

    private String asNormalizedString(Object value) {
        if (value == null) {
            return "";
        }
        return value.toString().trim().toLowerCase();
    }

    private boolean asBoolean(Object value) {
        if (value instanceof Boolean b) {
            return b;
        }
        if (value instanceof String s) {
            return Boolean.parseBoolean(s);
        }
        return false;
    }

    private String asNullableString(Object value) {
        if (value == null) {
            return null;
        }
        String normalized = value.toString().trim();
        return normalized.isEmpty() ? null : normalized;
    }

    public Map<String, Object> triggerReload() {
        boolean enabled = appSettingService.getAppSettings().isAiSearchEnabled();
        if (!enabled) {
            return Map.of("triggered", false, "reason", "AI Search is disabled.");
        }
        try {
            RestClient restClient = RestClient.builder()
                    .requestFactory(buildRequestFactory())
                    .build();
            String baseUrl = appProperties.getAiSearch().getBaseUrl();
            @SuppressWarnings("unchecked")
            Map<String, Object> result = restClient.post()
                    .uri(baseUrl + "/v1/reload")
                    .retrieve()
                    .body(Map.class);
            return result != null ? result : Map.of("triggered", false, "reason", "Empty response from AI Search service.");
        } catch (Exception ex) {
            return Map.of("triggered", false, "reason", "Could not reach AI Search service: " + ex.getMessage());
        }
    }

    private SimpleClientHttpRequestFactory buildRequestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(appProperties.getAiSearch().getConnectTimeoutMs());
        factory.setReadTimeout(appProperties.getAiSearch().getReadTimeoutMs());
        return factory;
    }
}
