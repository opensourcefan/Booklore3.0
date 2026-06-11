package org.booklore.task.tasks;

import org.booklore.exception.ApiError;
import org.booklore.model.dto.BookLoreUser;
import org.booklore.model.dto.request.TaskCreateRequest;
import org.booklore.model.dto.response.TaskCreateResponse;
import org.booklore.model.enums.TaskType;
import org.booklore.model.enums.UserPermission;
import org.booklore.service.ai.AiSearchService;
import org.booklore.task.TaskStatus;
import org.booklore.config.security.service.AuthenticationService;
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

    @Override
    public void validatePermissions(BookLoreUser user, TaskCreateRequest request) {
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
            BookLoreUser user = authenticationService.getAuthenticatedUser();
            Long userId = (user != null) ? user.getId() : -1L;
            String username = (user != null) ? user.getUsername() : "System";
            aiSearchService.startScanMarkedAiSearchEmbeddings(userId, username, false);
            builder.status(TaskStatus.COMPLETED);
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
