package org.booklore.task.tasks;

import org.booklore.exception.APIException;
import org.booklore.model.dto.BookLoreUser;
import org.booklore.model.dto.request.TaskCreateRequest;
import org.booklore.model.dto.response.TaskCreateResponse;
import org.booklore.model.entity.LibraryEntity;
import org.booklore.model.enums.TaskType;
import org.booklore.model.websocket.Topic;
import org.booklore.repository.LibraryRepository;
import org.booklore.service.NotificationService;
import org.booklore.service.library.DirectoryTagQueueService;
import org.booklore.service.library.DirectoryTagService;
import org.booklore.task.TaskCancellationManager;
import org.booklore.task.TaskStatus;
import org.booklore.task.options.DirectoryTagTaskOptions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Set;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DirectoryTaggingTaskTest {

    @Mock
    private LibraryRepository libraryRepository;
    @Mock
    private DirectoryTagQueueService directoryTagQueueService;
    @Mock
    private DirectoryTagService directoryTagService;
    @Mock
    private NotificationService notificationService;
    @Mock
    private TaskCancellationManager cancellationManager;

    private DirectoryTaggingTask directoryTaggingTask;
    private BookLoreUser user;
    private TaskCreateRequest request;

    @BeforeEach
    void setUp() {
        directoryTaggingTask = new DirectoryTaggingTask(
                libraryRepository,
                directoryTagQueueService,
                directoryTagService,
                notificationService,
                cancellationManager
        );

        user = BookLoreUser.builder()
                .permissions(new BookLoreUser.UserPermissions())
                .build();
        request = TaskCreateRequest.builder()
                .taskId("task-123")
                .taskType(TaskType.DIRECTORY_TAGGING)
                .options(DirectoryTagTaskOptions.builder().libraryId(1L).build())
                .build();
    }

    @Test
    void validatePermissions_shouldThrow_whenUserCannotManageLibrariesOrTasks() {
        user.getPermissions().setCanAccessTaskManager(false);
        user.getPermissions().setCanManageLibrary(false);

        assertThrows(APIException.class, () -> directoryTaggingTask.validatePermissions(user, request));
    }

    @Test
    void validatePermissions_shouldPass_whenUserCanManageLibrary() {
        user.getPermissions().setCanManageLibrary(true);

        assertDoesNotThrow(() -> directoryTaggingTask.validatePermissions(user, request));
    }

    @Test
    void execute_shouldProcessQueuedLibraryAndPublishProgress() {
        LibraryEntity library = new LibraryEntity();
        library.setId(1L);
        library.setName("AI");
        library.setTagByDirectory(true);

        doReturn(List.of(new DirectoryTagQueueService.PendingLibraryWork(1L, true, Set.of())))
                .doReturn(List.of())
                .when(directoryTagQueueService).drainPendingWork();
        when(libraryRepository.findByIdIn(List.of(1L))).thenReturn(List.of(library));
        when(cancellationManager.isTaskCancelled("task-123")).thenReturn(false);
        doAnswer(invocation -> {
            Consumer<DirectoryTagService.DirectoryTagProgressSnapshot> progressCallback = invocation.getArgument(2);
            progressCallback.accept(new DirectoryTagService.DirectoryTagProgressSnapshot(1L, "AI", 50, 100, 20, 60_000L));
            return new DirectoryTagService.DirectoryTagRunResult(100, 100, 40, false);
        }).when(directoryTagService).applyMissingDirectoryTags(eq(library), isNull(), any(), any(BooleanSupplier.class));

        TaskCreateResponse response = directoryTaggingTask.execute(request);

        assertEquals(TaskStatus.COMPLETED, response.getStatus());
        assertEquals(TaskType.DIRECTORY_TAGGING, response.getTaskType());
        verify(directoryTagQueueService).enqueueLibrary(1L);
        verify(notificationService, atLeastOnce()).sendMessage(eq(Topic.TASK_PROGRESS), any());
    }

    @Test
    void execute_shouldProcessScopedBooksWhenRequested() {
        LibraryEntity library = new LibraryEntity();
        library.setId(1L);
        library.setName("AI");
        library.setTagByDirectory(true);

        request = TaskCreateRequest.builder()
                .taskId("task-123")
                .taskType(TaskType.DIRECTORY_TAGGING)
                .options(DirectoryTagTaskOptions.builder().libraryId(1L).bookIds(Set.of(7L, 8L)).build())
                .build();

        doReturn(List.of(new DirectoryTagQueueService.PendingLibraryWork(1L, false, Set.of(7L, 8L))))
                .doReturn(List.of())
                .when(directoryTagQueueService).drainPendingWork();
        when(libraryRepository.findByIdIn(List.of(1L))).thenReturn(List.of(library));
        when(cancellationManager.isTaskCancelled("task-123")).thenReturn(false);
        doReturn(new DirectoryTagService.DirectoryTagRunResult(2, 2, 2, false))
                .when(directoryTagService)
                .applyMissingDirectoryTags(eq(library), eq(Set.of(7L, 8L)), any(), any(BooleanSupplier.class));

        TaskCreateResponse response = directoryTaggingTask.execute(request);

        assertEquals(TaskStatus.COMPLETED, response.getStatus());
        verify(directoryTagQueueService).enqueueBooks(1L, Set.of(7L, 8L));
    }

    @Test
    void execute_shouldReturnCancelled_whenTaskIsCancelledBeforeProcessing() {
        when(cancellationManager.isTaskCancelled("task-123")).thenReturn(true);

        TaskCreateResponse response = directoryTaggingTask.execute(request);

        assertEquals(TaskStatus.CANCELLED, response.getStatus());
        verify(directoryTagQueueService, never()).drainPendingWork();
    }
}