package org.booklore.service.ai;

import lombok.RequiredArgsConstructor;
import org.booklore.config.AppProperties;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class AiServiceEndpointResolver {

    private static final Set<String> DOCKER_INTERNAL_HOSTS = Set.of("booklore-ai-panel", "ai-panel");

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
            String authority = port > 0 ? "localhost:" + port : "localhost";
            return List.of(scheme + "://" + authority);
        } catch (Exception ignored) {
            return List.of();
        }
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