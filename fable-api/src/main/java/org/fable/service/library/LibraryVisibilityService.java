package org.fable.service.library;

import org.fable.model.dto.FableUser;
import org.fable.model.dto.Library;
import org.fable.model.entity.LibraryEntity;
import org.fable.repository.LibraryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Single choke point for which libraries a user may see in the working catalog
 * (sidebar, books, search, stats, OPDS, websockets, AI library pickers).
 *
 * <p>Admins no longer receive an unscoped "all libraries" view: personal libraries
 * ({@code owner_user_id != null}) are excluded unless {@code show_in_admin_catalog}.
 * Background scanners still use {@link LibraryService#getAllLibraries()}.
 */
@Service
@RequiredArgsConstructor
public class LibraryVisibilityService {

    private final LibraryRepository libraryRepository;

    /**
     * Library IDs visible in the working catalog for this user.
     * Never {@code null} — empty means no access. Prefer this over admin short-circuit.
     */
    public Set<Long> getAccessibleLibraryIds(FableUser user) {
        if (user == null) {
            return Collections.emptySet();
        }
        if (user.getPermissions() != null && user.getPermissions().isAdmin()) {
            return libraryRepository.findAdminCatalogVisible().stream()
                    .map(LibraryEntity::getId)
                    .collect(Collectors.toSet());
        }
        if (user.getAssignedLibraries() == null || user.getAssignedLibraries().isEmpty()) {
            return Collections.emptySet();
        }
        return user.getAssignedLibraries().stream()
                .map(Library::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
    }

    /** Entities for sidebar / library list (filtered for admin). */
    public List<LibraryEntity> getCatalogVisibleEntities(FableUser user) {
        if (user == null) {
            return List.of();
        }
        if (user.getPermissions() != null && user.getPermissions().isAdmin()) {
            return libraryRepository.findAdminCatalogVisible();
        }
        if (user.getAssignedLibraries() == null || user.getAssignedLibraries().isEmpty()) {
            return List.of();
        }
        List<Long> ids = user.getAssignedLibraries().stream().map(Library::getId).toList();
        return libraryRepository.findByIdIn(ids);
    }

    public boolean isLibraryAccessible(FableUser user, Long libraryId) {
        if (libraryId == null) {
            return false;
        }
        return getAccessibleLibraryIds(user).contains(libraryId);
    }

    public boolean isPersonalLibrary(LibraryEntity library) {
        return library != null && library.getOwnerUserId() != null;
    }
}
