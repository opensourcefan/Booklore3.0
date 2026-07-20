package org.fable.model.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

/**
 * Exclusive Staging triage buckets for the Staging browser header tabs.
 * Review wins over Completed/Staging when a FETCHED proposal exists.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StagingTriageResponse {
    private int stagingCount;
    private int completedCount;
    private int reviewCount;

    @Builder.Default
    private List<Long> stagingBookIds = new ArrayList<>();
    @Builder.Default
    private List<Long> completedBookIds = new ArrayList<>();
    @Builder.Default
    private List<Long> reviewBookIds = new ArrayList<>();
    @Builder.Default
    private List<PendingMetadataReviewResponse.PendingReviewTask> reviewTasks = new ArrayList<>();
}
