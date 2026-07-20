package org.fable.model.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PendingMetadataReviewResponse {
    private int count;
    @Builder.Default
    private List<Long> bookIds = new ArrayList<>();
    @Builder.Default
    private List<PendingReviewTask> tasks = new ArrayList<>();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PendingReviewTask {
        private String taskId;
        private int proposalCount;
        @Builder.Default
        private List<Long> bookIds = new ArrayList<>();
    }
}
