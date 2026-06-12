package org.fable.service.library;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class DirectoryTagQueueServiceTest {

    @Test
    void enqueueBooks_shouldMergeScopesUntilWholeLibraryIsRequested() {
        DirectoryTagQueueService queueService = new DirectoryTagQueueService();

        queueService.enqueueBooks(5L, Set.of(10L, 11L));
        queueService.enqueueBooks(5L, Set.of(12L));

        List<DirectoryTagQueueService.PendingLibraryWork> scopedWork = queueService.drainPendingWork();

        assertThat(scopedWork).containsExactly(new DirectoryTagQueueService.PendingLibraryWork(5L, false, Set.of(10L, 11L, 12L)));

        queueService.enqueueBooks(5L, Set.of(99L));
        queueService.enqueueLibrary(5L);

        List<DirectoryTagQueueService.PendingLibraryWork> libraryWork = queueService.drainPendingWork();

        assertThat(libraryWork).containsExactly(new DirectoryTagQueueService.PendingLibraryWork(5L, true, Set.of()));
    }
}