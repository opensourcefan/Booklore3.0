package org.fable.model.dto.ai;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiBulkScanResponse {
    private boolean started;
    private int totalEligibleBooks;
    private int missingBooks;
    private int alreadyScannedBooks;
    private String message;
}