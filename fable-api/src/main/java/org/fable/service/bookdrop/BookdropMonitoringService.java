package org.fable.service.bookdrop;

import org.fable.model.enums.BookFileExtension;
import org.fable.repository.BookdropFileRepository;
import org.fable.util.FileUtils;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.*;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;

@Slf4j
@Service
public class BookdropMonitoringService {

    private final BookdropInboxService bookdropInboxService;
    private final BookdropEventHandlerService eventHandler;
    private final BookdropFileRepository bookdropFileRepository;

    private WatchService watchService;
    private Thread watchThread;
    private volatile boolean running;
    private volatile boolean paused;
    private volatile boolean disabled;

    /** Inbox root → active watch key (null value when paused but still tracked). */
    private final Map<Path, WatchKey> watchedRoots = new ConcurrentHashMap<>();

    public BookdropMonitoringService(
            BookdropInboxService bookdropInboxService,
            BookdropEventHandlerService eventHandler,
            BookdropFileRepository bookdropFileRepository
    ) {
        this.bookdropInboxService = bookdropInboxService;
        this.eventHandler = eventHandler;
        this.bookdropFileRepository = bookdropFileRepository;
    }

    @PostConstruct
    public void start() {
        try {
            Path global = bookdropInboxService.getGlobalInbox();
            if (Files.notExists(global)) {
                try {
                    Files.createDirectories(global);
                    log.info("Created missing bookdrop folder: {}", global);
                } catch (IOException e) {
                    log.warn("Bookdrop folder is not available at '{}'. Bookdrop monitoring is disabled. " +
                            "Mount a volume at this path to enable it.", global);
                    this.disabled = true;
                    return;
                }
            }

            log.info("Starting bookdrop folder monitor for global + personal inboxes");
            this.watchService = FileSystems.getDefault().newWatchService();
            this.running = true;
            this.paused = false;

            for (Path root : bookdropInboxService.allWatchRoots()) {
                registerRoot(root);
            }

            this.watchThread = new Thread(this::processEvents, "BookdropFolderWatcher");
            this.watchThread.setDaemon(true);
            this.watchThread.start();
            scanExistingBookdropFiles();
        } catch (IOException e) {
            log.warn("Failed to start bookdrop folder monitor. Bookdrop monitoring is disabled.", e);
            this.disabled = true;
        }
    }

    @PreDestroy
    public void stop() {
        running = false;
        if (watchThread != null) {
            watchThread.interrupt();
        }
        if (watchService != null) {
            try {
                watchService.close();
            } catch (IOException e) {
                log.error("Error closing WatchService", e);
            }
        }
        watchedRoots.clear();
        log.info("Stopped bookdrop folder monitor");
    }

    /**
     * Ensures a personal (or other) inbox is watched and scanned for existing files.
     */
    public synchronized void ensureWatched(Path inbox) {
        if (disabled || inbox == null) {
            return;
        }
        Path root = inbox.toAbsolutePath().normalize();
        try {
            Files.createDirectories(root);
        } catch (IOException e) {
            log.warn("Cannot create bookdrop inbox to watch: {}", root, e);
            return;
        }
        if (!watchedRoots.containsKey(root)) {
            registerRoot(root);
            scanRoot(root);
        } else if (!paused && (watchedRoots.get(root) == null || !watchedRoots.get(root).isValid())) {
            registerRoot(root);
        }
    }

    public synchronized void pauseMonitoring() {
        if (disabled) return;
        if (!paused) {
            for (Map.Entry<Path, WatchKey> entry : watchedRoots.entrySet()) {
                WatchKey key = entry.getValue();
                if (key != null) {
                    key.cancel();
                    entry.setValue(null);
                }
            }
            paused = true;
            log.info("Bookdrop monitoring paused ({} roots).", watchedRoots.size());
        } else {
            log.info("Bookdrop monitoring already paused.");
        }
    }

    public synchronized void resumeMonitoring() {
        if (disabled) return;
        if (paused) {
            for (Path root : watchedRoots.keySet()) {
                registerRoot(root);
            }
            paused = false;
            log.info("Bookdrop monitoring resumed ({} roots).", watchedRoots.size());
        } else {
            log.info("Bookdrop monitoring is not paused, cannot resume.");
        }
    }

    private void registerRoot(Path root) {
        Path normalized = root.toAbsolutePath().normalize();
        if (!Files.isDirectory(normalized)) {
            return;
        }
        if (watchService == null || paused) {
            watchedRoots.putIfAbsent(normalized, null);
            return;
        }
        try {
            WatchKey existing = watchedRoots.get(normalized);
            if (existing != null && existing.isValid()) {
                return;
            }
            WatchKey key = normalized.register(watchService,
                    StandardWatchEventKinds.ENTRY_CREATE,
                    StandardWatchEventKinds.ENTRY_DELETE);
            watchedRoots.put(normalized, key);
            log.info("Watching bookdrop inbox: {}", normalized);
        } catch (IOException e) {
            log.warn("Failed to register bookdrop watch on {}: {}", normalized, e.getMessage());
            watchedRoots.putIfAbsent(normalized, null);
        }
    }

    private void processEvents() {
        while (running) {
            if (paused) {
                try {
                    Thread.sleep(1000);
                } catch (InterruptedException e) {
                    log.info("Bookdrop monitor thread interrupted during pause");
                    Thread.currentThread().interrupt();
                    return;
                }
                continue;
            }

            WatchKey key;
            try {
                key = watchService.take();
            } catch (InterruptedException e) {
                log.info("Bookdrop monitor thread interrupted");
                Thread.currentThread().interrupt();
                return;
            } catch (ClosedWatchServiceException e) {
                log.info("WatchService closed, stopping thread");
                return;
            }

            Path root;
            try {
                root = (Path) key.watchable();
            } catch (Exception e) {
                log.warn("Could not resolve watchable path for key");
                key.reset();
                continue;
            }

            for (WatchEvent<?> event : key.pollEvents()) {
                WatchEvent.Kind<?> kind = event.kind();

                if (kind == StandardWatchEventKinds.OVERFLOW) {
                    log.warn("Overflow event detected on {}", root);
                    continue;
                }

                Path context = (Path) event.context();
                Path fullPath = root.resolve(context);

                log.info("Detected {} event on: {}", kind.name(), fullPath);

                if (kind == StandardWatchEventKinds.ENTRY_CREATE || kind == StandardWatchEventKinds.ENTRY_MODIFY) {
                    if (Files.isDirectory(fullPath)) {
                        log.info("New directory detected, scanning recursively: {}", fullPath);
                        try (Stream<Path> pathStream = Files.walk(fullPath)) {
                            pathStream
                                    .filter(Files::isRegularFile)
                                    .filter(path -> !FileUtils.shouldIgnore(path))
                                    .filter(path -> BookFileExtension.fromFileName(path.getFileName().toString()).isPresent())
                                    .forEach(path -> eventHandler.enqueueFile(path, StandardWatchEventKinds.ENTRY_CREATE));
                        } catch (IOException e) {
                            log.error("Failed to scan new directory: {}", fullPath, e);
                        }
                    } else {
                        if (!FileUtils.shouldIgnore(fullPath)) {
                            if (BookFileExtension.fromFileName(fullPath.getFileName().toString()).isPresent()) {
                                eventHandler.enqueueFile(fullPath, kind);
                            } else {
                                log.info("Ignored unsupported file type: {}", fullPath);
                            }
                        }
                    }
                } else if (kind == StandardWatchEventKinds.ENTRY_DELETE) {
                    if (Files.isDirectory(fullPath)) {
                        log.info("Directory deleted: {}, performing bulk DB cleanup", fullPath);
                    } else {
                        log.info("File deleted: {}", fullPath);
                    }
                    eventHandler.enqueueFile(fullPath, kind);
                }
            }

            boolean valid = key.reset();
            if (!valid) {
                log.warn("WatchKey is no longer valid for {}", root);
                watchedRoots.computeIfPresent(root.toAbsolutePath().normalize(), (p, k) -> null);
            }
        }
    }

    public void rescanBookdropFolder() {
        if (disabled) {
            log.warn("Bookdrop monitoring is disabled. Skipping rescan.");
            return;
        }
        log.info("Rescan of Bookdrop folders triggered.");
        for (Path personal : bookdropInboxService.discoverPersonalInboxes()) {
            ensureWatched(personal);
        }
        scanExistingBookdropFiles();
    }

    private void scanExistingBookdropFiles() {
        Set<Path> roots = new HashSet<>(watchedRoots.keySet());
        if (roots.isEmpty()) {
            roots.addAll(bookdropInboxService.allWatchRoots());
        }
        for (Path root : roots) {
            scanRoot(root);
        }
    }

    private void scanRoot(Path bookdrop) {
        if (!Files.isDirectory(bookdrop)) {
            return;
        }
        List<Path> supportedFiles;
        try (Stream<Path> files = Files.walk(bookdrop)) {
            supportedFiles = files.filter(Files::isRegularFile)
                    .filter(path -> !FileUtils.shouldIgnore(path))
                    .filter(path -> BookFileExtension.fromFileName(path.getFileName().toString()).isPresent())
                    .toList();
        } catch (IOException e) {
            log.error("Error scanning bookdrop folder {}", bookdrop, e);
            return;
        }

        if (!supportedFiles.isEmpty()) {
            List<String> supportedFilePaths = supportedFiles.stream()
                    .map(Path::toAbsolutePath)
                    .map(Path::toString)
                    .toList();
            List<String> knownFilePaths = bookdropFileRepository.findAllFilePathsIn(supportedFilePaths);
            Set<String> knownPaths = knownFilePaths == null ? Set.of() : new HashSet<>(knownFilePaths);

            supportedFilePaths.stream()
                    .filter(path -> !knownPaths.contains(path))
                    .map(Path::of)
                    .forEach(path -> {
                        log.info("Found existing supported file: {}", path);
                        eventHandler.enqueueFile(path, StandardWatchEventKinds.ENTRY_CREATE);
                    });
        }
    }
}
