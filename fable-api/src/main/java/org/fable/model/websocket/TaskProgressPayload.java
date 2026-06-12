package org.fable.model.websocket;

import org.fable.task.TaskStatus;
import org.fable.model.enums.TaskType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TaskProgressPayload {
    private String taskId;
    private TaskType taskType;
    private String message;
    private int progress; // 0-100 percentage
    private Integer currentStep;
    private Integer totalSteps;
    private TaskStatus taskStatus;
}

