package org.booklore.service.library;

import org.booklore.exception.ApiError;
import org.booklore.model.dto.settings.LibraryFile;
import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookFileEntity;
import org.booklore.model.entity.LibraryEntity;
import org.booklore.model.entity.LibraryPathEntity;
import org.booklore.model.enums.TaskType;
import org.booklore.model.websocket.LogNotification;
import org.booklore.model.websocket.TaskProgressPayload;
import org.booklore.model.websocket.Topic;
import org.booklore.repository.BookAdditionalFileRepository;
import org.booklore.repository.BookRepository;
import org.booklore.repository.LibraryRepository;
import org.booklore.service.NotificationService;
import org.booklore.service.book.PhysicalBookService;
import org.booklore.service.file.FileFingerprint;
import org.booklore.task.TaskStatus;
import org.booklore.task.options.RescanLibraryContext;
import org.booklore.util.FileUtils;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@AllArgsConstructor
@Service
@Slf4j
public class LibraryProcessingService {

    private final LibraryRepository libraryRepository;
    private final BookRepository bookRepository;
    private final NotificationService notificationService;
    private final BookAdditionalFileRepository bookAdditionalFileRepository;
    private final FileAsBookProcessor fileAsBookProcessor;
    private final BookRestorationService bookRestorationService;
    private final BookDeletionService bookDeletionService;
    private final LibraryFileHelper libraryFileHelper;
    private final BookGroupingService bookGroupingService;
    private final DirectoryTagTaskStarter directoryTagTaskStarter;
    private final PhysicalBookService physicalBookService;
    @PersistenceContext
    private final EntityManager entityManager;

    @Transactional
    public void processLibrary(long libraryId) {
        LibraryEntity libraryEntity = libraryRepository.findById(libraryId).orElseThrow(() -> ApiError.LIBRARY_NOT_FOUND.createException(libraryId));
        notificationService.sendMessage(Topic.LOG, LogNotification.info("Started processing library: " + libraryEntity.getName()));
        try {
            physicalBookService.importPhysicalBooksFromSidecars(libraryEntity, libraryEntity.getLibraryPaths());
            List<LibraryFile> libraryFiles = libraryFileHelper.getLibraryFiles(libraryEntity);
            importLibraryFiles(libraryEntity, libraryFiles);

            notificationService.sendMessage(Topic.LOG, LogNotification.info("Finished processing library: " + libraryEntity.getName()));
        } catch (IOException e) {
            log.error("Failed to process library {}: {}", libraryEntity.getName(), e.getMessage(), e);
            notificationService.sendMessage(Topic.LOG, LogNotification.error("Failed to process library: " + libraryEntity.getName() + " - " + e.getMessage()));
            throw new UncheckedIOException("Library processing failed", e);
        }
    }

    @Transactional
    public void processLibraryPaths(long libraryId, Set<String> targetPaths) {
        LibraryEntity libraryEntity = libraryRepository.findById(libraryId).orElseThrow(() -> ApiError.LIBRARY_NOT_FOUND.createException(libraryId));
        List<LibraryPathEntity> pathEntities = libraryEntity.getLibraryPaths().stream()
                .filter(pathEntity -> targetPaths.contains(pathEntity.getPath()))
                .toList();

        if (pathEntities.isEmpty()) {
            log.info("No matching new library paths found for library {}", libraryId);
            return;
        }

        notificationService.sendMessage(Topic.LOG, LogNotification.info("Started processing new library path(s) for: " + libraryEntity.getName()));
        try {
            physicalBookService.importPhysicalBooksFromSidecars(libraryEntity, pathEntities);
            List<LibraryFile> libraryFiles = libraryFileHelper.getLibraryFiles(libraryEntity, pathEntities);
            importLibraryFiles(libraryEntity, libraryFiles);
            notificationService.sendMessage(Topic.LOG, LogNotification.info("Finished processing new library path(s) for: " + libraryEntity.getName()));
        } catch (IOException e) {
            log.error("Failed to process new library paths for {}: {}", libraryEntity.getName(), e.getMessage(), e);
            notificationService.sendMessage(Topic.LOG, LogNotification.error("Failed to process new library path(s): " + libraryEntity.getName() + " - " + e.getMessage()));
            throw new UncheckedIOException("Library path processing failed", e);
        }
    }

    @Transactional
    public void scanLibraryDirectoriesForNewFiles(long libraryId, Set<String> targetPaths) throws IOException {
        LibraryEntity libraryEntity = libraryRepository.findById(libraryId)
                .orElseThrow(() -> ApiError.LIBRARY_NOT_FOUND.createException(libraryId));

        List<LibraryPathEntity> pathEntities = libraryEntity.getLibraryPaths().stream()
                .filter(pathEntity -> targetPaths.contains(pathEntity.getPath()))
                .toList();

        if (pathEntities.isEmpty()) {
            log.info("No matching library paths found for explicit scan in library {}", libraryId);
            return;
        }

        notificationService.sendMessage(Topic.LOG,
                LogNotification.info("Started scanning selected library directories for new files: " + libraryEntity.getName()));
        validateLibraryPathsAccessible(pathEntities);
        physicalBookService.importPhysicalBooksFromSidecars(libraryEntity, pathEntities);

        List<LibraryFile> libraryFiles = libraryFileHelper.getLibraryFiles(libraryEntity, pathEntities);
        importLibraryFiles(libraryEntity, libraryFiles);

        notificationService.sendMessage(Topic.LOG,
                LogNotification.info("Finished scanning selected library directories for new files: " + libraryEntity.getName()));
    }

    @Transactional
    public void scanLibraryForNewFiles(long libraryId) throws IOException {
        LibraryEntity libraryEntity = libraryRepository.findById(libraryId)
                .orElseThrow(() -> ApiError.LIBRARY_NOT_FOUND.createException(libraryId));

        notificationService.sendMessage(Topic.LOG, LogNotification.info("Started scanning library for new files: " + libraryEntity.getName()));
        validateLibraryPathsAccessible(libraryEntity.getLibraryPaths());
        physicalBookService.importPhysicalBooksFromSidecars(libraryEntity, libraryEntity.getLibraryPaths());

        List<LibraryFile> libraryFiles = libraryFileHelper.getLibraryFiles(libraryEntity);
        importLibraryFiles(libraryEntity, libraryFiles);

        notificationService.sendMessage(Topic.LOG, LogNotification.info("Finished scanning library for new files: " + libraryEntity.getName()));
    }

    @Transactional
    public void rescanLibrary(RescanLibraryContext context) throws IOException {
        LibraryEntity libraryEntity = libraryRepository.findById(context.getLibraryId()).orElseThrow(() -> ApiError.LIBRARY_NOT_FOUND.createException(context.getLibraryId()));
        notificationService.sendMessage(Topic.LOG, LogNotification.info("Started refreshing library: " + libraryEntity.getName()));

        validateLibraryPathsAccessible(libraryEntity.getLibraryPaths());
        physicalBookService.importPhysicalBooksFromSidecars(libraryEntity, libraryEntity.getLibraryPaths());

        List<LibraryFile> allLibraryFiles = libraryFileHelper.getAllLibraryFiles(libraryEntity);
        List<LibraryFile> filteredFiles = libraryFileHelper.filterByAllowedFormats(
                allLibraryFiles, libraryEntity.getAllowedFormats());

        int existingBookCount = libraryEntity.getBookEntities().size();
        if (existingBookCount > 0 && allLibraryFiles.isEmpty()) {
            String paths = libraryEntity.getLibraryPaths().stream()
                    .map(LibraryPathEntity::getPath)
                    .collect(Collectors.joining(", "));
            log.error("Library '{}' has {} existing books but scan found 0 files. Paths may be offline: {}",
                    libraryEntity.getName(), existingBookCount, paths);
            throw ApiError.LIBRARY_PATH_NOT_ACCESSIBLE.createException(paths);
        }

        List<Long> additionalFileIds = detectDeletedAdditionalFiles(allLibraryFiles, libraryEntity);
        if (!additionalFileIds.isEmpty()) {
            log.info("Detected {} removed additional files in library: {}", additionalFileIds.size(), libraryEntity.getName());
            bookDeletionService.deleteRemovedAdditionalFiles(additionalFileIds);
        }
        List<Long> bookIds = detectDeletedBookIds(allLibraryFiles, libraryEntity);
        if (!bookIds.isEmpty()) {
            log.info("Detected {} removed books in library: {}", bookIds.size(), libraryEntity.getName());
            bookDeletionService.processDeletedLibraryFiles(bookIds, allLibraryFiles);
        }
        List<Long> unexpectedFilelessBookIds = detectUnexpectedFilelessBookIds(libraryEntity.getId());
        if (!unexpectedFilelessBookIds.isEmpty()) {
            log.info("Removing {} non-physical fileless books in library: {}", unexpectedFilelessBookIds.size(), libraryEntity.getName());
            bookDeletionService.deleteRemovedBooks(unexpectedFilelessBookIds);
        }
        bookRestorationService.restoreDeletedBooks(allLibraryFiles);
        bookDeletionService.purgeDisallowedFormats(libraryEntity);
        entityManager.clear();
        // Re-fetch library entity to get fresh state after entity manager was cleared
        libraryEntity = libraryRepository.findById(context.getLibraryId())
                .orElseThrow(() -> ApiError.LIBRARY_NOT_FOUND.createException(context.getLibraryId()));

        List<LibraryFile> newFiles = detectNewBookPaths(filteredFiles, libraryEntity);

        // Use BookGroupingService to determine what to attach vs create new
        BookGroupingService.GroupingResult groupingResult = bookGroupingService.groupForRescan(newFiles, libraryEntity);

        // Auto-attach files to existing books
        for (Map.Entry<BookEntity, List<LibraryFile>> entry : groupingResult.filesToAttach().entrySet()) {
            for (LibraryFile file : entry.getValue()) {
                autoAttachFile(entry.getKey(), file);
            }
        }

        // Process new book groups
        Map<String, List<LibraryFile>> newBookGroups = groupingResult.newBookGroups();
        int total = newBookGroups.size();
        if (total > 0) {
            String taskId = UUID.randomUUID().toString();
            sendSyncProgress(taskId, 0, "Preparing 0 of " + total, TaskStatus.IN_PROGRESS);
            fileAsBookProcessor.processLibraryFilesGrouped(newBookGroups, libraryEntity, (current, t) -> {
                int pct = t > 0 ? (current * 100) / t : 100;
                sendSyncProgress(taskId, pct, "Importing " + current + " of " + t, TaskStatus.IN_PROGRESS);
            });
            sendSyncProgress(taskId, 100, buildImportCompletionMessage(total, libraryEntity.isTagByDirectory()), TaskStatus.COMPLETED);
        } else {
            fileAsBookProcessor.processLibraryFilesGrouped(newBookGroups, libraryEntity);
        }
        scheduleLibraryDirectoryTaggingIfEnabled(libraryEntity);

        notificationService.sendMessage(Topic.LOG, LogNotification.info("Finished refreshing library: " + libraryEntity.getName()));
    }

    public void processLibraryFiles(List<LibraryFile> libraryFiles, LibraryEntity libraryEntity) {
        fileAsBookProcessor.processLibraryFiles(libraryFiles, libraryEntity);
    }

    private void importLibraryFiles(LibraryEntity libraryEntity, List<LibraryFile> libraryFiles) {
        String taskId = UUID.randomUUID().toString();
        List<LibraryFile> newFiles = detectNewBookPaths(libraryFiles, libraryEntity);

        Map<String, List<LibraryFile>> groups = bookGroupingService.groupForInitialScan(newFiles, libraryEntity);
        int total = groups.size();
        if (total > 0) {
            sendSyncProgress(taskId, 0, "Preparing 0 of " + total, TaskStatus.IN_PROGRESS);
            fileAsBookProcessor.processLibraryFilesGrouped(groups, libraryEntity, (current, t) -> {
                int pct = t > 0 ? (current * 100) / t : 100;
                sendSyncProgress(taskId, pct, "Importing " + current + " of " + t, TaskStatus.IN_PROGRESS);
            });
            sendSyncProgress(taskId, 100, buildImportCompletionMessage(total, libraryEntity.isTagByDirectory()), TaskStatus.COMPLETED);
        } else {
            fileAsBookProcessor.processLibraryFilesGrouped(groups, libraryEntity);
        }
        scheduleImportedBookTaggingIfEnabled(libraryEntity, newFiles);
    }

    private void validateLibraryPathsAccessible(List<LibraryPathEntity> pathEntities) {
        for (var pathEntity : pathEntities) {
            Path path = Path.of(pathEntity.getPath());
            if (!Files.exists(path) || !Files.isDirectory(path) || !Files.isReadable(path)) {
                log.error("Library path not accessible: {}", path);
                throw ApiError.LIBRARY_PATH_NOT_ACCESSIBLE.createException(path.toString());
            }
        }
    }

    protected static List<Long> detectDeletedBookIds(List<LibraryFile> libraryFiles, LibraryEntity libraryEntity) {
        Set<Path> currentFullPaths = libraryFiles.stream()
                .map(LibraryFile::getFullPath)
                .collect(Collectors.toSet());

        return libraryEntity.getBookEntities().stream()
                .filter(book -> (book.getDeleted() == null || !book.getDeleted()))
                .filter(book -> {
                    // Don't mark fileless books as deleted - they're intentionally without files
                    if (!book.hasFiles()) {
                        return false;
                    }
                    return !currentFullPaths.contains(book.getFullFilePath());
                })
                .map(BookEntity::getId)
                .collect(Collectors.toList());
    }

    protected List<LibraryFile> detectNewBookPaths(List<LibraryFile> libraryFiles, LibraryEntity libraryEntity) {
        Set<String> existingKeys = bookRepository.findAllByLibraryIdWithFilesAndPath(libraryEntity.getId()).stream()
                .filter(book -> book.getBookFiles() != null && !book.getBookFiles().isEmpty())
                .map(this::generateUniqueKey)
                .collect(Collectors.toSet());

        Set<String> additionalFileKeys = bookAdditionalFileRepository.findByLibraryId(libraryEntity.getId()).stream()
                .map(this::generateUniqueKey)
                .collect(Collectors.toSet());

        existingKeys.addAll(additionalFileKeys);

        return libraryFiles.stream()
                .filter(file -> !existingKeys.contains(generateUniqueKey(file)))
                .collect(Collectors.toList());
    }

    private List<Long> detectUnexpectedFilelessBookIds(Long libraryId) {
        return bookRepository.findFilelessBooksByLibraryId(libraryId).stream()
                .filter(book -> !Boolean.TRUE.equals(book.getIsPhysical()))
                .map(BookEntity::getId)
                .toList();
    }

    private void autoAttachFile(BookEntity book, LibraryFile file) {
        // Check if file already exists to prevent duplicates during concurrent rescans
        var existing = bookAdditionalFileRepository.findByLibraryPath_IdAndFileSubPathAndFileName(
                file.getLibraryPathEntity().getId(), file.getFileSubPath(), file.getFileName());
        if (existing.isPresent()) {
            log.debug("Additional file already exists, skipping: {}", file.getFileName());
            return;
        }

        // Set libraryPath if not set (fileless books like physical books don't have one)
        if (book.getLibraryPath() == null) {
            book.setLibraryPath(file.getLibraryPathEntity());
        } else if (!book.getLibraryPath().getId().equals(file.getLibraryPathEntity().getId())) {
            // Book already has a different libraryPath - cannot attach files from different paths
            log.warn("Cannot attach file '{}' to book id={}: file is in libraryPath {} but book is in libraryPath {}",
                    file.getFileName(), book.getId(), file.getLibraryPathEntity().getId(), book.getLibraryPath().getId());
            return;
        }

        String hash = file.isFolderBased()
                ? FileFingerprint.generateFolderHash(file.getFullPath())
                : FileFingerprint.generateHash(file.getFullPath());
        Long fileSizeKb = file.isFolderBased()
                ? FileUtils.getFolderSizeInKb(file.getFullPath())
                : FileUtils.getFileSizeInKb(file.getFullPath());
        BookFileEntity additionalFile = BookFileEntity.builder()
                .book(book)
                .fileName(file.getFileName())
                .fileSubPath(file.getFileSubPath())
                .isBookFormat(true)
                .bookType(file.getBookFileType())
                .folderBased(file.isFolderBased())
                .fileSizeKb(fileSizeKb)
                .initialHash(hash)
                .currentHash(hash)
                .addedOn(Instant.now())
                .build();

        try {
            bookAdditionalFileRepository.save(additionalFile);
            String primaryFileName = book.hasFiles() ? book.getPrimaryBookFile().getFileName() : "book#" + book.getId();
            log.info("Auto-attached new format {} to existing book: {}", file.getFileName(), primaryFileName);
            fileAsBookProcessor.generateCoverFromAdditionalFile(book, file);
        } catch (Exception e) {
            log.error("Error auto-attaching file {}: {}", file.getFileName(), e.getMessage());
        }
    }

    private String generateUniqueKey(BookEntity book) {
        BookFileEntity primaryFile = book.getPrimaryBookFile();
        if (primaryFile == null) {
            // Fileless book - use a unique key that won't match any file
            return "fileless:" + book.getId();
        }
        return generateKey(book.getLibraryPath().getId(), primaryFile.getFileSubPath(), primaryFile.getFileName());
    }

    private String generateUniqueKey(BookFileEntity file) {
        return generateKey(file.getBook().getLibraryPath().getId(), file.getFileSubPath(), file.getFileName());
    }

    private String generateUniqueKey(LibraryFile file) {
        return generateKey(file.getLibraryPathEntity().getId(), file.getFileSubPath(), file.getFileName());
    }

    private String generateKey(Long libraryPathId, String subPath, String fileName) {
        String safeSubPath = (subPath == null) ? "" : subPath;
        return libraryPathId + ":" + safeSubPath + ":" + fileName;
    }

    protected List<Long> detectDeletedAdditionalFiles(List<LibraryFile> libraryFiles, LibraryEntity libraryEntity) {
        Set<String> currentFileKeys = libraryFiles.stream()
                .map(this::generateUniqueKey)
                .collect(Collectors.toSet());

        List<BookFileEntity> allAdditionalFiles = bookAdditionalFileRepository.findByLibraryId(libraryEntity.getId());

        return allAdditionalFiles.stream()
                .filter(BookFileEntity::isBookFormat)
                .filter(additionalFile -> !currentFileKeys.contains(generateUniqueKey(additionalFile)))
                .map(BookFileEntity::getId)
                .collect(Collectors.toList());
    }

    private void sendSyncProgress(String taskId, int progress, String message, TaskStatus status) {
        try {
            TaskProgressPayload payload = TaskProgressPayload.builder()
                    .taskId(taskId)
                    .taskType(TaskType.SYNC_LIBRARY_FILES)
                    .message(message)
                    .progress(progress)
                    .taskStatus(status)
                    .build();
            notificationService.sendMessage(Topic.TASK_PROGRESS, payload);
        } catch (Exception e) {
            log.error("Failed to send sync progress notification: {}", e.getMessage(), e);
        }
    }

    private void scheduleImportedBookTaggingIfEnabled(LibraryEntity libraryEntity, List<LibraryFile> importedFiles) {
        if (!libraryEntity.isTagByDirectory()) {
            return;
        }

        Set<Long> importedBookIds = findImportedBookIds(libraryEntity, importedFiles);
        if (importedBookIds.isEmpty()) {
            return;
        }

        directoryTagTaskStarter.scheduleBooks(libraryEntity.getId(), importedBookIds);
        log.info("Queued background directory tagging for {} imported books in library {}", importedBookIds.size(), libraryEntity.getId());
    }

    private void scheduleLibraryDirectoryTaggingIfEnabled(LibraryEntity libraryEntity) {
        if (!libraryEntity.isTagByDirectory()) {
            return;
        }

        directoryTagTaskStarter.scheduleLibrary(libraryEntity.getId());
        log.info("Queued background directory tagging for library {}", libraryEntity.getId());
    }

    private Set<Long> findImportedBookIds(LibraryEntity libraryEntity, List<LibraryFile> importedFiles) {
        if (importedFiles == null || importedFiles.isEmpty()) {
            return Set.of();
        }

        Set<String> importedKeys = importedFiles.stream()
                .map(this::generateUniqueKey)
                .collect(Collectors.toSet());

        return bookRepository.findAllByLibraryIdWithFilesAndPath(libraryEntity.getId()).stream()
                .filter(book -> book.getPrimaryBookFile() != null)
                .filter(book -> importedKeys.contains(generateUniqueKey(book)))
                .map(BookEntity::getId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private String buildImportCompletionMessage(int importedGroups, boolean tagByDirectory) {
        if (!tagByDirectory) {
            return "Imported " + importedGroups + " books";
        }
        return "Imported " + importedGroups + " books. Directory tagging continues in the background.";
    }
}
