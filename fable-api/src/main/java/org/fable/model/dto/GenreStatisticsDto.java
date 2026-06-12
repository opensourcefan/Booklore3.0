package org.fable.model.dto;

public interface GenreStatisticsDto {
    String getGenre();
    Long getBookCount();
    Long getTotalSessions();
    Long getTotalDurationSeconds();
}

