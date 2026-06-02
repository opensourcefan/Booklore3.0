package org.booklore.controller;

import lombok.RequiredArgsConstructor;
import org.booklore.model.dto.ai.AiServiceStatus;
import org.booklore.service.ai.AiSearchHealthService;
import org.booklore.service.ai.AiSearchService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/ai/search")
public class AiSearchController {

    private final AiSearchHealthService aiSearchHealthService;
    private final AiSearchService aiSearchService;

    @GetMapping("/status")
    public AiServiceStatus getStatus() {
        return aiSearchHealthService.getStatus();
    }

    @PostMapping("/reload")
    public Map<String, Object> reload() {
        return aiSearchHealthService.triggerReload();
    }

    @PostMapping("/embed")
    public Map<String, Object> embedBook(@RequestBody Map<String, Object> payload) {
        Long bookId = toLong(payload.get("bookId"));
        Long userId = toLong(payload.get("userId"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> chunks = (List<Map<String, Object>>) payload.get("chunks");

        if (bookId == null || userId == null) {
            throw new IllegalArgumentException("bookId and userId are required.");
        }
        if (chunks == null || chunks.isEmpty()) {
            throw new IllegalArgumentException("chunks are required.");
        }

        return aiSearchService.embedBook(bookId, userId, chunks);
    }

    @PostMapping("/query")
    public Map<String, Object> search(@RequestBody Map<String, Object> payload) {
        String query = (String) payload.get("query");
        @SuppressWarnings("unchecked")
        List<Long> bookIds = (List<Long>) payload.get("bookIds");
        Long userId = toLong(payload.get("userId"));

        if (query == null || query.isBlank()) {
            throw new IllegalArgumentException("query is required.");
        }
        if (userId == null) {
            throw new IllegalArgumentException("userId is required.");
        }

        return aiSearchService.search(query, bookIds, userId);
    }

    @GetMapping("/book-embeddings/{bookId}")
    public Map<String, Object> getBookEmbeddings(@PathVariable Long bookId, @RequestParam Long userId) {
        return aiSearchService.getBookEmbeddingStatus(bookId, userId);
    }

    @GetMapping("/embed-status/{jobId}")
    public Map<String, Object> getEmbedJobStatus(@PathVariable String jobId) {
        return aiSearchService.getEmbedJobStatus(jobId);
    }

    private Long toLong(Object value) {
        if (value instanceof Number n) {
            return n.longValue();
        }
        if (value instanceof String s) {
            try {
                return Long.parseLong(s);
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }
}
