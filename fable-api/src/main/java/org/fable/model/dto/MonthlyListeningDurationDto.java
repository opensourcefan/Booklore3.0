package org.fable.model.dto;

public interface MonthlyListeningDurationDto {
    Integer getYear();
    Integer getMonth();
    Long getTotalDurationSeconds();
}
