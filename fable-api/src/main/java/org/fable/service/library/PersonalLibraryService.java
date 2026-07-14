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
import org.fable.service.monitoring.LibraryWatchService;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
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
@RequiredArgsConstructor
public class PersonalLibraryService {

    public static final String PERSONAL_ROOT = "/books/_users";

    private final LibraryRepository libraryRepository;
    private final UserRepository userRepository;
    private final LibraryWatchService libraryWatchService;
    private final AuditService auditService;

    @Transactional
    public LibraryEntity createPersonalLibrary(FableUserEntity user, boolean showInAdminCatalog) {
        if (user == null || user.getId() == null) {
            throw ApiError.GENERIC_BAD_REQUEST.createException("User must be persisted before creating a personal library");
        }

        Path dir = Paths.get(PERSONAL_ROOT, String.valueOf(user.getId()));
        try {
            Files.createDirectories(dir);
        } catch (IOException e) {
            log.error("Failed to create personal library directory {}", dir, e);
            throw ApiError.GENERIC_BAD_REQUEST.createException("Could not create personal library directory: " + dir);
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

        auditService.log(AuditAction.LIBRARY_CREATED, "Library", library.getId(),
                "Created personal library for user " + user.getUsername() + " at " + path);
        log.info("Provisioned personal library id={} for user {} at {}", library.getId(), user.getUsername(), path);
        return library;
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
