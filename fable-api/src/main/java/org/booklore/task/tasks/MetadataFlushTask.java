package org.booklore.task.tasks;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.booklore.exception.ApiError;
import org.booklore.model.dto.BookLoreUser;
import org.booklore.model.dto.request.TaskCreateRequest;
import org.booklore.model.dto.response.TaskCreateResponse;
import org.booklore.model.enums.TaskType;
import org.booklore.model.enums.UserPermission;
import org.booklore.service.metadata.MetadataFlushService;
import org.booklore.task.TaskStatus;
import org.booklore.task.options.MetadataFlushOptions;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class MetadataFlushTask implements Task {

    private final MetadataFlushService metadataFlushService;

    @Override
    public void validatePermissions(BookLoreUser user, TaskCreateRequest request) {
        if (!UserPermission.CAN_ACCESS_TASK_MANAGER.isGranted(user.getPermissions())) {
            throw ApiError.PERMISSION_DENIED.createException(UserPermission.CAN_ACCESS_TASK_MANAGER);
        }
    }

    @Override
    public TaskCreateResponse execute(TaskCreateRequest request) {
        MetadataFlushOptions options = request.getOptionsAs(MetadataFlushOptions.class);
        String taskId = request.getTaskId();

        Long libraryId = options != null ? options.getLibraryId() : null;

        long startTime = System.currentTimeMillis();
        log.info("{}: Task started. TaskId: {}, libraryId: {}", getTaskType(), taskId, libraryId);

        metadataFlushService.flushMetadataToFiles(libraryId, taskId);

        long endTime = System.currentTimeMillis();
        log.info("{}: Task completed. Duration: {} ms", getTaskType(), endTime - startTime);

        return TaskCreateResponse.builder()
                .taskId(taskId)
                .taskType(TaskType.FLUSH_METADATA_TO_FILES)
                .status(TaskStatus.COMPLETED)
                .build();
    }

    @Override
    public TaskType getTaskType() {
        return TaskType.FLUSH_METADATA_TO_FILES;
    }
}
