package org.fable.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.fable.model.enums.*;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CbxViewerPreferences {
    private Long bookId;
    private CbxPageSpread pageSpread;
    private CbxPageViewMode pageViewMode;
    private CbxPageFitMode fitMode;
    private CbxPageScrollMode scrollMode;
    private CbxBackgroundColor backgroundColor;
}