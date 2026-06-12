package org.fable.service.ai;

import lombok.RequiredArgsConstructor;
import org.fable.config.AppProperties;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class AiServiceEndpointResolver {

    private static final Set<String> DOCKER_INTERNAL_HOSTS = Set.of("app-ai-panel", "fable-ai-panel", "ai-panel");

    private final AppProperties appProperties;

    public String getConfiguredBaseUrl() {
        return normalize(appProperties.getAi().getBaseUrl());
    }

    public List<String> getCandidateBaseUrls() {
        LinkedHashSet<String> candidates = new LinkedHashSet<>();
        String configured = getConfiguredBaseUrl();
        if (!configured.isBlank()) {
            candidates.add(configured);
        }

        candidates.addAll(buildLocalFallbacks(configured));
        return new ArrayList<>(candidates);
    }

    public String resolveBaseUrl(RestClient restClient) {
        Exception lastFailure = null;

        for (String candidate : getCandidateBaseUrls()) {
            try {
                restClient.get()
                        .uri(candidate + "/health")
                        .retrieve()
                        .body(String.class);
                return candidate;
            } catch (Exception ex) {
                lastFailure = ex;
            }
        }

        throw new IllegalStateException("Could not reach AI service using configured or fallback endpoints.", lastFailure);
    }

    private List<String> buildLocalFallbacks(String configured) {
        if (configured.isBlank()) {
            return List.of();
        }

        try {
            URI uri = URI.create(configured);
            String host = uri.getHost();
            if (host == null || !DOCKER_INTERNAL_HOSTS.contains(host.toLowerCase())) {
                return List.of();
            }

            String scheme = uri.getScheme() == null ? "http" : uri.getScheme();
            int port = uri.getPort();
            LinkedHashSet<String> fallbacks = new LinkedHashSet<>();

            addHostFallback(fallbacks, scheme, "localhost", port);
            addHostFallback(fallbacks, scheme, "127.0.0.1", port);

            for (Integer candidatePort : getHostMappedPorts(port)) {
                addHostFallback(fallbacks, scheme, "localhost", candidatePort);
                addHostFallback(fallbacks, scheme, "127.0.0.1", candidatePort);
            }

            return new ArrayList<>(fallbacks);
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private List<Integer> getHostMappedPorts(int configuredPort) {
        Map<String, String> envOverrides = new LinkedHashMap<>();
        envOverrides.put("AI_SERVICE_HOST_PORT", System.getenv("AI_SERVICE_HOST_PORT"));
        envOverrides.put("AI_PANEL_PORT", System.getenv("AI_PANEL_PORT"));
        envOverrides.put("BOOKLORE_AI_PORT", System.getenv("BOOKLORE_AI_PORT"));

        LinkedHashSet<Integer> ports = new LinkedHashSet<>();
        for (String value : envOverrides.values()) {
            Integer parsed = parsePort(value);
            if (parsed != null) {
                ports.add(parsed);
            }
        }

        if (configuredPort == 8080) {
            ports.add(18080);
        }

        ports.remove(configuredPort);
        return new ArrayList<>(ports);
    }

    private Integer parsePort(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        try {
            int parsed = Integer.parseInt(value.trim());
            return parsed > 0 ? parsed : null;
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private void addHostFallback(Set<String> fallbacks, String scheme, String host, int port) {
        String authority = port > 0 ? host + ":" + port : host;
        fallbacks.add(scheme + "://" + authority);
    }

    private String normalize(String value) {
        if (value == null) {
            return "";
        }

        String normalized = value.trim();
        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }
}