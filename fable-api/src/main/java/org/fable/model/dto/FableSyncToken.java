package org.fable.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder(toBuilder = true)
@NoArgsConstructor
@AllArgsConstructor
public class FableSyncToken {
    private String ongoingSyncPointId;
    private String lastSuccessfulSyncPointId;
    private String rawKoboSyncToken;
}
