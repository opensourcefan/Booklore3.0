package org.fable.model.dto;

import org.fable.model.enums.BookFileType;

import java.time.LocalDateTime;

public interface ReadingSessionTimelineDto {
    Long getBookId();

    String getBookTitle();

    BookFileType getBookFileType();

    LocalDateTime getStartDate();

    LocalDateTime getEndDate();

    Long getTotalSessions();

    Long getTotalDurationSeconds();
}
