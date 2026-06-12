package org.fable.service.ai;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.fable.config.AppProperties;
import org.fable.model.entity.BookEntity;
import org.fable.model.entity.BookFileEntity;
import org.fable.model.enums.BookFileType;
import org.fable.model.websocket.Topic;
import org.fable.repository.BookRepository;
import org.fable.config.security.service.AuthenticationService;
import org.fable.service.NotificationService;
import org.fable.service.book.BookCreatorService;
import org.fable.service.metadata.BookMetadataService;
import org.fable.util.epub.EpubContentReader;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.jsoup.Jsoup;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.rendering.ImageType;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import java.io.ByteArrayOutputStream;
import java.util.Base64;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

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
    private final org.fable.service.appsettings.AppSettingService appSettingService;
    private final BookCreatorService bookCreatorService;
    private final BookMetadataService bookMetadataService;
    private final ObjectMapper objectMapper;

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
            sendBatchProgress(username, "STARTED", "Finding books to scan...", null, 0, 0, null, null);

            List<Long> epubBookIds = bookRepository.findAllBookIdsByLibraryPathIdInAndBookType(libraryPathIds, BookFileType.EPUB);
            List<Long> pdfBookIds = bookRepository.findAllBookIdsByLibraryPathIdInAndBookType(libraryPathIds, BookFileType.PDF);
            
            Set<Long> allBookIds = new HashSet<>();
            allBookIds.addAll(epubBookIds);
            allBookIds.addAll(pdfBookIds);

            if (allBookIds.isEmpty()) {
                sendBatchProgress(username, "COMPLETED", "No EPUB or PDF books found in selected paths.", null, 0, 0, null, null);
                return;
            }

            List<Long> embeddedIds = bookRepository.findBookIdsWithAiSearchEmbeddings(userId, allBookIds)
                .stream()
                .map(org.fable.repository.projection.AiSearchBookStatusProjection::getBookId)
                .toList();
            allBookIds.removeAll(embeddedIds);

            int total = allBookIds.size();
            if (total == 0) {
                sendBatchProgress(username, "COMPLETED", "All books in selected paths are already embedded.", null, 0, 0, null, null);
                return;
            }

            int current = 0;
            sendBatchProgress(username, "IN_PROGRESS", "Starting extraction...", null, current, total, null, null);

            List<String> importedBookTitles = new ArrayList<>();
            List<String> failedBookTitles = new ArrayList<>();

            for (Long bookId : allBookIds) {
                if (!scanInProgress.get()) {
                    sendBatchProgress(username, "STOPPED", "Scan was manually stopped.", null, current, total, null, null);
                    return;
                }
                
                try {
                    String title = resolveBookTitle(bookId);
                    extractAndEmbedBookInternal(bookId, userId, username, true, current, total);
                    importedBookTitles.add(title);
                } catch (Exception e) {
                    log.error("Failed to embed book {} during batch scan: {}", bookId, e.getMessage());
                    failedBookTitles.add(resolveBookTitle(bookId));
                }
                current++;
                sendBatchProgress(username, "IN_PROGRESS", "Extracted book " + current + " of " + total, null, current, total, null, null);
            }

            sendBatchProgress(username, "COMPLETED", "Scan completed.", null, total, total, importedBookTitles, failedBookTitles);

        } catch (Exception e) {
            log.error("Batch AI Search scan failed", e);
            sendBatchProgress(username, "FAILED", "Scan failed: " + e.getMessage(), e.getMessage(), 0, 0, null, null);
        } finally {
            scanInProgress.set(false);
        }
    }


    public List<org.fable.repository.projection.MarkedBookProjection> getMarkedBooks() {
        return bookRepository.findMarkedBooksInfo();
    }

    public List<org.fable.repository.projection.EmbeddingStatsProjection> getEmbeddingStats(Long userId) {
        return bookRepository.getEmbeddingStats(userId);
    }

    public int deleteBookEmbeddings(List<Long> bookIds, Long userId) {
        if (bookIds == null || bookIds.isEmpty()) {
            throw new IllegalArgumentException("bookIds are required.");
        }
        if (userId == null) {
            throw new IllegalArgumentException("userId is required.");
        }
        int deleted = bookRepository.deleteBookEmbeddings(bookIds, userId);
        try {
            bookMetadataService.removeAisTagFromBooks(bookIds);
        } catch (Exception tagEx) {
            log.warn("Failed to remove AIS tags from books {}: {}", bookIds, tagEx.getMessage());
        }
        return deleted;
    }

    private String resolveBookTitle(Long bookId) {
        String title = bookRepository.findBookTitleById(bookId);
        return title != null ? title : "Book #" + bookId;
    }

    @Async
    public void startScanMarkedAiSearchEmbeddings(Long userId, String username, boolean force) {
        if (!scanInProgress.compareAndSet(false, true)) {
            log.warn("AI Search scan already in progress");
            return;
        }

        try {
            sendBatchProgress(username, "STARTED", "Finding marked books to scan...", null, 0, 0, null, null);

            List<Long> markedBookIds = bookRepository.findBookIdsByMarkedForAiSearchTrue();

            List<String> importedBookTitles = new ArrayList<>();
            List<String> failedBookTitles = new ArrayList<>();

            int total = markedBookIds.size();
            if (total == 0) {
                sendBatchProgress(username, "COMPLETED", "No books are marked for AI Search.", null, 0, 0, null, null);
                return;
            }

            int current = 0;
            int scannedCount = 0;
            int skippedCount = 0;
            int errorCount = 0;

            sendBatchProgress(username, "IN_PROGRESS", "Starting extraction...", null, current, total, null, null);

            String activeModel = aiSearchHealthService.getStatus().getEmbeddingModel();
            
            // Pre-fetch embedding status for all marked books to optimize skipping
            List<org.fable.repository.projection.AiSearchBookStatusProjection> embeddedStatuses = 
                bookRepository.findBookIdsWithAiSearchEmbeddings(userId, markedBookIds);
            
            Map<Long, String> embeddedModelsMap = new java.util.HashMap<>();
            for (var status : embeddedStatuses) {
                embeddedModelsMap.put(status.getBookId(), status.getEmbeddingModel());
            }

            for (Long bookId : markedBookIds) {
                if (!scanInProgress.get()) {
                    String stopMsg = String.format("Scan was manually stopped. %d scanned, %d skipped, %d failed.", scannedCount, skippedCount, errorCount);
                    sendBatchProgress(username, "STOPPED", stopMsg, null, current, total, null, null);
                    return;
                }
                
                try {
                    String existingModel = embeddedModelsMap.get(bookId);
                    if (!force && existingModel != null && existingModel.equals(activeModel)) {
                        log.info("Skipping embedding for book {} because it is already embedded with model {}", bookId, activeModel);
                        bookRepository.updateMarkedForAiSearch(List.of(bookId), false);
                        skippedCount++;
                        current++;
                        sendBatchProgress(username, "IN_PROGRESS", "Skipped already scanned book " + current + " of " + total, null, current, total, null, null);
                        continue;
                    }

                    String title = resolveBookTitle(bookId);
                    extractAndEmbedBookInternal(bookId, userId, username, true, current, total);
                    scannedCount++;
                    importedBookTitles.add(title);
                    // clear the flag
                    bookRepository.updateMarkedForAiSearch(List.of(bookId), false);
                } catch (Exception e) {
                    errorCount++;
                    log.error("Failed to embed book {} during marked scan: {}", bookId, e.getMessage());
                    failedBookTitles.add(resolveBookTitle(bookId));
                }
                current++;
                sendBatchProgress(username, "IN_PROGRESS", "Extracted book " + current + " of " + total, null, current, total, null, null);
            }

            String completionMsg = String.format("Scan completed. %d books scanned, %d skipped, %d failed.", scannedCount, skippedCount, errorCount);
            sendBatchProgress(username, "COMPLETED", completionMsg, null, total, total, importedBookTitles, failedBookTitles);

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

        return postForMap(restClient, baseUrl + "/v1/embed", payload);
    }

    public Map<String, Object> search(String query, List<Long> bookIds, Long userId, List<Map<String, String>> chatHistory, boolean localOnly) {
        String baseUrl = appProperties.getAiSearch().getBaseUrl();
        RestClient restClient = buildRestClient();

        org.fable.model.dto.settings.AiSearchSettings settings = appSettingService.getAppSettings().getAiSearchSettings();

        Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("query", query);
        payload.put("bookIds", bookIds != null ? bookIds : List.of());
        payload.put("userId", userId);
        payload.put("topK", settings.getTopK());
        payload.put("similarityThreshold", settings.getSimilarityThreshold());
        payload.put("maxTokens", settings.getMaxTokens());
        payload.put("temperature", settings.getTemperature());
        payload.put("localOnly", localOnly);
        payload.put("matryoshkaDimensions", settings.getMatryoshkaDimensions());
        payload.put("hybridSearchEnabled", settings.isHybridSearchEnabled());
        payload.put("rrfK", settings.getRrfK());
        payload.put("rerankingEnabled", settings.isRerankingEnabled());
        payload.put("rerankerModel", settings.getRerankerModel());
        if (chatHistory != null) {
            payload.put("chatHistory", chatHistory);
        }

        try {
            Map<String, Object> result = postForMap(restClient, baseUrl + "/v1/search", payload);
            return result;
        } catch (Exception e) {
            log.error("AI Search query failed: {}", e.getMessage());
            Map<String, Object> errorResult = new java.util.HashMap<>();
            errorResult.put("query", query);
            errorResult.put("results", List.of());
            errorResult.put("answer", null);
            errorResult.put("error", "Could not reach the AI Search service: " + e.getMessage());
            errorResult.put("totalChunksSearched", 0);
            return errorResult;
        }
    }

    public Map<String, Object> getBookEmbeddingStatus(Long bookId, Long userId) {
        String baseUrl = appProperties.getAiSearch().getBaseUrl();
        RestClient restClient = buildRestClient();

        return getForMap(restClient, baseUrl + "/v1/book-embeddings/{bookId}?user_id={userId}", bookId, userId);
    }

    public Map<String, Object> getEmbedJobStatus(String jobId) {
        String baseUrl = appProperties.getAiSearch().getBaseUrl();
        RestClient restClient = buildRestClient();

        return getForMap(restClient, baseUrl + "/v1/embed-status/{jobId}", jobId);
    }

    /**
     * Extracts text from a book file (EPUB or PDF), chunks it, and sends to the AI Search
     * container for embedding. This is the primary user-facing "Embed for AI Search" flow.
     */
    @Async
    public void extractAndEmbedBook(Long bookId, Long userId, String username) {
        extractAndEmbedBookInternal(bookId, userId, username, false, 0, 1);
    }

    private void extractAndEmbedBookInternal(Long bookId, Long userId, String username, boolean isBatch, Integer current, Integer total) {
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
                extractEpubChunks(file, bookId, userId, username, isBatch, current, total);
            } else if (primaryFile.getBookType() == BookFileType.PDF) {
                extractPdfChunks(file, bookId, userId, username, isBatch, current, total);
            } else {
                throw new IllegalArgumentException("Unsupported book type for AI Search: " + primaryFile.getBookType());
            }

            String activeModel = aiSearchHealthService.getStatus().getEmbeddingModel();
            if (activeModel != null) {
                bookRepository.updateAiSearchEmbeddingModel(bookId, userId, activeModel);
            } else {
                log.warn("Active embedding model is null (AI Search service may be unreachable). Skipping embedding_model update for book {}.", bookId);
            }

            // Add 'AIS' metadata tag to indicate the book has AI Search embeddings
            try {
                bookMetadataService.addAisTagToBooks(List.of(bookId));
            } catch (Exception tagEx) {
                log.warn("Failed to add AIS tag to book {}: {}", bookId, tagEx.getMessage());
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

    private void extractEpubChunks(File epubFile, Long bookId, Long userId, String username, boolean isBatch, Integer current, Integer total) throws Exception {
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

    private void extractPdfChunks(File pdfFile, Long bookId, Long userId, String username, boolean isBatch, Integer current, Integer total) throws Exception {
        List<Map<String, Object>> chunkBatch = new ArrayList<>();
        boolean isFirstBatch = true;

        org.fable.model.dto.settings.AiSearchSettings settings = appSettingService.getAppSettings().getAiSearchSettings();
        if (settings == null) {
            settings = new org.fable.model.dto.settings.AiSearchSettings();
        }

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

                boolean needsOcr = false;
                if (text == null || text.isBlank()) {
                    needsOcr = true;
                } else if (settings.isOcrEnabled() && !settings.isOcrFallbackOnly()) {
                    needsOcr = true;
                } else if (settings.isOcrEnabled() && text.trim().length() < 50) {
                    needsOcr = true;
                }

                if (needsOcr && settings.isOcrEnabled()) {
                    String title = resolveBookTitle(bookId);
                    if (isBatch) {
                        sendBatchProgress(username, "IN_PROGRESS", "No embeddable text found in \"" + title + "\", commencing OCR (page " + page + "/" + pageCount + ")...", null, current, total, null, null);
                    } else {
                        sendSearchProgress(username, "IN_PROGRESS", "No embeddable text found in \"" + title + "\", commencing OCR (page " + page + "/" + pageCount + ")...", null);
                    }
                    String ocrText = performOcrOnPage(document, page - 1, settings.getOcrLanguage());
                    if (ocrText != null && !ocrText.isBlank()) {
                        text = ocrText;
                    }
                }

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

    private String performOcrOnPage(PDDocument document, int pageIndex, String language) {
        try {
            PDFRenderer renderer = new PDFRenderer(document);
            BufferedImage bufferedImage = renderer.renderImageWithDPI(pageIndex, 150, ImageType.RGB);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(bufferedImage, "jpg", baos);
            byte[] imageBytes = baos.toByteArray();
            String base64Image = Base64.getEncoder().encodeToString(imageBytes);

            String baseUrl = appProperties.getAiSearch().getBaseUrl();
            RestClient restClient = buildRestClient();

            Map<String, Object> payload = Map.of(
                    "image", base64Image,
                    "lang", language != null ? language : "eng"
            );

            Map<String, Object> result = postForMap(restClient, baseUrl + "/v1/ocr", payload);
            if (result != null && result.containsKey("text")) {
                return (String) result.get("text");
            }
        } catch (Exception e) {
            log.error("Failed to perform OCR on page index {}: {}", pageIndex, e.getMessage());
        }
        return null;
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
        int chunkSizeSetting = 1500;
        int chunkOverlapSetting = 100;
        try {
            org.fable.model.dto.settings.AiSearchSettings settings = appSettingService.getAppSettings().getAiSearchSettings();
            if (settings != null) {
                chunkSizeSetting = settings.getChunkSize();
                chunkOverlapSetting = settings.getChunkOverlap();
            }
        } catch (Exception e) {
            log.warn("Failed to retrieve chunk settings dynamically, falling back to defaults: {}", e.getMessage());
        }

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
                if (currentChunk.length() + sentence.length() > chunkSizeSetting && currentChunk.length() > 0) {
                    chunks.add(currentChunk.toString().trim());
                    currentChunk = new StringBuilder();
                    // Carry over enough recent sentences to achieve ~CHUNK_OVERLAP chars of overlap
                    int overlapChars = 0;
                    java.util.List<String> overlapSentences = new java.util.ArrayList<>();
                    var it = recentSentences.descendingIterator();
                    while (it.hasNext() && overlapChars < chunkOverlapSetting) {
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
                    if (totalLen - recentSentences.peekFirst().length() > chunkOverlapSetting) {
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

    public void sendBatchProgress(String username, String event, String message, String error, int current, int total,
                                   List<String> importedBooks, List<String> failedBooks) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("mode", "BATCH");
        payload.put("event", event);
        payload.put("message", message);
        payload.put("current", current);
        payload.put("total", total);
        if (error != null) {
            payload.put("error", error);
        }
        if (importedBooks != null && !importedBooks.isEmpty()) {
            payload.put("importedBooks", importedBooks);
        }
        if (failedBooks != null && !failedBooks.isEmpty()) {
            payload.put("failedBooks", failedBooks);
        }
        notificationService.sendMessageToUser(username, Topic.AI_SEARCH_PROGRESS, payload);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> postForMap(RestClient restClient, String uri, Object body) {
        byte[] bytes = restClient.post()
                .uri(uri)
                .body(body)
                .exchange((request, response) -> response.getBody().readAllBytes());
        if (bytes == null || bytes.length == 0) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(bytes, Map.class);
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse AI Search response: " + e.getMessage(), e);
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> getForMap(RestClient restClient, String uri, Object... uriVariables) {
        byte[] bytes = restClient.get()
                .uri(uri, uriVariables)
                .exchange((request, response) -> response.getBody().readAllBytes());
        if (bytes == null || bytes.length == 0) {
            return Map.of();
        }
        try {
            return objectMapper.readValue(bytes, Map.class);
        } catch (Exception e) {
            throw new RuntimeException("Failed to parse AI Search response: " + e.getMessage(), e);
        }
    }

    private RestClient buildRestClient() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(appProperties.getAiSearch().getConnectTimeoutMs());
        factory.setReadTimeout(appProperties.getAiSearch().getReadTimeoutMs());
        return RestClient.builder()
                .requestFactory(factory)
                .build();
    }
}
