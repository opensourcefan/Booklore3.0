package org.booklore.controller;

import lombok.RequiredArgsConstructor;
import org.booklore.model.dto.ai.AiServiceStatus;
import org.booklore.repository.BookRepository;
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
    private final BookRepository bookRepository;

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

        return aiSearchService.embedBook(bookId, userId, chunks, false);
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

    @PostMapping("/scan-marked")
    public Map<String, Object> scanMarked(@RequestParam(defaultValue = "false") boolean force) {
        Long userId = authenticationService.getAuthenticatedUser().getId();
        String username = authenticationService.getAuthenticatedUser().getUsername();
        
        aiSearchService.startScanMarkedAiSearchEmbeddings(userId, username, force);
        return Map.of("status", "STARTED");
    }

    @PostMapping("/stop-scan")
    public Map<String, Object> stopScan() {
        aiSearchService.stopAiSearchScan();
        return Map.of("status", "STOPPED");
    }

    @GetMapping("/marked")
    public List<org.booklore.repository.projection.MarkedBookProjection> getMarkedBooks() {
        return aiSearchService.getMarkedBooks();
    }

    @PostMapping("/mark")
    public void markForAiSearch(@RequestBody Map<String, Object> payload) {
        @SuppressWarnings("unchecked")
        List<Number> rawBookIds = (List<Number>) payload.get("bookIds");
        Boolean marked = (Boolean) payload.get("marked");
        if (rawBookIds == null || rawBookIds.isEmpty()) {
            throw new IllegalArgumentException("bookIds are required.");
        }
        if (marked == null) {
            marked = true;
        }
        List<Long> bookIds = rawBookIds.stream().map(Number::longValue).toList();
        bookRepository.updateMarkedForAiSearch(bookIds, marked);
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
