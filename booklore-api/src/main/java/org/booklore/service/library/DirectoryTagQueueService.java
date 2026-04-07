package org.booklore.service.library;

import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class DirectoryTagQueueService {

    private final Set<Long> pendingLibraryIds = ConcurrentHashMap.newKeySet();

    public void enqueueLibrary(Long libraryId) {
        if (libraryId != null) {
            pendingLibraryIds.add(libraryId);
        }
    }

    public void enqueueLibraries(Collection<Long> libraryIds) {
        if (libraryIds == null || libraryIds.isEmpty()) {
            return;
        }
        libraryIds.stream().filter(id -> id != null).forEach(pendingLibraryIds::add);
    }

    public Set<Long> drainPendingLibraries() {
        Set<Long> drained = new TreeSet<>(pendingLibraryIds);
        pendingLibraryIds.removeAll(drained);
        return drained;
    }

    public boolean hasPendingLibraries() {
        return !pendingLibraryIds.isEmpty();
    }
}