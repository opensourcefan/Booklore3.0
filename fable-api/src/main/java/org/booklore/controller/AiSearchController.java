package org.booklore.controller;

import lombok.RequiredArgsConstructor;
import org.booklore.model.dto.ai.AiServiceStatus;
import org.booklore.service.ai.AiSearchHealthService;
import org.booklore.service.ai.AiSearchService;
import org.booklore.config.security.service.AuthenticationService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/ai/search")
public class AiSearchController {

    private final AiSearchHealthService aiSearchHealthService;
    private final AiSearchService aiSearchService;
    private final AuthenticationService authenticationService;

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

    @PostMapping("/extract-and-embed/{bookId}")
    public Map<String, Object> extractAndEmbedBook(@PathVariable Long bookId) {
        Long userId = authenticationService.getAuthenticatedUser().getId();
        String username = authenticationService.getAuthenticatedUser().getUsername();
        aiSearchService.extractAndEmbedBook(bookId, userId, username);
        return Map.of("status", "STARTED");
    }

    @PostMapping("/scan-missing")
    public Map<String, Object> scanMissing(@RequestBody Map<String, Object> payload) {
        @SuppressWarnings("unchecked")
        List<Long> pathIds = (List<Long>) payload.get("pathIds");
        if (pathIds == null || pathIds.isEmpty()) {
            throw new IllegalArgumentException("pathIds are required.");
        }
        Long userId = authenticationService.getAuthenticatedUser().getId();
        String username = authenticationService.getAuthenticatedUser().getUsername();
        aiSearchService.startScanMissingAiSearchEmbeddings(pathIds, userId, username);
        return Map.of("status", "STARTED");
    }

    @PostMapping("/stop-scan")
    public Map<String, Object> stopScan() {
        aiSearchService.stopAiSearchScan();
        return Map.of("status", "STOPPED");
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
