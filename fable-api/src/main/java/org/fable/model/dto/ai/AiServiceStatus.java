package org.fable.model.dto.ai;

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
    private Boolean modelExists;
    private String modelPath;
    private String embeddingModel;
    private Boolean llmWarmed;
}
