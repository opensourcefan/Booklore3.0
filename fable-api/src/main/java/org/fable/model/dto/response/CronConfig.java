package org.fable.model.dto.response;

import org.fable.model.enums.TaskType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CronConfig {
    private Long id;
    private TaskType taskType;
    private String cronExpression;
    private Boolean enabled;
    private Boolean notificationsEnabled;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}

