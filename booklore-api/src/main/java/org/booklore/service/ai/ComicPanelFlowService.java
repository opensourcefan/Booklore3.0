package org.booklore.service.ai;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.booklore.config.security.service.AuthenticationService;
import org.booklore.model.dto.ai.AiBulkScanResponse;
import org.booklore.model.dto.ai.AiPanelFlowStatsResponse;
import org.booklore.model.dto.ai.AiPanelScanProgressPayload;
import org.booklore.model.dto.BookLoreUser;
import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookLoreUserEntity;
import org.booklore.model.entity.ComicPanelFlowEntity;
import org.booklore.model.enums.BookFileType;
import org.booklore.model.websocket.Topic;
import org.booklore.repository.BookRepository;
import org.booklore.repository.ComicPanelFlowRepository;
import org.booklore.repository.UserRepository;
import org.booklore.service.NotificationService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

@Service
@RequiredArgsConstructor
@Slf4j
public class ComicPanelFlowService {

    private final ComicPanelFlowRepository comicPanelFlowRepository;
    private final BookRepository bookRepository;
    private final UserRepository userRepository;
    private final AuthenticationService authenticationService;
    private final AiPanelDetectionService aiPanelDetectionService;
    private final PlatformTransactionManager transactionManager;
    private final NotificationService notificationService;

    private volatile boolean stopRequested = false;

    public void requestStop() {
        stopRequested = true;
    }

    @Transactional(readOnly = true)
    public Optional<String> getPanelFlow(Long bookId) {
        Long userId = getCurrentUserId();
        return comicPanelFlowRepository.findByBookIdAndUserId(bookId, userId)
                .map(ComicPanelFlowEntity::getFlowData);
    }

    @Transactional
    public void savePanelFlow(Long bookId, String flowData) {
        savePanelFlowInternal(bookId, flowData, getCurrentUserId());
    }

    private void savePanelFlowInternal(Long bookId, String flowData, Long userId) {
        Optional<ComicPanelFlowEntity> existing = comicPanelFlowRepository.findByBookIdAndUserId(bookId, userId);

        if (existing.isPresent()) {
            ComicPanelFlowEntity entity = existing.get();
            entity.setFlowData(flowData);
            comicPanelFlowRepository.save(entity);
            log.info("Updated comic panel flow for book {} by user {}", bookId, userId);
        } else {
            ComicPanelFlowEntity entity = ComicPanelFlowEntity.builder()
                    .book(findBook(bookId))
                    .user(findUser(userId))
                    .flowData(flowData)
                    .build();
            comicPanelFlowRepository.save(entity);
            log.info("Created comic panel flow for book {} by user {}", bookId, userId);
        }
    }

    @Transactional
    public void deletePanelFlow(Long bookId) {
        Long userId = getCurrentUserId();
        comicPanelFlowRepository.deleteByBookIdAndUserId(bookId, userId);
        log.info("Deleted comic panel flow for book {} by user {}", bookId, userId);
    }

    @Transactional
    public long deleteAllPanelFlowForCurrentUser() {
        Long userId = getCurrentUserId();
        long deleted = comicPanelFlowRepository.deleteByUserId(userId);
        log.info("Deleted {} comic panel flow records for user {}", deleted, userId);
        return deleted;
    }

    @Transactional(readOnly = true)
    public AiPanelFlowStatsResponse getPanelFlowStatsForCurrentUser() {
        Long userId = getCurrentUserId();
        ComicPanelFlowRepository.AiPanelFlowStatsProjection stats = comicPanelFlowRepository.findStatsByUserId(userId);
        return AiPanelFlowStatsResponse.builder()
                .scannedComicCount(stats != null ? stats.getScannedComicCount() : 0)
                .storedBytes(stats != null && stats.getStoredBytes() != null ? stats.getStoredBytes() : 0)
                .build();
    }

    public String scanAndSavePanelFlow(Long bookId, String bookType) {
        String username = getCurrentUsername();
        BookEntity book = findBook(bookId);
        String bookTitle = getBookTitle(book);

        sendProgress(username, AiPanelScanProgressPayload.builder()
                .mode("BOOK")
                .event("STARTED")
                .bookId(bookId)
                .bookTitle(bookTitle)
                .message("Scanning comic pages...")
                .build());

        try {
            String flowData = aiPanelDetectionService.detectPanelFlow(bookId, bookType,
                    new SingleBookProgressListener(username, bookId, bookTitle));

            TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
            transactionTemplate.executeWithoutResult(status -> savePanelFlowInternal(bookId, flowData, getCurrentUserId()));

            sendProgress(username, AiPanelScanProgressPayload.builder()
                    .mode("BOOK")
                    .event("COMPLETED")
                    .bookId(bookId)
                    .bookTitle(bookTitle)
                    .message("Panel scan completed.")
                    .build());
            return flowData;
        } catch (RuntimeException ex) {
            sendProgress(username, AiPanelScanProgressPayload.builder()
                    .mode("BOOK")
                    .event("FAILED")
                    .bookId(bookId)
                    .bookTitle(bookTitle)
                    .message("Panel scan failed.")
                    .error(ex.getMessage())
                    .build());
            throw ex;
        }
    }

    public AiBulkScanResponse startScanMissingPanelFlow(List<Long> libraryPathIds) {
        List<Long> deduplicatedPathIds = deduplicateIds(libraryPathIds);
        if (deduplicatedPathIds.isEmpty()) {
            return AiBulkScanResponse.builder()
                    .started(false)
                    .totalEligibleBooks(0)
                    .missingBooks(0)
                    .alreadyScannedBooks(0)
                    .message("Select at least one library path.")
                    .build();
        }

        BookLoreUser currentUser = authenticationService.getAuthenticatedUser();
        Long userId = currentUser.getId();
        String username = currentUser.getUsername();

        List<Long> candidateBookIds = bookRepository.findAllBookIdsByLibraryPathIdInAndBookType(deduplicatedPathIds, BookFileType.CBX);
        List<Long> scannedBookIds = candidateBookIds.isEmpty()
                ? List.of()
                : comicPanelFlowRepository.findScannedBookIdsByUserIdAndBookIdIn(userId, candidateBookIds);
        Set<Long> scannedBookIdSet = new LinkedHashSet<>(scannedBookIds);
        List<Long> missingBookIds = candidateBookIds.stream()
                .filter(bookId -> !scannedBookIdSet.contains(bookId))
                .toList();

        if (missingBookIds.isEmpty()) {
            return AiBulkScanResponse.builder()
                    .started(false)
                    .totalEligibleBooks(candidateBookIds.size())
                    .missingBooks(0)
                    .alreadyScannedBooks(scannedBookIds.size())
                    .message("All selected comics already have saved AI panel scans.")
                    .build();
        }

        stopRequested = false;
        CompletableFuture.runAsync(() -> runMissingScan(username, userId, missingBookIds, scannedBookIds.size()));

        return AiBulkScanResponse.builder()
                .started(true)
                .totalEligibleBooks(candidateBookIds.size())
                .missingBooks(missingBookIds.size())
                .alreadyScannedBooks(scannedBookIds.size())
                .message("Started scanning missing AI panel data in the background.")
                .build();
    }

    private Long getCurrentUserId() {
        return authenticationService.getAuthenticatedUser().getId();
    }

    private String getCurrentUsername() {
        return authenticationService.getAuthenticatedUser().getUsername();
    }

    private BookEntity findBook(Long bookId) {
        return bookRepository.findByIdWithBookFiles(bookId)
                .orElseThrow(() -> new EntityNotFoundException("Book not found: " + bookId));
    }

    private BookLoreUserEntity findUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + userId));
    }

    private void runMissingScan(String username, Long userId, List<Long> missingBookIds, int alreadyScannedBooks) {
        int completedBooks = 0;
        int skippedWithError = 0;
        int processedPages = 0;
        int panelsFound = 0;
        int pagesWithPanels = 0;

        sendProgress(username, AiPanelScanProgressPayload.builder()
                .mode("BATCH")
                .event("STARTED")
                .completedBooks(0)
                .totalBooks(missingBookIds.size())
                .skippedBooks(alreadyScannedBooks)
                .processedPages(0)
                .panelsFound(0)
                .pagesWithPanels(0)
                .message("Starting missing AI panel scan.")
                .build());

        try {
            for (Long bookId : missingBookIds) {
                if (stopRequested) {
                    sendProgress(username, AiPanelScanProgressPayload.builder()
                            .mode("BATCH")
                            .event("STOPPED")
                            .completedBooks(completedBooks)
                            .totalBooks(missingBookIds.size())
                            .skippedBooks(alreadyScannedBooks)
                            .processedPages(processedPages)
                            .panelsFound(panelsFound)
                            .pagesWithPanels(pagesWithPanels)
                            .message("Scan stopped by user.")
                            .build());
                    return;
                }
                BookEntity book = findBook(bookId);
                String bookTitle = getBookTitle(book);
                BatchBookProgress batchProgress = new BatchBookProgress(username, bookId, bookTitle, completedBooks, missingBookIds.size(), alreadyScannedBooks + skippedWithError, processedPages, panelsFound, pagesWithPanels);

                try {
                    String flowData = aiPanelDetectionService.detectPanelFlow(bookId, null, batchProgress);

                    TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
                    transactionTemplate.executeWithoutResult(status -> savePanelFlowInternal(bookId, flowData, userId));

                    completedBooks++;
                    processedPages += batchProgress.getFinalProcessedPages();
                    panelsFound += batchProgress.getFinalPanelsFound();
                    pagesWithPanels += batchProgress.getFinalPagesWithPanels();

                    sendProgress(username, AiPanelScanProgressPayload.builder()
                            .mode("BATCH")
                            .event("BOOK_COMPLETED")
                            .bookId(bookId)
                            .bookTitle(bookTitle)
                            .completedBooks(completedBooks)
                            .totalBooks(missingBookIds.size())
                            .skippedBooks(alreadyScannedBooks + skippedWithError)
                            .processedPages(processedPages)
                            .panelsFound(panelsFound)
                            .pagesWithPanels(pagesWithPanels)
                            .message("Saved AI panel scan.")
                            .build());
                } catch (AiPanelDetectionService.ScanStoppedException e) {
                    throw e;
                } catch (Exception bookEx) {
                    skippedWithError++;
                    log.warn("Skipping book {} ({}) in panel scan due to error: {}", bookId, bookTitle, bookEx.getMessage());
                    sendProgress(username, AiPanelScanProgressPayload.builder()
                            .mode("BATCH")
                            .event("BOOK_SKIPPED")
                            .bookId(bookId)
                            .bookTitle(bookTitle)
                            .completedBooks(completedBooks)
                            .totalBooks(missingBookIds.size())
                            .skippedBooks(alreadyScannedBooks + skippedWithError)
                            .processedPages(processedPages)
                            .panelsFound(panelsFound)
                            .pagesWithPanels(pagesWithPanels)
                            .message("Skipped: " + bookEx.getMessage())
                            .error(bookEx.getMessage())
                            .build());
                }
            }

            sendProgress(username, AiPanelScanProgressPayload.builder()
                    .mode("BATCH")
                    .event("COMPLETED")
                    .completedBooks(completedBooks)
                    .totalBooks(missingBookIds.size())
                    .skippedBooks(alreadyScannedBooks + skippedWithError)
                    .processedPages(processedPages)
                    .panelsFound(panelsFound)
                    .pagesWithPanels(pagesWithPanels)
                    .message("Missing AI panel scan completed.")
                    .build());
        } catch (AiPanelDetectionService.ScanStoppedException e) {
            log.info("AI panel scan stopped by user after {} completed books", completedBooks);
            sendProgress(username, AiPanelScanProgressPayload.builder()
                    .mode("BATCH")
                    .event("STOPPED")
                    .completedBooks(completedBooks)
                    .totalBooks(missingBookIds.size())
                    .skippedBooks(alreadyScannedBooks)
                    .processedPages(processedPages)
                    .panelsFound(panelsFound)
                    .pagesWithPanels(pagesWithPanels)
                    .message("Scan stopped by user.")
                    .build());
        } catch (Exception ex) {
            log.error("Failed to complete missing AI panel scan for user {}", username, ex);
            sendProgress(username, AiPanelScanProgressPayload.builder()
                    .mode("BATCH")
                    .event("FAILED")
                    .completedBooks(completedBooks)
                    .totalBooks(missingBookIds.size())
                    .skippedBooks(alreadyScannedBooks)
                    .processedPages(processedPages)
                    .panelsFound(panelsFound)
                    .pagesWithPanels(pagesWithPanels)
                    .message("Missing AI panel scan failed.")
                    .error(ex.getMessage())
                    .build());
        }
    }

    private void sendProgress(String username, AiPanelScanProgressPayload payload) {
        notificationService.sendMessageToUser(username, Topic.AI_PANEL_SCAN_PROGRESS, payload);
    }

    private List<Long> deduplicateIds(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }

        List<Long> deduplicated = new ArrayList<>();
        Set<Long> seen = new LinkedHashSet<>();
        for (Long id : ids) {
            if (id != null && seen.add(id)) {
                deduplicated.add(id);
            }
        }
        return deduplicated;
    }

    private String getBookTitle(BookEntity book) {
        if (book.getMetadata() != null && book.getMetadata().getTitle() != null && !book.getMetadata().getTitle().isBlank()) {
            return book.getMetadata().getTitle();
        }
        if (book.getPrimaryBookFile() != null && book.getPrimaryBookFile().getFileName() != null && !book.getPrimaryBookFile().getFileName().isBlank()) {
            return book.getPrimaryBookFile().getFileName();
        }
        return "Unknown Comic";
    }

    private class SingleBookProgressListener implements AiPanelDetectionService.AiPanelDetectionProgressListener {
        private final String username;
        private final Long bookId;
        private final String bookTitle;

        private SingleBookProgressListener(String username, Long bookId, String bookTitle) {
            this.username = username;
            this.bookId = bookId;
            this.bookTitle = bookTitle;
        }

        @Override
        public void onScanStarted(int totalPages) {
            sendProgress(username, AiPanelScanProgressPayload.builder()
                    .mode("BOOK")
                    .event("BOOK_STARTED")
                    .bookId(bookId)
                    .bookTitle(bookTitle)
                    .processedPages(0)
                    .totalPages(totalPages)
                    .panelsFound(0)
                    .pagesWithPanels(0)
                    .message("Scanning comic pages...")
                    .build());
        }

        @Override
        public void onPageProcessed(int pageNumber, int processedPages, int totalPages, int pagePanelsFound, int totalPanelsFound, int currentPagesWithPanels) {
            sendProgress(username, AiPanelScanProgressPayload.builder()
                    .mode("BOOK")
                    .event("PAGE_SCANNED")
                    .bookId(bookId)
                    .bookTitle(bookTitle)
                    .processedPages(processedPages)
                    .totalPages(totalPages)
                    .panelsFound(totalPanelsFound)
                    .pagesWithPanels(currentPagesWithPanels)
                    .message("Discovered panels while scanning pages.")
                    .build());
        }

        @Override
        public void onScanCompleted(int processedPages, int totalPages, int totalPanelsFound, int currentPagesWithPanels) {
            sendProgress(username, AiPanelScanProgressPayload.builder()
                    .mode("BOOK")
                    .event("BOOK_COMPLETED")
                    .bookId(bookId)
                    .bookTitle(bookTitle)
                    .processedPages(processedPages)
                    .totalPages(totalPages)
                    .panelsFound(totalPanelsFound)
                    .pagesWithPanels(currentPagesWithPanels)
                    .message("Panel scan finished. Saving results...")
                    .build());
        }
    }

    private class BatchBookProgress implements AiPanelDetectionService.AiPanelDetectionProgressListener {
        private final String username;
        private final Long bookId;
        private final String bookTitle;
        private final int completedBooksBefore;
        private final int totalBooks;
        private final int skippedBooks;
        private final int processedPagesBefore;
        private final int panelsFoundBefore;
        private final int pagesWithPanelsBefore;

        private int finalProcessedPages;
        private int finalPanelsFound;
        private int finalPagesWithPanels;

        private BatchBookProgress(String username,
                                  Long bookId,
                                  String bookTitle,
                                  int completedBooksBefore,
                                  int totalBooks,
                                  int skippedBooks,
                                  int processedPagesBefore,
                                  int panelsFoundBefore,
                                  int pagesWithPanelsBefore) {
            this.username = username;
            this.bookId = bookId;
            this.bookTitle = bookTitle;
            this.completedBooksBefore = completedBooksBefore;
            this.totalBooks = totalBooks;
            this.skippedBooks = skippedBooks;
            this.processedPagesBefore = processedPagesBefore;
            this.panelsFoundBefore = panelsFoundBefore;
            this.pagesWithPanelsBefore = pagesWithPanelsBefore;
        }

        @Override
        public void onScanStarted(int totalPages) {
            sendProgress(username, AiPanelScanProgressPayload.builder()
                    .mode("BATCH")
                    .event("BOOK_STARTED")
                    .bookId(bookId)
                    .bookTitle(bookTitle)
                    .completedBooks(completedBooksBefore)
                    .totalBooks(totalBooks)
                    .skippedBooks(skippedBooks)
                    .processedPages(processedPagesBefore)
                    .totalPages(processedPagesBefore + totalPages)
                    .panelsFound(panelsFoundBefore)
                    .pagesWithPanels(pagesWithPanelsBefore)
                    .message("Scanning comic pages...")
                    .build());
        }

        @Override
        public void onPageProcessed(int pageNumber, int processedPages, int totalPages, int pagePanelsFound, int totalPanelsFound, int currentPagesWithPanels) {
            this.finalProcessedPages = processedPages;
            this.finalPanelsFound = totalPanelsFound;
            this.finalPagesWithPanels = currentPagesWithPanels;

            sendProgress(username, AiPanelScanProgressPayload.builder()
                    .mode("BATCH")
                    .event("PAGE_SCANNED")
                    .bookId(bookId)
                    .bookTitle(bookTitle)
                    .completedBooks(completedBooksBefore)
                    .totalBooks(totalBooks)
                    .skippedBooks(skippedBooks)
                    .processedPages(processedPagesBefore + processedPages)
                    .totalPages(processedPagesBefore + totalPages)
                    .panelsFound(panelsFoundBefore + totalPanelsFound)
                    .pagesWithPanels(pagesWithPanelsBefore + currentPagesWithPanels)
                    .message("Discovered panels while scanning pages.")
                    .build());
        }

        @Override
        public void onScanCompleted(int processedPages, int totalPages, int totalPanelsFound, int currentPagesWithPanels) {
            this.finalProcessedPages = processedPages;
            this.finalPanelsFound = totalPanelsFound;
            this.finalPagesWithPanels = currentPagesWithPanels;
        }

        private int getFinalProcessedPages() {
            return finalProcessedPages;
        }

        private int getFinalPanelsFound() {
            return finalPanelsFound;
        }

        private int getFinalPagesWithPanels() {
            return finalPagesWithPanels;
        }

        @Override
        public boolean shouldStop() {
            return stopRequested;
        }
    }
}
