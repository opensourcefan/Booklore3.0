package org.fable.model.dto.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StoryArcLayoutUpdateRequest {
    private String storyArcName;
    private List<LayoutItem> items;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class LayoutItem {
        private Long bookId;
        private int rowIndex;
        private int colIndex;
        private double sequenceOrder;
        private boolean isCore;
        private String rowTitle;
    }
}
