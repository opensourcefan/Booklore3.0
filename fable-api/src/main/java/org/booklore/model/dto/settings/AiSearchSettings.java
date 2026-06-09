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

    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private java.util.List<Long> autoEmbedLibraryIds = new java.util.ArrayList<>();

    // Added for Zero-Config Architecture
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String embeddingProvider = "local"; // local, ollama, openai
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String embeddingApiKey = "";
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String externalEmbeddingUrl = "";
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String embeddingModel = "BAAI/bge-base-en-v1.5";

    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String llmProvider = "local"; // local, ollama, openai
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String llmApiKey = "";
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String externalLlmUrl = "";
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String llmModel = "smollm2:360m";

    // Legacy fields mapped during deserialization for backward compatibility
    @JsonSetter("provider")
    public void setLegacyProvider(String provider) {
        if (provider != null) {
            this.embeddingProvider = provider;
            this.llmProvider = provider;
        }
    }

    @JsonSetter("apiKey")
    public void setLegacyApiKey(String apiKey) {
        if (apiKey != null) {
            this.embeddingApiKey = apiKey;
            this.llmApiKey = apiKey;
        }
    }
}
