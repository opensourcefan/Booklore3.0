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

    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private int chunkSize = 1500;
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private int chunkOverlap = 100;
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private int matryoshkaDimensions = 0;
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private boolean hybridSearchEnabled = false;
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private int rrfK = 60;
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private boolean rerankingEnabled = false;
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String rerankerModel = "BAAI/bge-reranker-base";

    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private boolean ocrEnabled = true;
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private boolean ocrFallbackOnly = true;
    @Builder.Default @JsonSetter(nulls = Nulls.SKIP)
    private String ocrLanguage = "eng";

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

    public int getTopK() {
        return topK <= 0 ? 5 : topK;
    }

    public double getSimilarityThreshold() {
        return similarityThreshold <= 0.0 ? 0.3 : similarityThreshold;
    }

    public int getMaxTokens() {
        return maxTokens <= 0 ? 768 : maxTokens;
    }

    public double getTemperature() {
        return temperature < 0.0 || temperature > 1.0 ? 0.1 : temperature;
    }

    public int getChunkSize() {
        return chunkSize <= 0 ? 1500 : chunkSize;
    }

    public int getChunkOverlap() {
        return chunkOverlap < 0 ? 100 : chunkOverlap;
    }

    public int getRrfK() {
        return rrfK <= 0 ? 60 : rrfK;
    }

    public String getRerankerModel() {
        return rerankerModel == null || rerankerModel.isBlank() ? "BAAI/bge-reranker-base" : rerankerModel;
    }

    public String getEmbeddingProvider() {
        return embeddingProvider == null || embeddingProvider.isBlank() ? "local" : embeddingProvider;
    }

    public String getLlmProvider() {
        return llmProvider == null || llmProvider.isBlank() ? "local" : llmProvider;
    }

    public String getEmbeddingModel() {
        return embeddingModel == null || embeddingModel.isBlank() ? "BAAI/bge-base-en-v1.5" : embeddingModel;
    }

    public String getLlmModel() {
        return llmModel == null || llmModel.isBlank() ? "smollm2:360m" : llmModel;
    }

    public String getOcrLanguage() {
        return ocrLanguage == null || ocrLanguage.isBlank() ? "eng" : ocrLanguage;
    }
}
