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
public class AiLlmProfile {
    private String name;
    private String description;

    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String llmProvider = "local"; // local, openai
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String llmApiKey = "";
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String externalLlmUrl = "";
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String llmModel = "smollm2:360m";

    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private int maxTokens = 768;
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private double temperature = 0.1;

    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private boolean hydeEnabled = false;
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private boolean multiQueryEnabled = false;
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private boolean decompositionEnabled = false;
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private boolean reflectionEnabled = false;
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private boolean compressionEnabled = false;
}
