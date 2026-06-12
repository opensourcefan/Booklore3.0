package org.fable.model.dto.ai;

import lombok.Builder;
import lombok.Value;

@Value
@Builder
public class AiPanelFlowBookHighlightResponse {
    long bookId;
    String title;
    long pageCount;
    long panelCount;
    double panelsPerPage;
}