package org.booklore.service.metadata.sidecar;

import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.booklore.exception.ApiError;
import org.booklore.model.MetadataUpdateContext;
import org.booklore.model.MetadataUpdateWrapper;
import org.booklore.model.dto.BookMetadata;
import org.booklore.model.dto.response.SidecarBackupHistoryEntry;
import org.booklore.model.dto.sidecar.SidecarMetadata;
import org.booklore.model.entity.AuditLogEntity;
import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.LibraryEntity;
import org.booklore.model.enums.AuditAction;
import org.booklore.model.enums.MetadataReplaceMode;
import org.booklore.model.enums.SidecarSyncStatus;
import org.booklore.repository.AuditLogRepository;
import org.booklore.repository.BookRepository;
import org.booklore.repository.LibraryRepository;
import org.booklore.service.audit.AuditService;
import org.booklore.service.metadata.BookMetadataUpdater;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@AllArgsConstructor
public class SidecarService {
    private static final String LIBRARY_ENTITY_TYPE = "Library";
    private static final int MAX_HISTORY_LIMIT = 10;
    private static final Pattern BACKUP_COUNTS_PATTERN = Pattern.compile("attempted=(\\d+), exported=(\\d+), failed=(\\d+)\\)");
    private static final Pattern FIRST_ERROR_PATTERN = Pattern.compile("\\. First error: (.*)$");
    private static final List<AuditAction> BACKUP_HISTORY_ACTIONS = List.of(
            AuditAction.SIDECAR_BACKUP_COMPLETED,
            AuditAction.SIDECAR_BACKUP_PARTIAL,
            AuditAction.SIDECAR_BACKUP_FAILED
    );

    private final BookRepository bookRepository;
    private final LibraryRepository libraryRepository;
    private final AuditLogRepository auditLogRepository;
    private final SidecarMetadataReader sidecarReader;
    private final SidecarMetadataWriter sidecarWriter;
    private final SidecarMetadataMapper sidecarMapper;
    private final BookMetadataUpdater bookMetadataUpdater;
    private final AuditService auditService;

    public Optional<SidecarMetadata> getSidecarContent(Long bookId) {
        BookEntity book = bookRepository.findByIdWithBookFiles(bookId)
                .orElseThrow(() -> ApiError.BOOK_NOT_FOUND.createException(bookId));

        return sidecarReader.readSidecarMetadata(book);
    }

    public SidecarSyncStatus getSyncStatus(Long bookId) {
        BookEntity book = bookRepository.findByIdWithBookFiles(bookId)
                .orElseThrow(() -> ApiError.BOOK_NOT_FOUND.createException(bookId));

        return sidecarReader.getSyncStatus(book);
    }

    @Transactional
    public void exportToSidecar(Long bookId) {
        BookEntity book = bookRepository.findByIdWithBookFiles(bookId)
                .orElseThrow(() -> ApiError.BOOK_NOT_FOUND.createException(bookId));

        sidecarWriter.writeSidecarMetadata(book);
    }

    @Transactional
    public void importFromSidecar(Long bookId) {
        BookEntity book = bookRepository.findByIdWithBookFiles(bookId)
                .orElseThrow(() -> ApiError.BOOK_NOT_FOUND.createException(bookId));

        Optional<SidecarMetadata> sidecarOpt = sidecarReader.readSidecarMetadata(book);
        if (sidecarOpt.isEmpty()) {
            throw ApiError.FILE_NOT_FOUND.createException("No sidecar file found for book");
        }

        SidecarMetadata sidecar = sidecarOpt.get();
        BookMetadata bookMetadata = sidecarMapper.toBookMetadata(sidecar);

        if (bookMetadata != null) {
            MetadataUpdateWrapper wrapper = MetadataUpdateWrapper.builder()
                    .metadata(bookMetadata)
                    .build();

            MetadataUpdateContext context = MetadataUpdateContext.builder()
                    .bookEntity(book)
                    .metadataUpdateWrapper(wrapper)
                    .updateThumbnail(false)
                    .replaceMode(MetadataReplaceMode.REPLACE_WHEN_PROVIDED)
                    .build();

            bookMetadataUpdater.setBookMetadata(context);
        }

        byte[] coverBytes = sidecarReader.readSidecarCover(book);
        if (coverBytes != null) {
            log.info("Sidecar cover found for book ID {} - cover import is a separate operation", bookId);
        }
    }

    @Transactional(readOnly = true)
    public List<SidecarBackupHistoryEntry> getBackupHistory(Long libraryId, int limit) {
        libraryRepository.findById(libraryId)
                .orElseThrow(() -> ApiError.LIBRARY_NOT_FOUND.createException(libraryId));

        int safeLimit = Math.max(1, Math.min(limit, MAX_HISTORY_LIMIT));

        return auditLogRepository.findByEntityTypeAndEntityIdAndActionInOrderByCreatedAtDesc(
                        LIBRARY_ENTITY_TYPE,
                        libraryId,
                        BACKUP_HISTORY_ACTIONS,
                        PageRequest.of(0, safeLimit)
                ).stream()
                .map(this::toBackupHistoryEntry)
                .toList();
    }

    @Transactional
    public int bulkExport(Long libraryId) {
        LibraryEntity library = libraryRepository.findById(libraryId)
                .orElseThrow(() -> ApiError.LIBRARY_NOT_FOUND.createException(libraryId));

        List<BookEntity> books = bookRepository.findAllForMetadataFlushByLibraryId(libraryId);
        int exported = 0;

        for (BookEntity book : books) {
            try {
                if (sidecarWriter.writeSidecarMetadata(book, false)) {
                    exported++;
                }
            } catch (Exception e) {
                log.warn("Failed to export sidecar for book ID {}: {}", book.getId(), e.getMessage());
            }
        }

        log.info("Bulk exported {} sidecar files for library {}", exported, library.getName());
        return exported;
    }

    @Transactional
    public SidecarBatchResult backupLibrarySidecars(Long libraryId) {
        LibraryEntity library = libraryRepository.findById(libraryId)
                .orElseThrow(() -> ApiError.LIBRARY_NOT_FOUND.createException(libraryId));

        List<BookEntity> books = bookRepository.findAllForMetadataFlushByLibraryId(libraryId);
        int exported = 0;
        int failed = 0;
        String firstError = null;

        for (BookEntity book : books) {
            try {
                SidecarMetadataWriter.SidecarWriteResult result = sidecarWriter.writeSidecarMetadataWithResult(book, true);
                if (result.completed()) {
                    exported++;
                } else {
                    failed++;
                    if (firstError == null) {
                        firstError = result.errorMessage();
                    }
                }
            } catch (Exception e) {
                failed++;
                if (firstError == null) {
                    firstError = e.getMessage();
                }
                log.warn("Failed to back up sidecar for book ID {}: {}", book.getId(), e.getMessage());
            }
        }

        log.info("Backed up {} sidecar files for library {} (attempted={}, failed={})", exported, library.getName(), books.size(), failed);
        auditService.log(resolveBackupAuditAction(exported, failed), "Library", libraryId,
                buildBackupAuditDescription(library.getName(), books.size(), exported, failed, firstError));
        return new SidecarBatchResult(books.size(), exported, failed, firstError);
    }

    private AuditAction resolveBackupAuditAction(int exported, int failed) {
        if (failed == 0) {
            return AuditAction.SIDECAR_BACKUP_COMPLETED;
        }

        if (exported == 0) {
            return AuditAction.SIDECAR_BACKUP_FAILED;
        }

        return AuditAction.SIDECAR_BACKUP_PARTIAL;
    }

    private String buildBackupAuditDescription(String libraryName, int attempted, int exported, int failed, String firstError) {
        String description = "Sidecar backup for library '" + libraryName + "' (attempted=" + attempted + ", exported=" + exported + ", failed=" + failed + ")";
        if (firstError == null || firstError.isBlank()) {
            return description;
        }

        return description + ". First error: " + firstError;
    }

    @Transactional
    public int bulkImport(Long libraryId) {
        LibraryEntity library = libraryRepository.findById(libraryId)
                .orElseThrow(() -> ApiError.LIBRARY_NOT_FOUND.createException(libraryId));

        List<BookEntity> books = bookRepository.findAllForMetadataFlushByLibraryId(libraryId);
        int imported = 0;

        for (BookEntity book : books) {
            try {
                Optional<SidecarMetadata> sidecarOpt = sidecarReader.readSidecarMetadata(book);
                if (sidecarOpt.isEmpty()) {
                    continue;
                }

                SidecarMetadata sidecar = sidecarOpt.get();
                BookMetadata bookMetadata = sidecarMapper.toBookMetadata(sidecar);

                if (bookMetadata != null) {
                    MetadataUpdateWrapper wrapper = MetadataUpdateWrapper.builder()
                            .metadata(bookMetadata)
                            .build();

                    MetadataUpdateContext context = MetadataUpdateContext.builder()
                            .bookEntity(book)
                            .metadataUpdateWrapper(wrapper)
                            .updateThumbnail(false)
                            .replaceMode(MetadataReplaceMode.REPLACE_WHEN_PROVIDED)
                            .build();

                    bookMetadataUpdater.setBookMetadata(context);
                    imported++;
                }
            } catch (Exception e) {
                log.warn("Failed to import sidecar for book ID {}: {}", book.getId(), e.getMessage());
            }
        }

        log.info("Bulk imported {} sidecar files for library {}", imported, library.getName());
        return imported;
    }

    private SidecarBackupHistoryEntry toBackupHistoryEntry(AuditLogEntity auditLog) {
        BackupCounts counts = parseBackupCounts(auditLog.getDescription());

        return new SidecarBackupHistoryEntry(
                mapAuditActionToStatus(auditLog.getAction()),
                counts.attempted(),
                counts.exported(),
                counts.failed(),
                parseFirstError(auditLog.getDescription()),
                auditLog.getDescription(),
                auditLog.getUsername(),
                auditLog.getCreatedAt()
        );
    }

    private BackupCounts parseBackupCounts(String description) {
        if (description == null || description.isBlank()) {
            return new BackupCounts(0, 0, 0);
        }

        Matcher matcher = BACKUP_COUNTS_PATTERN.matcher(description);
        if (!matcher.find()) {
            return new BackupCounts(0, 0, 0);
        }

        return new BackupCounts(
                Integer.parseInt(matcher.group(1)),
                Integer.parseInt(matcher.group(2)),
                Integer.parseInt(matcher.group(3))
        );
    }

    private String parseFirstError(String description) {
        if (description == null || description.isBlank()) {
            return null;
        }

        Matcher matcher = FIRST_ERROR_PATTERN.matcher(description);
        return matcher.find() ? matcher.group(1) : null;
    }

    private String mapAuditActionToStatus(AuditAction action) {
        return switch (action) {
            case SIDECAR_BACKUP_FAILED -> "FAILED";
            case SIDECAR_BACKUP_PARTIAL -> "PARTIAL";
            default -> "COMPLETED";
        };
    }

    public record SidecarBatchResult(int attempted, int exported, int failed, String firstError) {
    }

    private record BackupCounts(int attempted, int exported, int failed) {
    }
}
