package org.fable.service.metadata;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.fable.config.AppProperties;
import org.fable.model.dto.settings.MetadataPersistenceSettings;
import org.fable.model.entity.BookEntity;
import org.fable.model.entity.BookFileEntity;
import org.fable.model.entity.BookMetadataEntity;
import org.fable.model.enums.BookFileType;
import org.fable.model.enums.TaskType;
import org.fable.model.websocket.TaskProgressPayload;
import org.fable.model.websocket.Topic;
import org.fable.repository.BookRepository;
import org.fable.service.NotificationService;
import org.fable.service.appsettings.AppSettingService;
import org.fable.service.file.FileFingerprint;
import org.fable.service.metadata.sidecar.SidecarMetadataWriter;
import org.fable.service.metadata.writer.MetadataWriter;
import org.fable.service.metadata.writer.MetadataWriterFactory;
import org.fable.task.TaskCancellationManager;
import org.fable.task.TaskStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Slf4j
@Service
@RequiredArgsConstructor
public class MetadataFlushService {

    private final AppProperties appProperties;
    private final BookRepository bookRepository;
    private final MetadataWriterFactory metadataWriterFactory;
    private final SidecarMetadataWriter sidecarMetadataWriter;
    private final AppSettingService appSettingService;
    private final NotificationService notificationService;
    private final TaskCancellationManager cancellationManager;

    private static final long MIN_NOTIFICATION_INTERVAL_MS = 250;

    @Transactional
    public void flushMetadataToFiles(Long libraryId, String taskId) {
        if (!appProperties.isLocalStorage()) {
            log.warn("MetadataFlushService: skipping flush — not in LOCAL storage mode");
            sendProgress(taskId, 100, "Flush skipped: instance is not in LOCAL storage mode.", TaskStatus.COMPLETED, 0, true);
            return;
        }

        List<BookEntity> books;
        String scopeLabel;
        if (libraryId != null) {
            books = bookRepository.findAllForMetadataFlushByLibraryId(libraryId);
            scopeLabel = "library ID " + libraryId;
        } else {
            books = bookRepository.findAllForMetadataFlush();
            scopeLabel = "all libraries";
        }

        int total = books.size();
        log.info("MetadataFlushService: starting flush for {} books in {}. TaskId: {}", total, scopeLabel, taskId);

        sendProgress(taskId, 0,
                String.format("Starting metadata flush for %d books (%s)...", total, scopeLabel),
                TaskStatus.IN_PROGRESS, 0, true);

        MetadataPersistenceSettings settings = appSettingService.getAppSettings().getMetadataPersistenceSettings();
        MetadataPersistenceSettings.SaveToOriginalFile writeToFile = settings != null ? settings.getSaveToOriginalFile() : null;

        int processed = 0;
        int succeeded = 0;
        int skipped = 0;
        int failed = 0;
        long lastNotificationTime = System.currentTimeMillis();

        for (BookEntity book : books) {
            if (cancellationManager.isTaskCancelled(taskId)) {
                log.info("MetadataFlushService: task {} cancelled at book {}/{}", taskId, processed, total);
                sendProgress(taskId, calcProgress(processed, total), "Flush cancelled.", TaskStatus.COMPLETED, lastNotificationTime, true);
                return;
            }

            processed++;
            try {
                FlushResult result = flushSingleBook(book, writeToFile);
                switch (result) {
                    case SUCCEEDED -> succeeded++;
                    case SKIPPED -> skipped++;
                    case FAILED -> failed++;
                }
            } catch (Exception e) {
                failed++;
                log.error("MetadataFlushService: unexpected error for book ID {}: {}", book.getId(), e.getMessage(), e);
            }

            if (processed % 10 == 0 || processed == total) {
                lastNotificationTime = sendProgress(taskId, calcProgress(processed, total),
                        String.format("Processed %d/%d books (ok: %d, skipped: %d, failed: %d)",
                                processed, total, succeeded, skipped, failed),
                        TaskStatus.IN_PROGRESS, lastNotificationTime, false);
            }
        }

        log.info("MetadataFlushService: flush complete for {}. Processed: {}, succeeded: {}, skipped: {}, failed: {}",
                scopeLabel, processed, succeeded, skipped, failed);

        sendProgress(taskId, 100,
                String.format("Flush complete. %d succeeded, %d skipped, %d failed out of %d books.",
                        succeeded, skipped, failed, total),
                TaskStatus.COMPLETED, lastNotificationTime, true);
    }

    private FlushResult flushSingleBook(BookEntity book, MetadataPersistenceSettings.SaveToOriginalFile writeToFile) {
        BookFileEntity primaryFile = book.getPrimaryBookFile();
        if (primaryFile == null) {
            log.debug("Book ID {}: no primary file, skipping", book.getId());
            return FlushResult.SKIPPED;
        }

        BookFileType bookType = primaryFile.getBookType();
        if (bookType == null || !isFormatWriteEnabled(bookType, writeToFile)) {
            log.debug("Book ID {}: format {} write not enabled, skipping", book.getId(), bookType);
            return FlushResult.SKIPPED;
        }

        Optional<MetadataWriter> writerOpt = metadataWriterFactory.getWriter(bookType);
        if (writerOpt.isEmpty()) {
            log.debug("Book ID {}: no writer for type {}, skipping", book.getId(), bookType);
            return FlushResult.SKIPPED;
        }

        BookMetadataEntity metadata = book.getMetadata();
        if (metadata == null) {
            log.debug("Book ID {}: no metadata, skipping", book.getId());
            return FlushResult.SKIPPED;
        }

        Path fullPath = book.getFullFilePath();
        if (fullPath == null) {
            log.warn("Book ID {}: could not determine full file path, skipping", book.getId());
            return FlushResult.SKIPPED;
        }

        try {
            File file = fullPath.toFile();
            writerOpt.get().saveMetadataToFile(file, metadata, null, null);

            // Handle CBR/CB7 → CBZ conversion that may have occurred during write
            updateFileNameIfConverted(primaryFile, file.toPath());

            String newHash = file.isDirectory()
                    ? FileFingerprint.generateFolderHash(book.getFullFilePath())
                    : FileFingerprint.generateHash(book.getFullFilePath());
            book.setMetadataForWriteUpdatedAt(Instant.now());
            primaryFile.setCurrentHash(newHash);
            bookRepository.saveAndFlush(book);

            if (sidecarMetadataWriter.isWriteOnUpdateEnabled()) {
                try {
                    sidecarMetadataWriter.writeSidecarMetadata(book);
                } catch (Exception e) {
                    log.warn("MetadataFlushService: failed to write sidecar for book ID {}: {}", book.getId(), e.getMessage());
                }
            }

            return FlushResult.SUCCEEDED;
        } catch (Exception e) {
            log.error("MetadataFlushService: failed to write metadata for book ID {}: {}", book.getId(), e.getMessage());
            return FlushResult.FAILED;
        }
    }

    private boolean isFormatWriteEnabled(BookFileType bookType, MetadataPersistenceSettings.SaveToOriginalFile writeToFile) {
        if (writeToFile == null) {
            return false;
        }
        return switch (bookType) {
            case EPUB -> writeToFile.getEpub() != null && writeToFile.getEpub().isEnabled();
            case PDF -> writeToFile.getPdf() != null && writeToFile.getPdf().isEnabled();
            case CBX -> writeToFile.getCbx() != null && writeToFile.getCbx().isEnabled();
            case AUDIOBOOK -> writeToFile.getAudiobook() != null && writeToFile.getAudiobook().isEnabled();
            default -> false;
        };
    }

    private void updateFileNameIfConverted(BookFileEntity bookFile, Path originalPath) {
        if (Files.exists(originalPath)) {
            return;
        }
        String fileName = bookFile.getFileName();
        String baseName = fileName.contains(".") ? fileName.substring(0, fileName.lastIndexOf('.')) : fileName;
        String cbzFileName = baseName + ".cbz";
        Path cbzPath = originalPath.resolveSibling(cbzFileName);
        if (Files.exists(cbzPath)) {
            log.info("File converted from {} to {}, updating book file record", fileName, cbzFileName);
            bookFile.setFileName(cbzFileName);
        }
    }

    private static int calcProgress(int processed, int total) {
        if (total == 0) {
            return 99;
        }
        return Math.min(99, (int) ((processed * 99.0) / total));
    }

    private long sendProgress(String taskId, int pct, String message, TaskStatus status,
                              long lastNotificationTime, boolean force) {
        long now = System.currentTimeMillis();
        if (force || (now - lastNotificationTime) >= MIN_NOTIFICATION_INTERVAL_MS) {
            try {
                TaskProgressPayload payload = TaskProgressPayload.builder()
                        .taskId(taskId)
                        .taskType(TaskType.FLUSH_METADATA_TO_FILES)
                        .message(message)
                        .progress(pct)
                        .taskStatus(status)
                        .build();
                notificationService.sendMessage(Topic.TASK_PROGRESS, payload);
                return now;
            } catch (Exception e) {
                log.error("Failed to send task progress notification for taskId={}: {}", taskId, e.getMessage(), e);
            }
        }
        return lastNotificationTime;
    }

    private enum FlushResult {
        SUCCEEDED, SKIPPED, FAILED
    }
}
