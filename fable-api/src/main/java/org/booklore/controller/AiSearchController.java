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

        @SuppressWarnings("unchecked")
        List<Map<String, String>> chatHistory = (List<Map<String, String>>) payload.get("chatHistory");

        boolean localOnly = Boolean.TRUE.equals(payload.get("localOnly"));

        if (query == null || query.isBlank()) {
            throw new IllegalArgumentException("query is required.");
        }
        if (userId == null) {
            throw new IllegalArgumentException("userId is required.");
        }

        return aiSearchService.search(query, bookIds, userId, chatHistory, localOnly);
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
        List<Integer> libraryPathIdsInt = (List<Integer>) payload.get("libraryPathIds");
        if (libraryPathIdsInt == null || libraryPathIdsInt.isEmpty()) {
            throw new IllegalArgumentException("libraryPathIds is required");
        }
        List<Long> libraryPathIds = libraryPathIdsInt.stream().map(Integer::longValue).toList();
        
        Long userId = authenticationService.getAuthenticatedUser().getId();
        String username = authenticationService.getAuthenticatedUser().getUsername();
        
        aiSearchService.startScanMissingAiSearchEmbeddings(libraryPathIds, userId, username);
        return Map.of("status", "STARTED");
    }

    @PostMapping("/scan-marked")
    public Map<String, Object> scanMarked(@RequestBody Map<String, Object> payload) {
        Long userId = authenticationService.getAuthenticatedUser().getId();
        String username = authenticationService.getAuthenticatedUser().getUsername();
        boolean forceRescan = Boolean.TRUE.equals(payload.get("forceRescan"));
        
        aiSearchService.startScanMarkedAiSearchEmbeddings(userId, username, forceRescan);
        return Map.of("status", "STARTED");
    }

    @PostMapping("/stop-scan")
    public Map<String, Object> stopScan() {
        aiSearchService.stopAiSearchScan();
        return Map.of("status", "STOPPED");
    }

    @PostMapping("/mark")
    public Map<String, Object> markBooksForAiSearch(@RequestBody Map<String, Object> payload) {
        @SuppressWarnings("unchecked")
        List<Integer> bookIdsInt = (List<Integer>) payload.get("bookIds");
        Boolean marked = (Boolean) payload.get("marked");

        if (bookIdsInt == null || marked == null) {
            throw new IllegalArgumentException("bookIds and marked status are required");
        }

        List<Long> bookIds = bookIdsInt.stream().map(Integer::longValue).toList();
        bookRepository.updateMarkedForAiSearch(bookIds, marked);
        return Map.of("status", "UPDATED", "count", bookIds.size());
    }

    @GetMapping("/marked")
    public List<org.booklore.model.dto.Book> getMarkedBooks() {
        List<org.booklore.repository.projection.MarkedBookProjection> marked = bookRepository.findMarkedBooksInfo();
        return marked.stream().map(p -> org.booklore.model.dto.Book.builder()
                .id(p.getId())
                .title(p.getTitle())
                .libraryName(p.getLibraryName())
                .build()).toList();
    }

    @GetMapping("/stats")
    public List<org.booklore.repository.projection.EmbeddingStatsProjection> getEmbeddingStats() {
        Long userId = authenticationService.getAuthenticatedUser().getId();
        return aiSearchService.getEmbeddingStats(userId);
    }

    @DeleteMapping("/embeddings")
    public Map<String, Object> deleteEmbeddings(@RequestBody Map<String, Object> payload) {
        @SuppressWarnings("unchecked")
        List<Number> rawBookIds = (List<Number>) payload.get("bookIds");
        if (rawBookIds == null || rawBookIds.isEmpty()) {
            throw new IllegalArgumentException("bookIds are required.");
        }
        Long userId = authenticationService.getAuthenticatedUser().getId();
        List<Long> bookIds = rawBookIds.stream().map(Number::longValue).toList();
        int deleted = aiSearchService.deleteBookEmbeddings(bookIds, userId);
        return Map.of("deletedCount", deleted);
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
