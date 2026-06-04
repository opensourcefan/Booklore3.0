package org.booklore.model.dto.settings;

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
public class AiSearchSettings {
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private int topK = 5;
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private double similarityThreshold = 0.3;
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private int maxTokens = 768;
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private double temperature = 0.1;
}
