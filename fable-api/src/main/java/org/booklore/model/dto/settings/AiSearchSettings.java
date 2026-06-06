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

    // Added for Zero-Config Architecture
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String provider = "local"; // local, ollama, openai
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String apiKey = "";
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String externalLlmUrl = "";
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String externalEmbeddingUrl = "";
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String embeddingModel = "all-MiniLM-L6-v2";
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String llmModel = "llama3.2";
}
