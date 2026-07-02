package org.fable.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StoryArcBookMappingDto {
    private Long id;
    private String storyArcName;
    private Long bookId;
    private int rowIndex;
    private int colIndex;
    private double sequenceOrder;
    private boolean isCore;
    private String rowTitle;
    private String externalUrl;
    private String description;
    private Book book;
}
