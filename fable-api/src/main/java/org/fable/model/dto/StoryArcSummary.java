package org.fable.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StoryArcSummary {
    private String storyArcName;
    private int bookCount;
    private int readBookCount;
    private int completionPercent;
    private Long coverBookId;
}
