package org.fable.model.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.fable.model.enums.MetadataFetchTaskStatus;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MetadataResumableTaskResponse {
    private String taskId;
    private MetadataFetchTaskStatus status;
    private Instant startedAt;
    private int pendingBooksCount;
    private String message;
}