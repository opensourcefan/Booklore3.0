package org.fable.model.dto;

public interface WeeklyListeningTrendDto {
    Integer getYear();
    Integer getWeek();
    Long getTotalDurationSeconds();
    Long getSessions();
}
