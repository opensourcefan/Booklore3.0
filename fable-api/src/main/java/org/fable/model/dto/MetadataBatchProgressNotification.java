package org.fable.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MetadataBatchProgressNotification {
    private String taskId;
    private int completed;
    private int total;
    private String message;
    private String status;
    private boolean isReview;
    private boolean resumable;
    private Integer pendingCount;

    public MetadataBatchProgressNotification(String taskId, int completed, int total, String message, String status, boolean isReview) {
        this(taskId, completed, total, message, status, isReview, false, null);
    }
}
