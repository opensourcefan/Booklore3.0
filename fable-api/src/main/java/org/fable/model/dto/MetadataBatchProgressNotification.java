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
    /** ISBN discovery step (purple in the progress widget). */
    public static final String PHASE_ISBN_DISCOVERY = "ISBN_DISCOVERY";
    /** Provider metadata fetch after ISBN resolved (green). */
    public static final String PHASE_METADATA_FETCH = "METADATA_FETCH";
    /** Per-book ISBN discovery failure (brief red flash). */
    public static final String PHASE_ISBN_FAILED = "ISBN_FAILED";

    private String taskId;
    private int completed;
    private int total;
    private String message;
    private String status;
    private boolean isReview;
    private boolean resumable;
    private Integer pendingCount;
    /** Optional ISBN two-stage phase; null for normal metadata refresh. */
    private String phase;

    public MetadataBatchProgressNotification(String taskId, int completed, int total, String message, String status, boolean isReview) {
        this(taskId, completed, total, message, status, isReview, false, null, null);
    }

    public MetadataBatchProgressNotification(String taskId, int completed, int total, String message, String status,
                                             boolean isReview, boolean resumable, Integer pendingCount) {
        this(taskId, completed, total, message, status, isReview, resumable, pendingCount, null);
    }
}
