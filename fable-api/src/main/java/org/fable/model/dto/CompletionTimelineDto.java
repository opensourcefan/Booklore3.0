package org.fable.model.dto;

import org.fable.model.enums.ReadStatus;

public interface CompletionTimelineDto {
    Integer getYear();
    Integer getMonth();
    ReadStatus getReadStatus();
    Long getBookCount();
}

