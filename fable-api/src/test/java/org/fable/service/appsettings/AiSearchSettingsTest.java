package org.fable.service.appsettings;

import org.fable.model.dto.settings.AiSearchSettings;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AiSearchSettingsTest {

    @Test
    void testGettersFallbackToDefaultsWhenZeroOrEmpty() {
        AiSearchSettings settings = AiSearchSettings.builder()
                .topK(0)
                .similarityThreshold(0.0)
                .maxTokens(0)
                .temperature(-0.5)
                .chunkSize(0)
                .chunkOverlap(-10)
                .rrfK(0)
                .rerankerModel("")
                .embeddingProvider("")
                .llmProvider("")
                .embeddingModel("   ")
                .llmModel(null)
                .ocrLanguage(null)
                .build();

        assertThat(settings.getTopK()).isEqualTo(5);
        assertThat(settings.getDisplayTopK()).isEqualTo(5);
        assertThat(settings.getSimilarityThreshold()).isEqualTo(0.3);
        assertThat(settings.getMaxTokens()).isEqualTo(768);
        assertThat(settings.getTemperature()).isEqualTo(0.1);
        assertThat(settings.getChunkSize()).isEqualTo(1500);
        assertThat(settings.getChunkOverlap()).isEqualTo(100);
        assertThat(settings.getRrfK()).isEqualTo(60);
        assertThat(settings.getRerankerModel()).isEqualTo("BAAI/bge-reranker-base");
        assertThat(settings.getEmbeddingProvider()).isEqualTo("local");
        assertThat(settings.getLlmProvider()).isEqualTo("local");
        assertThat(settings.getEmbeddingModel()).isEqualTo("BAAI/bge-base-en-v1.5");
        assertThat(settings.getLlmModel()).isEqualTo("smollm2:360m");
        assertThat(settings.getOcrLanguage()).isEqualTo("eng");
    }

    @Test
    void testGettersPreserveValidValues() {
        AiSearchSettings settings = AiSearchSettings.builder()
                .topK(10)
                .displayTopK(3)
                .similarityThreshold(0.75)
                .maxTokens(1024)
                .temperature(0.5)
                .chunkSize(2000)
                .chunkOverlap(200)
                .rrfK(80)
                .rerankerModel("custom-reranker")
                .embeddingProvider("openai")
                .llmProvider("ollama")
                .embeddingModel("custom-embedding-model")
                .llmModel("custom-llm-model")
                .ocrLanguage("swe")
                .build();

        assertThat(settings.getTopK()).isEqualTo(10);
        assertThat(settings.getDisplayTopK()).isEqualTo(3);
        assertThat(settings.getSimilarityThreshold()).isEqualTo(0.75);
        assertThat(settings.getMaxTokens()).isEqualTo(1024);
        assertThat(settings.getTemperature()).isEqualTo(0.5);
        assertThat(settings.getChunkSize()).isEqualTo(2000);
        assertThat(settings.getChunkOverlap()).isEqualTo(200);
        assertThat(settings.getRrfK()).isEqualTo(80);
        assertThat(settings.getRerankerModel()).isEqualTo("custom-reranker");
        assertThat(settings.getEmbeddingProvider()).isEqualTo("openai");
        assertThat(settings.getLlmProvider()).isEqualTo("ollama");
        assertThat(settings.getEmbeddingModel()).isEqualTo("custom-embedding-model");
        assertThat(settings.getLlmModel()).isEqualTo("custom-llm-model");
        assertThat(settings.getOcrLanguage()).isEqualTo("swe");
    }
}
