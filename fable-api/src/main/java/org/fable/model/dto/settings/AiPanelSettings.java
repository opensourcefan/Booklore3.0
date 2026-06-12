package org.fable.model.dto.settings;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.Nulls;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Builder
@Data
@AllArgsConstructor
@NoArgsConstructor
public class AiPanelSettings {
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private double confidenceThreshold = 0.20;
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private double iouThreshold = 0.50;
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String modelId = "jamesflare/yolov8n-comic-panel-segmentation";
}
