package org.fable.service.bookdrop;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.fable.config.AppProperties;
import org.fable.model.dto.FableUser;
import org.fable.service.library.PersonalLibraryService;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Resolves global vs personal BookDrop inbox roots.
 * <p>
 * Global (admins / host drop): {@code app.bookdrop-folder} (default {@code /bookdrop}).
 * Personal (non-admins): {@code /books/_users/{userId}/bookdrop} with a {@code .ignore}
 * marker so library scans do not ingest inbox files.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class BookdropInboxService {

    public static final String PERSONAL_BOOKDROP_DIR = "bookdrop";

    private final AppProperties appProperties;

    public Path getGlobalInbox() {
        return Path.of(appProperties.getBookdropFolder()).toAbsolutePath().normalize();
    }

    public Path getPersonalInbox(long userId) {
        return Paths.get(PersonalLibraryService.PERSONAL_ROOT, String.valueOf(userId), PERSONAL_BOOKDROP_DIR)
                .toAbsolutePath()
                .normalize();
    }

    /**
     * Admin → global inbox. Non-admin → personal inbox. Null/system → global.
     */
    public Path resolveInboxForUser(FableUser user) {
        if (user == null || user.getId() == null || user.getId() == -1L) {
            return getGlobalInbox();
        }
        if (user.getPermissions() != null && user.getPermissions().isAdmin()) {
            return getGlobalInbox();
        }
        return getPersonalInbox(user.getId());
    }

    public boolean isAdminUser(FableUser user) {
        return user != null && user.getPermissions() != null && user.getPermissions().isAdmin();
    }

    /**
     * Creates the personal inbox and a {@code .ignore} file so library watchers/scans skip it.
     */
    public Path ensurePersonalInbox(long userId) {
        Path inbox = getPersonalInbox(userId);
        try {
            Files.createDirectories(inbox);
            Path ignore = inbox.resolve(".ignore");
            if (!Files.exists(ignore)) {
                Files.writeString(ignore, "# Fable personal BookDrop — excluded from library scans\n");
            }
            return inbox;
        } catch (IOException e) {
            log.error("Failed to create personal BookDrop inbox {}", inbox, e);
            throw new IllegalStateException("Could not create personal BookDrop inbox: " + inbox, e);
        }
    }

    /**
     * If the path lies under {@code /books/_users/{id}/bookdrop}, returns that user id.
     */
    public Optional<Long> resolveOwnerUserId(Path filePath) {
        if (filePath == null) {
            return Optional.empty();
        }
        Path normalized = filePath.toAbsolutePath().normalize();
        Path personalRoot = Paths.get(PersonalLibraryService.PERSONAL_ROOT).toAbsolutePath().normalize();
        if (!normalized.startsWith(personalRoot)) {
            return Optional.empty();
        }
        Path relative = personalRoot.relativize(normalized);
        if (relative.getNameCount() < 2) {
            return Optional.empty();
        }
        if (!PERSONAL_BOOKDROP_DIR.equals(relative.getName(1).toString())) {
            return Optional.empty();
        }
        try {
            return Optional.of(Long.parseLong(relative.getName(0).toString()));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    public List<Path> discoverPersonalInboxes() {
        Path root = Paths.get(PersonalLibraryService.PERSONAL_ROOT);
        if (!Files.isDirectory(root)) {
            return List.of();
        }
        List<Path> inboxes = new ArrayList<>();
        try (DirectoryStream<Path> stream = Files.newDirectoryStream(root)) {
            for (Path userDir : stream) {
                if (!Files.isDirectory(userDir)) {
                    continue;
                }
                Path inbox = userDir.resolve(PERSONAL_BOOKDROP_DIR);
                if (Files.isDirectory(inbox)) {
                    inboxes.add(inbox.toAbsolutePath().normalize());
                }
            }
        } catch (IOException e) {
            log.warn("Failed to discover personal BookDrop inboxes under {}: {}", root, e.getMessage());
        }
        return inboxes;
    }

    /**
     * Global inbox (created if possible) plus every discovered personal inbox.
     */
    public List<Path> allWatchRoots() {
        List<Path> roots = new ArrayList<>();
        Path global = getGlobalInbox();
        try {
            if (Files.notExists(global)) {
                Files.createDirectories(global);
            }
            if (Files.isDirectory(global)) {
                roots.add(global);
            }
        } catch (IOException e) {
            log.warn("Global bookdrop folder unavailable at '{}': {}", global, e.getMessage());
        }
        roots.addAll(discoverPersonalInboxes());
        return roots;
    }
}
