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
public class AiServiceHealthService {

    private final AppProperties appProperties;
    private final AppSettingService appSettingService;

    public AiServiceStatus getStatus() {
        boolean enabled = appSettingService.getAppSettings().isAiPanelDetectionEnabled();
        String baseUrl = appProperties.getAi().getBaseUrl();

        if (!enabled) {
            return AiServiceStatus.builder()
                    .enabled(false)
                    .serviceReachable(false)
                    .status("DISABLED")
                    .message("AI panel detection is disabled in settings.")
                    .error(null)
                    .baseUrl(baseUrl)
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
                    .message("Could not reach AI service.")
                    .error(ex.getMessage())
                    .baseUrl(baseUrl)
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
                    .build();
        }

        String rawStatus = asNormalizedString(healthPayload.get("status"));
        boolean modelExists = asBoolean(healthPayload.get("modelExists"));

        return switch (rawStatus) {
            case "ok" -> AiServiceStatus.builder()
                    .enabled(true)
                    .serviceReachable(true)
                    .status("READY")
                    .message("AI service is ready.")
                    .error(null)
                    .baseUrl(baseUrl)
                    .build();
            case "warming" -> AiServiceStatus.builder()
                    .enabled(true)
                    .serviceReachable(false)
                    .status("WARMING")
                    .message(modelExists
                            ? "AI service is reachable but still warming up."
                            : "AI service is reachable but the model is not ready.")
                    .error(null)
                    .baseUrl(baseUrl)
                    .build();
            default -> AiServiceStatus.builder()
                    .enabled(true)
                    .serviceReachable(false)
                    .status("ERROR")
                    .message("AI service returned an unrecognized health status.")
                    .error(rawStatus.isBlank() ? "Missing health status" : "Unrecognized status: " + rawStatus)
                    .baseUrl(baseUrl)
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

    private SimpleClientHttpRequestFactory buildRequestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(appProperties.getAi().getConnectTimeoutMs());
        factory.setReadTimeout(appProperties.getAi().getReadTimeoutMs());
        return factory;
    }
}
