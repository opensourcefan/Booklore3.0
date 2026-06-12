package org.fable.task.tasks;

import org.fable.model.dto.FableUser;
import org.fable.model.dto.request.TaskCreateRequest;
import org.fable.model.dto.response.TaskCreateResponse;
import org.fable.model.enums.TaskType;

public interface Task {

    TaskCreateResponse execute(TaskCreateRequest request);

    TaskType getTaskType();

    default String getMetadata() {
        return null;
    }

    void validatePermissions(FableUser user, TaskCreateRequest request);
}
