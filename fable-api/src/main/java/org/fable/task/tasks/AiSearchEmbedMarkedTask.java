package org.fable.task.tasks;

import org.fable.exception.ApiError;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.request.TaskCreateRequest;
import org.fable.model.dto.response.TaskCreateResponse;
import org.fable.model.enums.TaskType;
import org.fable.model.enums.UserPermission;
import org.fable.service.ai.AiSearchService;
import org.fable.task.TaskCancellationManager;
import org.fable.task.TaskStatus;
import org.fable.config.security.service.AuthenticationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class AiSearchEmbedMarkedTask implements Task {

    private final AiSearchService aiSearchService;
    private final AuthenticationService authenticationService;
    private final TaskCancellationManager cancellationManager;

    @Override
    public void validatePermissions(FableUser user, TaskCreateRequest request) {
        if (!UserPermission.CAN_ACCESS_TASK_MANAGER.isGranted(user.getPermissions())) {
            throw ApiError.PERMISSION_DENIED.createException(UserPermission.CAN_ACCESS_TASK_MANAGER);
        }
    }

    @Override
    public TaskCreateResponse execute(TaskCreateRequest request) {
        String taskId = request.getTaskId() != null ? request.getTaskId() : UUID.randomUUID().toString();
        TaskCreateResponse.TaskCreateResponseBuilder builder = TaskCreateResponse.builder()
                .taskId(taskId)
                .taskType(getTaskType());

        long startTime = System.currentTimeMillis();
        log.info("{}: Task started", getTaskType());

        try {
            FableUser user = authenticationService.getAuthenticatedUser();
            Long userId = (user != null) ? user.getId() : -1L;
            String username = (user != null) ? user.getUsername() : "System";
            aiSearchService.scanMarkedAiSearchEmbeddings(userId, username, false, taskId);
            if (cancellationManager.isTaskCancelled(taskId)) {
                builder.status(TaskStatus.CANCELLED);
            } else {
                builder.status(TaskStatus.COMPLETED);
            }
        } catch (Exception e) {
            log.error("{}: Error embedding marked AI Search books", getTaskType(), e);
            builder.status(TaskStatus.FAILED);
        }

        long endTime = System.currentTimeMillis();
        log.info("{}: Task completed. Duration: {} ms", getTaskType(), endTime - startTime);

        return builder.build();
    }

    @Override
    public TaskType getTaskType() {
        return TaskType.AI_SEARCH_EMBED_MARKED;
    }
}
