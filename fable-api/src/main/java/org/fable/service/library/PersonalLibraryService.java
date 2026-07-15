package org.fable.service.library;

import org.fable.exception.ApiError;
import org.fable.model.entity.FableUserEntity;
import org.fable.model.entity.LibraryEntity;
import org.fable.model.entity.LibraryPathEntity;
import org.fable.model.enums.AuditAction;
import org.fable.model.enums.DirectoryTagDepth;
import org.fable.model.enums.IconType;
import org.fable.model.enums.LibraryOrganizationMode;
import org.fable.model.enums.MetadataSource;
import org.fable.repository.LibraryRepository;
import org.fable.repository.UserRepository;
import org.fable.service.audit.AuditService;
import org.fable.service.bookdrop.BookdropInboxService;
import org.fable.service.bookdrop.BookdropMonitoringService;
import org.fable.service.monitoring.LibraryWatchService;
import org.springframework.context.annotation.Lazy;
import jakarta.transaction.Transactional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

/**
 * Auto-provisions a personal library under the existing {@code /books} mount:
 * {@code /books/_users/{userId}/}, owned by and mapped only to that user.
 */
@Slf4j
@Service
public class PersonalLibraryService {

    public static final String PERSONAL_ROOT = "/books/_users";

    private final LibraryRepository libraryRepository;
    private final UserRepository userRepository;
    private final LibraryWatchService libraryWatchService;
    private final AuditService auditService;
    private final BookdropInboxService bookdropInboxService;
    private final BookdropMonitoringService bookdropMonitoringService;

    public PersonalLibraryService(
            LibraryRepository libraryRepository,
            UserRepository userRepository,
            @Lazy LibraryWatchService libraryWatchService,
            AuditService auditService,
            BookdropInboxService bookdropInboxService,
            @Lazy BookdropMonitoringService bookdropMonitoringService) {
        this.libraryRepository = libraryRepository;
        this.userRepository = userRepository;
        this.libraryWatchService = libraryWatchService;
        this.auditService = auditService;
        this.bookdropInboxService = bookdropInboxService;
        this.bookdropMonitoringService = bookdropMonitoringService;
    }

    @Transactional
    public LibraryEntity createPersonalLibrary(FableUserEntity user, boolean showInAdminCatalog) {
        if (user == null || user.getId() == null) {
            throw ApiError.GENERIC_BAD_REQUEST.createException("User must be persisted before creating a personal library");
        }

        ensurePersonalRootWritable();

        Path dir = Paths.get(PERSONAL_ROOT, String.valueOf(user.getId()));
        try {
            Files.createDirectories(dir);
        } catch (IOException e) {
            log.error("Failed to create personal library directory {}", dir, e);
            throw ApiError.GENERIC_BAD_REQUEST.createException(
                    "Could not create personal library directory: " + dir
                            + " (" + e.getMessage() + "). Ensure /books is mounted and /books/_users is writable by the container user.");
        }

        String path = dir.toAbsolutePath().normalize().toString();
        String displayName = user.getUsername() + "'s Library";

        LibraryPathEntity pathEntity = LibraryPathEntity.builder()
                .path(path)
                .build();

        LibraryEntity library = LibraryEntity.builder()
                .name(displayName)
                .libraryPaths(new ArrayList<>(List.of(pathEntity)))
                .watch(true)
                .icon("pi pi-user")
                .iconType(IconType.PRIME_NG)
                .organizationMode(LibraryOrganizationMode.AUTO_DETECT)
                .metadataSource(MetadataSource.EMBEDDED)
                .tagByDirectory(false)
                .directoryTagDepth(DirectoryTagDepth.LAST_ONLY)
                .ownerUserId(user.getId())
                .showInAdminCatalog(showInAdminCatalog)
                .build();
        pathEntity.setLibrary(library);

        library = libraryRepository.save(library);

        List<LibraryEntity> assigned = user.getLibraries() != null
                ? new ArrayList<>(user.getLibraries())
                : new ArrayList<>();
        assigned.add(library);
        user.setLibraries(assigned);
        userRepository.save(user);

        try {
            libraryWatchService.registerPath(dir, library.getId());
        } catch (Exception e) {
            log.warn("Could not register watch for personal library {}: {}", library.getId(), e.getMessage());
        }

        try {
            Path personalBookdrop = bookdropInboxService.ensurePersonalInbox(user.getId());
            bookdropMonitoringService.ensureWatched(personalBookdrop);
        } catch (Exception e) {
            log.warn("Could not provision personal BookDrop inbox for user {}: {}", user.getId(), e.getMessage());
        }

        auditService.log(AuditAction.LIBRARY_CREATED, "Library", library.getId(),
                "Created personal library for user " + user.getUsername() + " at " + path);
        log.info("Provisioned personal library id={} for user {} at {}", library.getId(), user.getUsername(), path);
        return library;
    }

    /**
     * Ensures {@code /books/_users} exists and is writable. Prefer fixing this in
     * {@code entrypoint.sh} (as root); this is a second chance when the volume was
     * already mounted with a writable /books parent.
     */
    public void ensurePersonalRootWritable() {
        Path root = Paths.get(PERSONAL_ROOT);
        try {
            Files.createDirectories(root);
            if (!Files.isWritable(root)) {
                throw ApiError.GENERIC_BAD_REQUEST.createException(
                        "Personal library root is not writable: " + PERSONAL_ROOT
                                + ". Create it on the host (mkdir -p books/_users) and chown to USER_ID:GROUP_ID, or restart the container so entrypoint can create it.");
            }
        } catch (IOException e) {
            log.error("Failed to ensure personal library root {}", root, e);
            throw ApiError.GENERIC_BAD_REQUEST.createException(
                    "Could not create personal library root: " + PERSONAL_ROOT
                            + " (" + e.getMessage() + "). Ensure /books is mounted and writable, or create books/_users on the host and chown to USER_ID:GROUP_ID.");
        }
    }

    @Transactional
    public void setShowInAdminCatalogForOwner(Long ownerUserId, boolean showInAdminCatalog) {
        if (ownerUserId == null) {
            return;
        }
        List<LibraryEntity> owned = libraryRepository.findByOwnerUserId(ownerUserId);
        for (LibraryEntity library : owned) {
            library.setShowInAdminCatalog(showInAdminCatalog);
        }
        if (!owned.isEmpty()) {
            libraryRepository.saveAll(owned);
        }
    }
}
