package org.fable.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StoryArcMetadataDto {
    private String externalUrl;
    private String scrapedTitle;
    private String scrapedDescription;
}
