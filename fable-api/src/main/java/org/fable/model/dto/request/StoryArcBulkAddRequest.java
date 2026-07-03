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
public class StoryArcBulkAddRequest {
    private String storyArcName;
    private List<Long> bookIds;
    /** Optional: target row index for chapter placement. If null, appends to last row. */
    private Integer targetRowIndex;
    /** Optional: row title when creating a new chapter via targetRowIndex. */
    private String rowTitle;
    /** Optional: if true, group books by their series metadata into separate chapters. */
    private boolean groupBySeries;
}
