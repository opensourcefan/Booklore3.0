package org.fable.service.ai;

import lombok.RequiredArgsConstructor;
import org.fable.config.AppProperties;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

/**
 * Applies the optional {@code X-Fable-Ai-Search-Secret} header for RestTemplate
 * calls to the AI Search sidecar. When the shared secret is blank, no header is
 * added (optional/home installs stay open).
 */
@Component
@RequiredArgsConstructor
public class AiSearchAuthHeaders {

    public static final String HEADER_NAME = "X-Fable-Ai-Search-Secret";

    private final AppProperties appProperties;

    public void apply(HttpHeaders headers) {
        String secret = appProperties.getAiSearch().getSharedSecret();
        if (secret != null && !secret.isBlank()) {
            headers.set(HEADER_NAME, secret);
        }
    }

    public HttpHeaders jsonHeaders() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        apply(headers);
        return headers;
    }

    public <T> HttpEntity<T> jsonEntity(T body) {
        return new HttpEntity<>(body, jsonHeaders());
    }

    public HttpEntity<Void> emptyEntity() {
        HttpHeaders headers = new HttpHeaders();
        apply(headers);
        return new HttpEntity<>(headers);
    }
}
