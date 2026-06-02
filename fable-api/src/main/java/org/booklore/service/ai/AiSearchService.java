package org.booklore.service.ai;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.booklore.config.AppProperties;
import org.booklore.model.websocket.Topic;
import org.booklore.service.NotificationService;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiSearchService {

    private final AppProperties appProperties;
    private final NotificationService notificationService;

    public Map<String, Object> embedBook(Long bookId, Long userId, List<Map<String, Object>> chunks) {
        String baseUrl = appProperties.getAiSearch().getBaseUrl();
        RestClient restClient = buildRestClient();

        Map<String, Object> payload = Map.of(
                "bookId", bookId,
                "userId", userId,
                "chunks", chunks
        );

        @SuppressWarnings("unchecked")
        Map<String, Object> result = restClient.post()
                .uri(baseUrl + "/v1/embed")
                .body(payload)
                .retrieve()
                .body(Map.class);

        return result;
    }

    public Map<String, Object> search(String query, List<Long> bookIds, Long userId) {
        String baseUrl = appProperties.getAiSearch().getBaseUrl();
        RestClient restClient = buildRestClient();

        Map<String, Object> payload = Map.of(
                "query", query,
                "bookIds", bookIds != null ? bookIds : List.of(),
                "userId", userId
        );

        @SuppressWarnings("unchecked")
        Map<String, Object> result = restClient.post()
                .uri(baseUrl + "/v1/search")
                .body(payload)
                .retrieve()
                .body(Map.class);

        return result;
    }

    public Map<String, Object> getBookEmbeddingStatus(Long bookId, Long userId) {
        String baseUrl = appProperties.getAiSearch().getBaseUrl();
        RestClient restClient = buildRestClient();

        @SuppressWarnings("unchecked")
        Map<String, Object> result = restClient.get()
                .uri(baseUrl + "/v1/book-embeddings/{bookId}?user_id={userId}", bookId, userId)
                .retrieve()
                .body(Map.class);

        return result;
    }

    public Map<String, Object> getEmbedJobStatus(String jobId) {
        String baseUrl = appProperties.getAiSearch().getBaseUrl();
        RestClient restClient = buildRestClient();

        @SuppressWarnings("unchecked")
        Map<String, Object> result = restClient.get()
                .uri(baseUrl + "/v1/embed-status/{jobId}", jobId)
                .retrieve()
                .body(Map.class);

        return result;
    }

    public void sendSearchProgress(String username, String event, String message, String error) {
        Map<String, Object> payload = new java.util.LinkedHashMap<>();
        payload.put("event", event);
        payload.put("message", message);
        if (error != null) {
            payload.put("error", error);
        }
        notificationService.sendMessageToUser(username, Topic.AI_SEARCH_PROGRESS, payload);
    }

    private RestClient buildRestClient() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(appProperties.getAiSearch().getConnectTimeoutMs());
        factory.setReadTimeout(appProperties.getAiSearch().getReadTimeoutMs());
        return RestClient.builder().requestFactory(factory).build();
    }
}
