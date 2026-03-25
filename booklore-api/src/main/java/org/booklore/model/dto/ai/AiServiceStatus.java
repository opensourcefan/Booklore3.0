package org.booklore.model.dto.ai;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiServiceStatus {
    private boolean enabled;
    private boolean serviceReachable;
    private String status;
    private String message;
    private String error;
    private String baseUrl;
}
