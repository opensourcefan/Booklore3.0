package org.booklore.service.library;

import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class DirectoryTagQueueService {

    private final Map<Long, PendingScope> pendingScopes = new ConcurrentHashMap<>();

    public synchronized void enqueueLibrary(Long libraryId) {
        if (libraryId != null) {
            pendingScopes.compute(libraryId, (ignored, existing) -> PendingScope.fullLibrary(existing));
        }
    }

    public synchronized void enqueueLibraries(Collection<Long> libraryIds) {
        if (libraryIds == null || libraryIds.isEmpty()) {
            return;
        }
        libraryIds.stream().filter(id -> id != null).forEach(this::enqueueLibrary);
    }

    public synchronized void enqueueBooks(Long libraryId, Collection<Long> bookIds) {
        if (libraryId == null || bookIds == null || bookIds.isEmpty()) {
            return;
        }

        Set<Long> normalizedBookIds = bookIds.stream()
                .filter(id -> id != null)
                .collect(java.util.stream.Collectors.toCollection(TreeSet::new));
        if (normalizedBookIds.isEmpty()) {
            return;
        }

        pendingScopes.compute(libraryId, (ignored, existing) -> PendingScope.books(existing, normalizedBookIds));
    }

    public synchronized List<PendingLibraryWork> drainPendingWork() {
        Map<Long, PendingScope> drained = new TreeMap<>(pendingScopes);
        pendingScopes.keySet().removeAll(drained.keySet());

        return drained.entrySet().stream()
                .map(entry -> new PendingLibraryWork(
                        entry.getKey(),
                        entry.getValue().fullLibrary(),
                        Set.copyOf(entry.getValue().bookIds())
                ))
                .toList();
    }

    public synchronized boolean hasPendingLibraries() {
        return !pendingScopes.isEmpty();
    }

    private record PendingScope(boolean fullLibrary, Set<Long> bookIds) {

        private static PendingScope fullLibrary(PendingScope existing) {
            return new PendingScope(true, new TreeSet<>());
        }

        private static PendingScope books(PendingScope existing, Set<Long> bookIds) {
            if (existing != null && existing.fullLibrary()) {
                return existing;
            }

            Set<Long> merged = new TreeSet<>();
            if (existing != null) {
                merged.addAll(existing.bookIds());
            }
            merged.addAll(bookIds);
            return new PendingScope(false, merged);
        }
    }

    public record PendingLibraryWork(Long libraryId, boolean fullLibrary, Set<Long> bookIds) {
    }
}