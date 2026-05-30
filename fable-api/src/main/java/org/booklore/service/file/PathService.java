package org.booklore.service.file;

import lombok.extern.slf4j.Slf4j;
import org.booklore.exception.ApiError;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Slf4j
@Service
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

    public List<String> getFoldersAtPath(String path) {
        Path requested = Paths.get(path).toAbsolutePath().normalize();

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
        final Path directory = resolved;

        String normalized = directory.toString();

        if (BLOCKED_PATH_PREFIXES.stream()
                .anyMatch(blocked -> normalized.equals(blocked) || normalized.startsWith(blocked + "/"))) {
            log.warn("Blocked path browsing attempt to restricted directory: {}", normalized);
            throw ApiError.GENERIC_BAD_REQUEST.createException("Access to this directory is not allowed");
        }

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
}
