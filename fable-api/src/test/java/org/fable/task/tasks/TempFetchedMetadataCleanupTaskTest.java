package org.fable.task.tasks;

import org.fable.exception.APIException;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.request.TaskCreateRequest;
import org.fable.model.dto.response.TaskCreateResponse;
import org.fable.model.enums.TaskType;
import org.fable.repository.MetadataFetchJobRepository;
import org.fable.task.TaskStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TempFetchedMetadataCleanupTaskTest {

    @Mock
    private MetadataFetchJobRepository metadataFetchJobRepository;

    @InjectMocks
    private TempFetchedMetadataCleanupTask tempFetchedMetadataCleanupTask;

    private FableUser user;
    private TaskCreateRequest request;

    @BeforeEach
    void setUp() {
        user = FableUser.builder()
                .permissions(new FableUser.UserPermissions())
                .build();
        request = new TaskCreateRequest();
    }

    @Test
    void validatePermissions_shouldThrowException_whenUserCannotAccessTaskManager() {
        user.getPermissions().setCanAccessTaskManager(false);
        assertThrows(APIException.class, () -> tempFetchedMetadataCleanupTask.validatePermissions(user, request));
    }

    @Test
    void validatePermissions_shouldPass_whenUserCanAccessTaskManager() {
        user.getPermissions().setCanAccessTaskManager(true);
        assertDoesNotThrow(() -> tempFetchedMetadataCleanupTask.validatePermissions(user, request));
    }

    @Test
    void execute_shouldDeleteOldRecords_whenTriggeredByCron() {
        request.setTriggeredByCron(true);
        when(metadataFetchJobRepository.deleteAllByCompletedAtBefore(any(Instant.class))).thenReturn(5);

        TaskCreateResponse response = tempFetchedMetadataCleanupTask.execute(request);

        assertEquals(TaskType.CLEANUP_TEMP_METADATA, response.getTaskType());
        assertEquals(TaskStatus.COMPLETED, response.getStatus());
        verify(metadataFetchJobRepository).deleteAllByCompletedAtBefore(any(Instant.class));
        verify(metadataFetchJobRepository, never()).deleteAllRecords();
    }

    @Test
    void execute_shouldDeleteAllRecords_whenNotTriggeredByCron() {
        request.setTriggeredByCron(false);
        when(metadataFetchJobRepository.deleteAllRecords()).thenReturn(10);

        TaskCreateResponse response = tempFetchedMetadataCleanupTask.execute(request);

        assertEquals(TaskStatus.COMPLETED, response.getStatus());
        verify(metadataFetchJobRepository).deleteAllRecords();
        verify(metadataFetchJobRepository, never()).deleteAllByCompletedAtBefore(any());
    }

    @Test
    void execute_shouldReturnFailed_whenRepositoryThrowsException() {
        request.setTriggeredByCron(false);
        when(metadataFetchJobRepository.deleteAllRecords()).thenThrow(new RuntimeException("DB Error"));

        TaskCreateResponse response = tempFetchedMetadataCleanupTask.execute(request);

        assertEquals(TaskStatus.FAILED, response.getStatus());
    }
}
