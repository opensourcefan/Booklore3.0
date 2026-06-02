package org.booklore.service.ai;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.booklore.config.AppProperties;
import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookFileEntity;
import org.booklore.model.enums.BookFileType;
import org.booklore.model.websocket.Topic;
import org.booklore.repository.BookRepository;
import org.booklore.config.security.service.AuthenticationService;
import org.booklore.service.NotificationService;
import org.booklore.util.epub.EpubContentReader;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.jsoup.Jsoup;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.io.File;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

@Slf4j
@Service
@RequiredArgsConstructor
public class AiSearchService {

    private final AppProperties appProperties;
    private final NotificationService notificationService;
    private final BookRepository bookRepository;
    private final AuthenticationService authenticationService;

    private static final int CHUNK_SIZE = 500;
    private static final int CHUNK_OVERLAP = 50;
    private static final int CHUNK_BATCH_SIZE = 50;

    private final AtomicBoolean scanInProgress = new AtomicBoolean(false);

    public void stopAiSearchScan() {
        scanInProgress.set(false);
    }

    @Async
    public void startScanMissingAiSearchEmbeddings(List<Long> libraryPathIds, Long userId, String username) {
        if (!scanInProgress.compareAndSet(false, true)) {
            log.warn("AI Search scan already in progress");
            return;
        }

        try {
            sendBatchProgress(username, "STARTED", "Finding books to scan...", null, 0, 0);

            List<Long> epubBookIds = bookRepository.findAllBookIdsByLibraryPathIdInAndBookType(libraryPathIds, BookFileType.EPUB);
            List<Long> pdfBookIds = bookRepository.findAllBookIdsByLibraryPathIdInAndBookType(libraryPathIds, BookFileType.PDF);
            
            Set<Long> allBookIds = new HashSet<>();
            allBookIds.addAll(epubBookIds);
            allBookIds.addAll(pdfBookIds);

            if (allBookIds.isEmpty()) {
                sendBatchProgress(username, "COMPLETED", "No EPUB or PDF books found in selected paths.", null, 0, 0);
                return;
            }

            List<Long> embeddedIds = bookRepository.findBookIdsWithAiSearchEmbeddings(userId, allBookIds);
            allBookIds.removeAll(embeddedIds);

            int total = allBookIds.size();
            if (total == 0) {
                sendBatchProgress(username, "COMPLETED", "All books in selected paths are already embedded.", null, 0, 0);
                return;
            }

            int current = 0;
            sendBatchProgress(username, "IN_PROGRESS", "Starting extraction...", null, current, total);

            for (Long bookId : allBookIds) {
                if (!scanInProgress.get()) {
                    sendBatchProgress(username, "STOPPED", "Scan was manually stopped.", null, current, total);
                    return;
                }
                
                try {
                    extractAndEmbedBookInternal(bookId, userId, username, true);
                } catch (Exception e) {
                    log.error("Failed to embed book {} during batch scan: {}", bookId, e.getMessage());
                }
                current++;
                sendBatchProgress(username, "IN_PROGRESS", "Extracted book " + current + " of " + total, null, current, total);
            }

            sendBatchProgress(username, "COMPLETED", "Scan completed.", null, total, total);

        } catch (Exception e) {
            log.error("Batch AI Search scan failed", e);
            sendBatchProgress(username, "FAILED", "Scan failed: " + e.getMessage(), e.getMessage(), 0, 0);
        } finally {
            scanInProgress.set(false);
        }
    }

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

    /**
     * Extracts text from a book file (EPUB or PDF), chunks it, and sends to the AI Search
     * container for embedding. This is the primary user-facing "Embed for AI Search" flow.
     */
    @Async
    public void extractAndEmbedBook(Long bookId, Long userId, String username) {
        extractAndEmbedBookInternal(bookId, userId, username, false);
    }

    private void extractAndEmbedBookInternal(Long bookId, Long userId, String username, boolean isBatch) {
        BookEntity book = bookRepository.findByIdWithBookFiles(bookId)
                .orElseThrow(() -> new IllegalArgumentException("Book not found: " + bookId));

        BookFileEntity primaryFile = book.getPrimaryBookFile();
        if (primaryFile == null) {
            throw new IllegalArgumentException("Book has no files: " + bookId);
        }

        Path fullPath = book.getFullFilePath();
        if (fullPath == null) {
            throw new IllegalArgumentException("Cannot resolve file path for book: " + bookId);
        }

        File file = fullPath.toFile();
        if (!file.exists()) {
            throw new IllegalArgumentException("Book file not found on disk: " + fullPath);
        }

        if (!isBatch) {
            sendSearchProgress(username, "STARTED", "Extracting text from " + file.getName(), null);
        }

        try {
            if (primaryFile.getBookType() == BookFileType.EPUB) {
                extractEpubChunks(file, bookId, userId);
            } else if (primaryFile.getBookType() == BookFileType.PDF) {
                extractPdfChunks(file, bookId, userId);
            } else {
                throw new IllegalArgumentException("Unsupported book type for AI Search: " + primaryFile.getBookType());
            }
            if (!isBatch) {
                sendSearchProgress(username, "COMPLETED", "Book embedded successfully", null);
            }
        } catch (Exception e) {
            log.error("Failed to extract or embed book {}: {}", bookId, e.getMessage(), e);
            if (!isBatch) {
                sendSearchProgress(username, "FAILED", "Extraction/Embedding failed", e.getMessage());
            }
            throw new RuntimeException("Extraction/Embedding failed", e);
        }
    }

    private void extractEpubChunks(File epubFile, Long bookId, Long userId) throws Exception {
        int spineSize = EpubContentReader.getSpineSize(epubFile);
        List<Map<String, Object>> chunkBatch = new ArrayList<>();

        for (int i = 0; i < spineSize; i++) {
            String html = EpubContentReader.getSpineItemContent(epubFile, i);
            String text = Jsoup.parse(html).text();
            if (text.isBlank()) {
                continue;
            }

            List<String> textChunks = chunkText(text);
            for (String tc : textChunks) {
                Map<String, Object> chunk = new LinkedHashMap<>();
                chunk.put("text", tc);
                chunk.put("pageNumber", i + 1);
                chunk.put("chapterTitle", null);
                chunkBatch.add(chunk);

                if (chunkBatch.size() >= CHUNK_BATCH_SIZE) {
                    embedBook(bookId, userId, chunkBatch);
                    chunkBatch.clear();
                }
            }
        }

        if (!chunkBatch.isEmpty()) {
            embedBook(bookId, userId, chunkBatch);
            chunkBatch.clear();
        }
    }

    private void extractPdfChunks(File pdfFile, Long bookId, Long userId) throws Exception {
        List<Map<String, Object>> chunkBatch = new ArrayList<>();

        try (PDDocument document = Loader.loadPDF(pdfFile)) {
            PDFTextStripper stripper = new PDFTextStripper();
            int pageCount = document.getNumberOfPages();

            for (int page = 1; page <= pageCount; page++) {
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                String text = stripper.getText(document);
                if (text == null || text.isBlank()) {
                    continue;
                }

                List<String> textChunks = chunkText(text);
                for (String tc : textChunks) {
                    Map<String, Object> chunk = new LinkedHashMap<>();
                    chunk.put("text", tc);
                    chunk.put("pageNumber", page);
                    chunk.put("chapterTitle", null);
                    chunkBatch.add(chunk);

                    if (chunkBatch.size() >= CHUNK_BATCH_SIZE) {
                        embedBook(bookId, userId, chunkBatch);
                        chunkBatch.clear();
                    }
                }
            }
        }

        if (!chunkBatch.isEmpty()) {
            embedBook(bookId, userId, chunkBatch);
            chunkBatch.clear();
        }
    }

    private List<String> chunkText(String text) {
        List<String> chunks = new ArrayList<>();
        String cleaned = text.replaceAll("\\s+", " ").trim();
        if (cleaned.isEmpty()) {
            return chunks;
        }

        int start = 0;
        while (start < cleaned.length()) {
            int end = Math.min(start + CHUNK_SIZE, cleaned.length());
            if (end < cleaned.length()) {
                int lastSpace = cleaned.lastIndexOf(' ', end);
                if (lastSpace > start + CHUNK_SIZE / 2) {
                    end = lastSpace;
                }
            }
            chunks.add(cleaned.substring(start, end).trim());
            start = end - CHUNK_OVERLAP;
            if (start < 0) start = 0;
            if (start >= cleaned.length()) break;
        }

        return chunks;
    }

    public void sendSearchProgress(String username, String event, String message, String error) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("mode", "SINGLE");
        payload.put("event", event);
        payload.put("message", message);
        if (error != null) {
            payload.put("error", error);
        }
        notificationService.sendMessageToUser(username, Topic.AI_SEARCH_PROGRESS, payload);
    }

    public void sendBatchProgress(String username, String event, String message, String error, int current, int total) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("mode", "BATCH");
        payload.put("event", event);
        payload.put("message", message);
        payload.put("current", current);
        payload.put("total", total);
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
