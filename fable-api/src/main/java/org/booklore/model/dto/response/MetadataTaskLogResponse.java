package org.booklore.model.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.booklore.model.enums.MetadataFetchTaskStatus;

import java.time.Instant;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MetadataTaskLogResponse {

    private String taskId;
    private MetadataFetchTaskStatus status;
    private String message;
    private Instant startedAt;
    private Instant completedAt;
    private Integer completed;
    private Integer total;
    private Integer pending;
    private List<MetadataTaskLogBookResponse> fetchedBooks;
    private List<MetadataTaskLogBookResponse> remainingBooks;
}