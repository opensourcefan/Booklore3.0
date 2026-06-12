package org.fable.model.dto.ai;

import lombok.Data;

import java.util.List;

@Data
public class AiBulkScanRequest {
    private List<Long> libraryPathIds;
}