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

import java.text.BreakIterator;
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
    private final AiSearchHealthService aiSearchHealthService;
    private final org.booklore.service.appsettings.AppSettingService appSettingService;

    private static final int CHUNK_SIZE = 1500;
    private static final int CHUNK_OVERLAP = 100;
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

            List<Long> embeddedIds = bookRepository.findBookIdsWithAiSearchEmbeddings(userId, allBookIds)
                .stream()
                .map(org.booklore.repository.projection.AiSearchBookStatusProjection::getBookId)
                .toList();
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


    public List<org.booklore.repository.projection.MarkedBookProjection> getMarkedBooks() {
        return bookRepository.findMarkedBooksInfo();
    }

    public int deleteBookEmbeddings(List<Long> bookIds, Long userId) {
        if (bookIds == null || bookIds.isEmpty()) {
            throw new IllegalArgumentException("bookIds are required.");
        }
        if (userId == null) {
            throw new IllegalArgumentException("userId is required.");
        }
        return bookRepository.deleteBookEmbeddings(bookIds, userId);
    }

    @Async
    public void startScanMarkedAiSearchEmbeddings(Long userId, String username, boolean force) {
        if (!scanInProgress.compareAndSet(false, true)) {
            log.warn("AI Search scan already in progress");
            return;
        }

        try {
            sendBatchProgress(username, "STARTED", "Finding marked books to scan...", null, 0, 0);

            List<Long> markedBookIds = bookRepository.findBookIdsByMarkedForAiSearchTrue();

            int total = markedBookIds.size();
            if (total == 0) {
                sendBatchProgress(username, "COMPLETED", "No books are marked for AI Search.", null, 0, 0);
                return;
            }

            int current = 0;
            int scannedCount = 0;
            int skippedCount = 0;
            int errorCount = 0;

            sendBatchProgress(username, "IN_PROGRESS", "Starting extraction...", null, current, total);

            String activeModel = aiSearchHealthService.getStatus().getEmbeddingModel();
            
            // Pre-fetch embedding status for all marked books to optimize skipping
            List<org.booklore.repository.projection.AiSearchBookStatusProjection> embeddedStatuses = 
                bookRepository.findBookIdsWithAiSearchEmbeddings(userId, markedBookIds);
            
            Map<Long, String> embeddedModelsMap = new java.util.HashMap<>();
            for (var status : embeddedStatuses) {
                embeddedModelsMap.put(status.getBookId(), status.getEmbeddingModel());
            }

            for (Long bookId : markedBookIds) {
                if (!scanInProgress.get()) {
                    String stopMsg = String.format("Scan was manually stopped. %d scanned, %d skipped, %d failed.", scannedCount, skippedCount, errorCount);
                    sendBatchProgress(username, "STOPPED", stopMsg, null, current, total);
                    return;
                }
                
                try {
                    String existingModel = embeddedModelsMap.get(bookId);
                    if (!force && existingModel != null && existingModel.equals(activeModel)) {
                        log.info("Skipping embedding for book {} because it is already embedded with model {}", bookId, activeModel);
                        bookRepository.updateMarkedForAiSearch(List.of(bookId), false);
                        skippedCount++;
                        current++;
                        sendBatchProgress(username, "IN_PROGRESS", "Skipped already scanned book " + current + " of " + total, null, current, total);
                        continue;
                    }

                    extractAndEmbedBookInternal(bookId, userId, username, true);
                    scannedCount++;
                    // clear the flag
                    bookRepository.updateMarkedForAiSearch(List.of(bookId), false);
                } catch (Exception e) {
                    errorCount++;
                    log.error("Failed to embed book {} during marked scan: {}", bookId, e.getMessage());
                }
                current++;
                sendBatchProgress(username, "IN_PROGRESS", "Extracted book " + current + " of " + total, null, current, total);
            }

            String completionMsg = String.format("Scan completed. %d books scanned, %d skipped, %d failed.", scannedCount, skippedCount, errorCount);
            sendBatchProgress(username, "COMPLETED", completionMsg, null, total, total);

        } catch (Exception e) {
            log.error("Marked AI Search scan failed", e);
        } finally {
            scanInProgress.set(false);
        }
    }

    public Map<String, Object> embedBook(Long bookId, Long userId, List<Map<String, Object>> chunks, boolean append) {
        String baseUrl = appProperties.getAiSearch().getBaseUrl();
        RestClient restClient = buildRestClient();

        Map<String, Object> payload = Map.of(
                "bookId", bookId,
                "userId", userId,
                "chunks", chunks,
                "append", append
        );

        @SuppressWarnings("unchecked")
        Map<String, Object> result = restClient.post()
                .uri(baseUrl + "/v1/embed")
                .body(payload)
                .retrieve()
                .body(Map.class);

        return result;
    }

    public Map<String, Object> search(String query, List<Long> bookIds, Long userId, List<Map<String, String>> chatHistory, boolean localOnly) {
        String baseUrl = appProperties.getAiSearch().getBaseUrl();
        RestClient restClient = buildRestClient();

        org.booklore.model.dto.settings.AiSearchSettings settings = appSettingService.getAppSettings().getAiSearchSettings();

        Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("query", query);
        payload.put("bookIds", bookIds != null ? bookIds : List.of());
        payload.put("userId", userId);
        payload.put("topK", settings.getTopK());
        payload.put("similarityThreshold", settings.getSimilarityThreshold());
        payload.put("maxTokens", settings.getMaxTokens());
        payload.put("temperature", settings.getTemperature());
        payload.put("localOnly", localOnly);
        if (chatHistory != null) {
            payload.put("chatHistory", chatHistory);
        }

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
                extractEpubChunks(file, bookId, userId, username, isBatch);
            } else if (primaryFile.getBookType() == BookFileType.PDF) {
                extractPdfChunks(file, bookId, userId, username, isBatch);
            } else {
                throw new IllegalArgumentException("Unsupported book type for AI Search: " + primaryFile.getBookType());
            }

            String activeModel = aiSearchHealthService.getStatus().getEmbeddingModel();
            bookRepository.updateAiSearchEmbeddingModel(bookId, userId, activeModel);

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

    private void extractEpubChunks(File epubFile, Long bookId, Long userId, String username, boolean isBatch) throws Exception {
        int spineSize = EpubContentReader.getSpineSize(epubFile);
        List<Map<String, Object>> chunkBatch = new ArrayList<>();
        boolean isFirstBatch = true;

        // Build TOC title map for fallback when HTML headings are absent
        Map<String, String> tocTitleMap = EpubContentReader.getTocTitleMap(epubFile);

        for (int i = 0; i < spineSize; i++) {
            if (!isBatch && i % 5 == 0) {
                int percentage = (int)(((double)i / spineSize) * 100);
                sendSearchProgress(username, "IN_PROGRESS", "Embedding... " + percentage + "%", null);
            }

            String html = EpubContentReader.getSpineItemContent(epubFile, i);
            String text = Jsoup.parse(html).text();
            if (text.isBlank()) {
                continue;
            }

            // Get the spine item href for TOC lookup
            String spineHref = EpubContentReader.getSpineItemHref(epubFile, i);
            String tocTitle = null;
            if (spineHref != null && tocTitleMap != null) {
                // Normalize href for matching (strip leading path components)
                String normalizedHref = spineHref.replaceFirst("#.*$", "");
                if (normalizedHref.startsWith("/")) {
                    normalizedHref = normalizedHref.substring(1);
                }
                tocTitle = tocTitleMap.get(normalizedHref);
                // Try matching just the filename portion
                if (tocTitle == null && normalizedHref.contains("/")) {
                    String filename = normalizedHref.substring(normalizedHref.lastIndexOf('/') + 1);
                    for (Map.Entry<String, String> entry : tocTitleMap.entrySet()) {
                        if (entry.getKey().endsWith(filename)) {
                            tocTitle = entry.getValue();
                            break;
                        }
                    }
                }
            }

            // Extract ALL headings from this spine item and assign each chunk the nearest preceding heading
            List<Map.Entry<Integer, String>> headings = extractAllHeadingsFromHtml(html);
            List<String> textChunks = chunkText(text);
            List<Map<String, Object>> headedChunks = assignHeadingsToChunks(textChunks, text, headings, i + 1, tocTitle);
            chunkBatch.addAll(headedChunks);

            // Flush batch when it gets large
            while (chunkBatch.size() >= CHUNK_BATCH_SIZE) {
                List<Map<String, Object>> batch = new ArrayList<>(chunkBatch.subList(0, CHUNK_BATCH_SIZE));
                chunkBatch = new ArrayList<>(chunkBatch.subList(CHUNK_BATCH_SIZE, chunkBatch.size()));
                embedBook(bookId, userId, batch, !isFirstBatch);
                isFirstBatch = false;
            }
        }

        if (!chunkBatch.isEmpty()) {
            embedBook(bookId, userId, chunkBatch, !isFirstBatch);
            chunkBatch.clear();
        }
    }

    private void extractPdfChunks(File pdfFile, Long bookId, Long userId, String username, boolean isBatch) throws Exception {
        List<Map<String, Object>> chunkBatch = new ArrayList<>();
        boolean isFirstBatch = true;

        try (PDDocument document = Loader.loadPDF(pdfFile)) {
            PDFTextStripper stripper = new PDFTextStripper();
            int pageCount = document.getNumberOfPages();

            for (int page = 1; page <= pageCount; page++) {
                if (!isBatch && page % 5 == 0) {
                    int percentage = (int)(((double)page / pageCount) * 100);
                    sendSearchProgress(username, "IN_PROGRESS", "Embedding... " + percentage + "%", null);
                }

                stripper.setStartPage(page);
                stripper.setEndPage(page);
                String text = stripper.getText(document);
                if (text == null || text.isBlank()) {
                    continue;
                }

                String chapterTitle = extractHeadingFromPdfText(text);
                List<String> textChunks = chunkText(text);
                for (String tc : textChunks) {
                    Map<String, Object> chunk = new LinkedHashMap<>();
                    chunk.put("text", tc);
                    chunk.put("pageNumber", page);
                    chunk.put("chapterTitle", chapterTitle);
                    chunkBatch.add(chunk);

                    if (chunkBatch.size() >= CHUNK_BATCH_SIZE) {
                        embedBook(bookId, userId, chunkBatch, !isFirstBatch);
                        isFirstBatch = false;
                        chunkBatch.clear();
                    }
                }
            }
        }

        if (!chunkBatch.isEmpty()) {
            embedBook(bookId, userId, chunkBatch, !isFirstBatch);
            chunkBatch.clear();
        }
    }

    /**
     * Extracts ALL headings (h1-h6) from EPUB HTML content with their text positions.
     * Returns a list of (characterOffset, headingTitle) pairs in document order.
     * This allows assigning each chunk the nearest preceding heading.
     */
    private List<Map.Entry<Integer, String>> extractAllHeadingsFromHtml(String html) {
        List<Map.Entry<Integer, String>> headings = new ArrayList<>();
        if (html == null || html.isBlank()) {
            return headings;
        }
        org.jsoup.nodes.Document doc = Jsoup.parse(html);
        String fullText = doc.text();
        for (int level = 1; level <= 6; level++) {
            for (org.jsoup.nodes.Element heading : doc.select("h" + level)) {
                String title = heading.text().trim();
                if (!title.isBlank() && title.length() <= 200) {
                    // Find the character offset of this heading's text within the full text
                    int offset = fullText.indexOf(title);
                    if (offset >= 0) {
                        headings.add(new java.util.AbstractMap.SimpleEntry<>(offset, title));
                    }
                }
            }
        }
        // Sort by position in document
        headings.sort(Map.Entry.comparingByKey());
        return headings;
    }

    /**
     * Assigns the nearest preceding heading to each chunk based on text position.
     * For the first chunk, uses the first heading if it appears early enough.
     */
    private List<Map<String, Object>> assignHeadingsToChunks(
            List<String> textChunks, String fullText, List<Map.Entry<Integer, String>> headings,
            int pageNumber, String tocTitle) {
        List<Map<String, Object>> result = new ArrayList<>();
        int searchFrom = 0;
        for (String chunk : textChunks) {
            int chunkPos = fullText.indexOf(chunk, searchFrom);
            if (chunkPos < 0) {
                chunkPos = searchFrom;
            }
            searchFrom = chunkPos + chunk.length();

            // Find the last heading that appears before or at this chunk's position
            String assignedHeading = null;
            for (Map.Entry<Integer, String> heading : headings) {
                if (heading.getKey() <= chunkPos + 50) { // 50 char tolerance
                    assignedHeading = heading.getValue();
                } else {
                    break;
                }
            }

            // Fall back to TOC title if no HTML heading was found
            if (assignedHeading == null && tocTitle != null) {
                assignedHeading = tocTitle;
            }

            Map<String, Object> chunkMap = new LinkedHashMap<>();
            chunkMap.put("text", chunk);
            chunkMap.put("pageNumber", pageNumber);
            chunkMap.put("chapterTitle", assignedHeading);
            result.add(chunkMap);
        }
        return result;
    }

    /**
     * Extracts a likely heading from the first line(s) of PDF page text.
     * Heuristic: if the first non-blank line is short (<=120 chars) and
     * doesn't look like a regular sentence, treat it as a heading.
     */
    private String extractHeadingFromPdfText(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        String[] lines = text.split("\\n");
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            // Heading heuristic: short line, not ending with period, not all uppercase noise
            if (trimmed.length() <= 120 && trimmed.length() >= 3) {
                // Skip lines that look like page numbers or metadata
                if (trimmed.matches("^\\d+$")) {
                    continue;
                }
                // Skip lines that are just a single word in all caps (often author name)
                if (trimmed.equals(trimmed.toUpperCase()) && trimmed.length() < 30) {
                    continue;
                }
                return trimmed;
            }
            break; // Only check the first non-blank line
        }
        return null;
    }

    private List<String> chunkText(String text) {
        List<String> chunks = new ArrayList<>();
        String cleaned = text.replaceAll("\\s+", " ").trim();
        if (cleaned.isEmpty()) {
            return chunks;
        }

        BreakIterator boundary = BreakIterator.getSentenceInstance();
        boundary.setText(cleaned);

        int start = boundary.first();
        int end = boundary.next();

        StringBuilder currentChunk = new StringBuilder();
        // Track the last few sentences for overlap when starting a new chunk
        java.util.Deque<String> recentSentences = new java.util.ArrayDeque<>();

        while (end != BreakIterator.DONE) {
            String sentence = cleaned.substring(start, end).trim();
            if (!sentence.isEmpty()) {
                if (currentChunk.length() + sentence.length() > CHUNK_SIZE && currentChunk.length() > 0) {
                    chunks.add(currentChunk.toString().trim());
                    currentChunk = new StringBuilder();
                    // Carry over enough recent sentences to achieve ~CHUNK_OVERLAP chars of overlap
                    int overlapChars = 0;
                    java.util.List<String> overlapSentences = new java.util.ArrayList<>();
                    var it = recentSentences.descendingIterator();
                    while (it.hasNext() && overlapChars < CHUNK_OVERLAP) {
                        String s = it.next();
                        overlapSentences.add(s);
                        overlapChars += s.length() + 1;
                    }
                    // Reverse to restore original order
                    java.util.Collections.reverse(overlapSentences);
                    for (String s : overlapSentences) {
                        currentChunk.append(s).append(" ");
                    }
                }
                currentChunk.append(sentence).append(" ");
                recentSentences.addLast(sentence);
                // Keep only enough sentences to cover CHUNK_OVERLAP chars
                int totalLen = 0;
                while (recentSentences.size() > 1) {
                    totalLen = recentSentences.stream().mapToInt(String::length).sum() + recentSentences.size();
                    if (totalLen - recentSentences.peekFirst().length() > CHUNK_OVERLAP) {
                        recentSentences.removeFirst();
                    } else {
                        break;
                    }
                }
            }
            start = end;
            end = boundary.next();
        }

        if (currentChunk.length() > 0) {
            String finalChunk = currentChunk.toString().trim();
            if (!finalChunk.isEmpty()) {
                chunks.add(finalChunk);
            }
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
