package org.booklore.model.dto.ai;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class AiPanelFlowStatsResponse {
    long scannedComicCount;
    long totalPagesScanned;
    long totalPanelsMapped;
    long storedBytes;
    AiPanelFlowBookHighlightResponse comicWithMostPagesScanned;
    AiPanelFlowBookHighlightResponse comicWithMostPanelsMapped;
    AiPanelFlowBookHighlightResponse comicWithHighestPanelsPerPage;
}