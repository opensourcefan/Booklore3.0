package org.fable.model.dto.ai;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class AiPanelFlowDirectoryScanStatus {
    long libraryPathId;
    long scannedComicCount;
}
