package org.fable.service.ai;

import lombok.RequiredArgsConstructor;
import org.fable.config.AppProperties;
import org.fable.model.dto.ai.AiServiceStatus;
import org.fable.service.appsettings.AppSettingService;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Map;

@Service
@RequiredArgsConstructor
public class AiServiceHealthService {

    private final AppProperties appProperties;
    private final AppSettingService appSettingService;
    private final AiServiceEndpointResolver aiServiceEndpointResolver;

    public AiServiceStatus getStatus() {
        boolean enabled = appSettingService.getAppSettings().isAiPanelDetectionEnabled();
        String baseUrl = aiServiceEndpointResolver.getConfiguredBaseUrl();

        if (!enabled) {
            return AiServiceStatus.builder()
                    .enabled(false)
                    .serviceReachable(false)
                    .status("DISABLED")
                    .message("AI panel detection is disabled in settings.")
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

            String resolvedBaseUrl = aiServiceEndpointResolver.resolveBaseUrl(restClient);

            @SuppressWarnings("unchecked")
            Map<String, Object> healthPayload = restClient.get()
                .uri(resolvedBaseUrl + "/health")
                    .retrieve()
                .body(Map.class);

            return mapHealthPayload(resolvedBaseUrl, healthPayload);
        } catch (Exception ex) {
            return AiServiceStatus.builder()
                    .enabled(true)
                    .serviceReachable(false)
                    .status("UNAVAILABLE")
                    .message("Could not reach AI service. Start the AI container or set AI_SERVICE_BASE_URL to a reachable endpoint.")
                    .error(ex.getMessage())
                    .baseUrl(baseUrl)
                    .modelExists(null)
                    .modelPath(null)
                    .build();
        }
    }

    private AiServiceStatus mapHealthPayload(String baseUrl, Map<String, Object> healthPayload) {
        if (healthPayload == null || healthPayload.isEmpty()) {
            return AiServiceStatus.builder()
                    .enabled(true)
                    .serviceReachable(false)
                    .status("ERROR")
                    .message("AI service returned an empty health response.")
                    .error("Empty health response")
                    .baseUrl(baseUrl)
                .modelExists(null)
                .modelPath(null)
                    .build();
        }

        String rawStatus = asNormalizedString(healthPayload.get("status"));
        boolean modelExists = asBoolean(healthPayload.get("modelExists"));
        String modelPath = asNullableString(healthPayload.get("modelPath"));
        String loadError = asNullableString(healthPayload.get("loadError"));

        return switch (rawStatus) {
            case "ok" -> AiServiceStatus.builder()
                    .enabled(true)
                    .serviceReachable(true)
                    .status("READY")
                    .message("AI service is ready.")
                    .error(null)
                    .baseUrl(baseUrl)
                .modelExists(modelExists)
                .modelPath(modelPath)
                    .build();
            case "warming" -> AiServiceStatus.builder()
                    .enabled(true)
                    .serviceReachable(false)
                    .status("STARTING")
                    .message(modelExists
                        ? "AI service is reachable and still loading the local model."
                        : "AI service is reachable and preparing the local model file.")
                    .error(null)
                    .baseUrl(baseUrl)
                    .modelExists(modelExists)
                    .modelPath(modelPath)
                    .build();
                case "load_failed" -> AiServiceStatus.builder()
                    .enabled(true)
                    .serviceReachable(false)
                    .status("ERROR")
                    .message("AI service is reachable but model initialization failed.")
                    .error(loadError != null ? loadError : "Model load failed — check container logs for details.")
                    .baseUrl(baseUrl)
                    .modelExists(modelExists)
                    .modelPath(modelPath)
                    .build();
                case "missing_model" -> AiServiceStatus.builder()
                    .enabled(true)
                    .serviceReachable(false)
                    .status("ERROR")
                    .message("AI service is reachable but no local model file is available yet.")
                    .error(modelPath == null
                        ? "Missing local model file"
                        : "Missing local model file at " + modelPath)
                    .baseUrl(baseUrl)
                    .modelExists(modelExists)
                    .modelPath(modelPath)
                    .build();
            default -> AiServiceStatus.builder()
                    .enabled(true)
                    .serviceReachable(false)
                    .status("ERROR")
                    .message("AI service returned an unrecognized health status.")
                    .error(rawStatus.isBlank() ? "Missing health status" : "Unrecognized status: " + rawStatus)
                    .baseUrl(baseUrl)
                .modelExists(modelExists)
                .modelPath(modelPath)
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

    public java.util.Map<String, Object> triggerReload() {
        boolean enabled = appSettingService.getAppSettings().isAiPanelDetectionEnabled();
        if (!enabled) {
            return java.util.Map.of("triggered", false, "reason", "AI panel detection is disabled.");
        }
        try {
            RestClient restClient = RestClient.builder()
                    .requestFactory(buildRequestFactory())
                    .build();
            String resolvedBaseUrl = aiServiceEndpointResolver.resolveBaseUrl(restClient);
            @SuppressWarnings("unchecked")
            java.util.Map<String, Object> result = restClient.post()
                    .uri(resolvedBaseUrl + "/v1/reload")
                    .retrieve()
                    .body(java.util.Map.class);
            return result != null ? result : java.util.Map.of("triggered", false, "reason", "Empty response from AI service.");
        } catch (Exception ex) {
            return java.util.Map.of("triggered", false, "reason", "Could not reach AI service: " + ex.getMessage());
        }
    }

    private SimpleClientHttpRequestFactory buildRequestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(appProperties.getAi().getConnectTimeoutMs());
        factory.setReadTimeout(appProperties.getAi().getReadTimeoutMs());
        return factory;
    }
}
