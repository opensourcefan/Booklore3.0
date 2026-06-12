package org.fable.task.tasks;

import org.fable.exception.ApiError;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.Library;
import org.fable.model.dto.request.TaskCreateRequest;
import org.fable.model.dto.response.TaskCreateResponse;
import org.fable.model.enums.TaskType;
import org.fable.model.enums.UserPermission;
import org.fable.service.library.LibraryService;
import org.fable.task.TaskStatus;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class LibraryScanTask implements Task {

    private final LibraryService libraryService;

    @Override
    public void validatePermissions(FableUser user, TaskCreateRequest request) {
        if (!UserPermission.CAN_ACCESS_TASK_MANAGER.isGranted(user.getPermissions())) {
            throw ApiError.PERMISSION_DENIED.createException(UserPermission.CAN_ACCESS_TASK_MANAGER);
        }
    }

    @Override
    public TaskCreateResponse execute(TaskCreateRequest request) {
        TaskCreateResponse.TaskCreateResponseBuilder builder = TaskCreateResponse.builder()
                .taskId(UUID.randomUUID().toString())
                .taskType(getTaskType());

        long startTime = System.currentTimeMillis();
        log.info("{}: Task started", getTaskType());

        try {
            for (Library library : libraryService.getAllLibraries()) {
                try {
                    libraryService.scanLibraryForNewFiles(library.getId());
                    log.info("{}: Scanned library '{}' for new files", getTaskType(), library.getName());
                } catch (Exception e) {
                    log.error("{}: Failed to scan library '{}' for new files: {}", getTaskType(), library.getName(), e.getMessage(), e);
                }
            }

            builder.status(TaskStatus.COMPLETED);
        } catch (Exception e) {
            log.error("{}: Error scanning libraries", getTaskType(), e);
            builder.status(TaskStatus.FAILED);
        }

        long endTime = System.currentTimeMillis();
        log.info("{}: Task completed. Duration: {} ms", getTaskType(), endTime - startTime);

        return builder.build();
    }

    @Override
    public TaskType getTaskType() {
        return TaskType.SYNC_LIBRARY_FILES;
    }
}