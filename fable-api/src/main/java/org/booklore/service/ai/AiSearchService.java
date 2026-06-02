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
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.io.File;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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
    public Map<String, Object> extractAndEmbedBook(Long bookId) {
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

        Long userId = authenticationService.getAuthenticatedUser().getId();
        String username = authenticationService.getAuthenticatedUser().getUsername();

        sendSearchProgress(username, "STARTED", "Extracting text from " + file.getName(), null);

        List<Map<String, Object>> chunks;
        try {
            if (primaryFile.getBookType() == BookFileType.EPUB) {
                chunks = extractEpubChunks(file);
            } else if (primaryFile.getBookType() == BookFileType.PDF) {
                chunks = extractPdfChunks(file);
            } else {
                throw new IllegalArgumentException("Unsupported book type for AI Search: " + primaryFile.getBookType());
            }
        } catch (Exception e) {
            log.error("Failed to extract text from book {}: {}", bookId, e.getMessage(), e);
            sendSearchProgress(username, "FAILED", "Text extraction failed", e.getMessage());
            Map<String, Object> errorResult = new LinkedHashMap<>();
            errorResult.put("status", "FAILED");
            errorResult.put("error", e.getMessage());
            return errorResult;
        }

        if (chunks.isEmpty()) {
            sendSearchProgress(username, "FAILED", "No text content found in book", null);
            Map<String, Object> emptyResult = new LinkedHashMap<>();
            emptyResult.put("status", "FAILED");
            emptyResult.put("error", "No text content found in book");
            return emptyResult;
        }

        sendSearchProgress(username, "EMBEDDING", "Sending " + chunks.size() + " chunks for embedding", null);

        try {
            Map<String, Object> result = embedBook(bookId, userId, chunks);
            sendSearchProgress(username, "COMPLETED", "Book embedded successfully (" + chunks.size() + " chunks)", null);
            return result;
        } catch (Exception e) {
            log.error("Failed to embed book {}: {}", bookId, e.getMessage(), e);
            sendSearchProgress(username, "FAILED", "Embedding failed", e.getMessage());
            Map<String, Object> errorResult = new LinkedHashMap<>();
            errorResult.put("status", "FAILED");
            errorResult.put("error", e.getMessage());
            return errorResult;
        }
    }

    private List<Map<String, Object>> extractEpubChunks(File epubFile) throws Exception {
        List<Map<String, Object>> chunks = new ArrayList<>();
        int spineSize = EpubContentReader.getSpineSize(epubFile);

        for (int i = 0; i < spineSize; i++) {
            String html = EpubContentReader.getSpineItemContent(epubFile, i);
            String text = Jsoup.parse(html).text();
            if (text.isBlank()) {
                continue;
            }

            List<String> textChunks = chunkText(text);
            for (int j = 0; j < textChunks.size(); j++) {
                Map<String, Object> chunk = new LinkedHashMap<>();
                chunk.put("text", textChunks.get(j));
                chunk.put("pageNumber", i + 1);
                chunk.put("chapterTitle", null);
                chunks.add(chunk);
            }
        }

        return chunks;
    }

    private List<Map<String, Object>> extractPdfChunks(File pdfFile) throws Exception {
        List<Map<String, Object>> chunks = new ArrayList<>();

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
                for (int j = 0; j < textChunks.size(); j++) {
                    Map<String, Object> chunk = new LinkedHashMap<>();
                    chunk.put("text", textChunks.get(j));
                    chunk.put("pageNumber", page);
                    chunk.put("chapterTitle", null);
                    chunks.add(chunk);
                }
            }
        }

        return chunks;
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
