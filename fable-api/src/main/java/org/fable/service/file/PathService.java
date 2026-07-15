package org.fable.service.file;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.fable.config.security.service.AuthenticationService;
import org.fable.exception.ApiError;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.Library;
import org.fable.model.entity.LibraryEntity;
import org.fable.model.entity.LibraryPathEntity;
import org.fable.repository.LibraryRepository;
import org.fable.service.library.PersonalLibraryService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Slf4j
@Service
@RequiredArgsConstructor
public class PathService {

    /**
     * Comprehensive denylist of sensitive OS paths.
     * The admin file-browser is an allowable feature, but it must not expose sensitive
     * host paths. Any path that equals or starts with one of these prefixes is blocked.
     *
     * NOTE: This denylist is defense-in-depth. In Docker deployments the container
     * boundary provides the primary isolation; on bare-metal deployments this list
     * prevents browsing credential/config files.
     */
    private static final Set<String> BLOCKED_PATH_PREFIXES = Set.of(
            "/proc",     // kernel process info
            "/sys",      // kernel/device sysfs
            "/dev",      // device files (RCE risk via /dev/mem, /dev/kmem etc.)
            "/run",      // runtime sockets/PIDs
            "/var/run",  // legacy runtime sockets
            "/etc",      // system config and credentials (passwd, shadow, ssl keys …)
            "/root",     // root home directory
            "/home",     // user home directories
            "/tmp",      // world-writable temporary files
            "/var/lib",  // database volumes, package manager state …
            "/var/log",  // application and system logs
            "/boot",     // boot loader and kernel images
            "/lost+found"
    );

    private final AuthenticationService authenticationService;
    private final LibraryRepository libraryRepository;

    @Transactional(readOnly = true)
    public List<String> getFoldersAtPath(String path) {
        Path requested = normalize(path);
        assertPathAllowedForCurrentUser(requested.toString());

        // Resolve symlinks before applying the denylist so symbolic links cannot be
        // used to bypass the check by pointing into a blocked directory.
        Path resolved;
        try {
            resolved = requested.toRealPath();
        } catch (IOException e) {
            // Path doesn't exist yet (user is navigating to a mount point that is
            // not yet populated) – fall back to the normalised but unresolved path.
            resolved = requested;
        }
        if (!resolved.equals(requested)) {
            assertPathAllowedForCurrentUser(resolved.toString());
        }
        final Path directory = resolved;

        if (!Files.exists(directory) || !Files.isDirectory(directory)) {
            log.warn("Invalid path or not a directory: {}", path);
            return Collections.emptyList();
        }
        try (Stream<Path> paths = Files.list(directory)) {
            return paths
                    .filter(Files::isDirectory)
                    .map(p -> directory.resolve(p.getFileName()).toString())
                    .sorted()
                    .collect(Collectors.toList());
        } catch (IOException e) {
            log.error("Error accessing path {}: {}", path, e.getMessage(), e);
            return Collections.emptyList();
        }
    }

    /**
     * Enforces OS denylist for everyone and path jail for non-admins when
     * attaching or browsing library directories.
     */
    @Transactional(readOnly = true)
    public void assertPathAllowedForCurrentUser(String path) {
        Path normalized = normalize(path);
        String normalizedStr = normalized.toString();

        if (isBlockedOsPath(normalizedStr)) {
            log.warn("Blocked path access attempt to restricted directory: {}", normalizedStr);
            throw ApiError.GENERIC_BAD_REQUEST.createException("Access to this directory is not allowed");
        }

        FableUser user = authenticationService.getAuthenticatedUser();
        if (user == null || user.getPermissions() == null || user.getPermissions().isAdmin()) {
            return;
        }

        Set<String> roots = resolveNonAdminAllowlistedRoots(user);
        if (roots.isEmpty() || !isUnderAnyRoot(normalizedStr, roots)) {
            log.warn("Jailed user {} attempted path outside allowlist: {}", user.getId(), normalizedStr);
            throw ApiError.FORBIDDEN.createException("Path is outside your allowed library roots");
        }
    }

    /**
     * Allowlisted roots for non-admins: personal {@code /books/_users/{id}} plus
     * every path on libraries assigned to the user.
     */
    Set<String> resolveNonAdminAllowlistedRoots(FableUser user) {
        Set<String> roots = new LinkedHashSet<>();
        if (user == null || user.getId() == null) {
            return roots;
        }

        roots.add(normalize(PersonalLibraryService.PERSONAL_ROOT + "/" + user.getId()).toString());

        List<Long> libraryIds = new ArrayList<>();
        if (user.getAssignedLibraries() != null) {
            for (Library library : user.getAssignedLibraries()) {
                if (library != null && library.getId() != null) {
                    libraryIds.add(library.getId());
                }
            }
        }

        if (!libraryIds.isEmpty()) {
            for (LibraryEntity library : libraryRepository.findByIdIn(libraryIds)) {
                if (library.getLibraryPaths() == null) {
                    continue;
                }
                for (LibraryPathEntity libraryPath : library.getLibraryPaths()) {
                    if (libraryPath != null && libraryPath.getPath() != null && !libraryPath.getPath().isBlank()) {
                        roots.add(normalize(libraryPath.getPath()).toString());
                    }
                }
            }
        }

        return roots;
    }

    static boolean isUnderAnyRoot(String path, Set<String> roots) {
        if (path == null || roots == null || roots.isEmpty()) {
            return false;
        }
        for (String root : roots) {
            if (root == null || root.isBlank()) {
                continue;
            }
            if (path.equals(root) || path.startsWith(root.endsWith("/") ? root : root + "/")) {
                return true;
            }
        }
        return false;
    }

    private static boolean isBlockedOsPath(String normalized) {
        return BLOCKED_PATH_PREFIXES.stream()
                .anyMatch(blocked -> normalized.equals(blocked) || normalized.startsWith(blocked + "/"));
    }

    private static Path normalize(String path) {
        Objects.requireNonNull(path, "path");
        return Paths.get(path).toAbsolutePath().normalize();
    }
}
