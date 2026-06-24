package org.fable.service.ai;

import org.fable.config.AppProperties;
import org.fable.model.dto.settings.AiSearchSettings;
import org.fable.model.dto.settings.AppSettings;
import org.fable.service.appsettings.AppSettingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiSearchServiceSemanticChunkingTest {

    @Mock
    private AppSettingService appSettingService;

    private AiSearchService service;

    @BeforeEach
    void setUp() {
        AppProperties appProperties = new AppProperties();
        service = new AiSearchService(appProperties, null, null, null, null, appSettingService, null, null, null, null, null, null, null);
    }

    // ── computeWordOverlap tests ──────────────────────────────────────────

    @Test
    void computeWordOverlapIdenticalSentencesReturnsOne() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod("computeWordOverlap", String.class, String.class);
        method.setAccessible(true);

        double result = (double) method.invoke(service,
                "The quick brown fox jumps over the lazy dog.",
                "The quick brown fox jumps over the lazy dog.");

        assertThat(result).isEqualTo(1.0);
    }

    @Test
    void computeWordOverlapNoSharedWordsReturnsZero() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod("computeWordOverlap", String.class, String.class);
        method.setAccessible(true);

        double result = (double) method.invoke(service,
                "The cat sat on the mat.",
                "Quantum physics explores subatomic particles.");

        assertThat(result).isEqualTo(0.0);
    }

    @Test
    void computeWordOverlapPartialOverlapReturnsFraction() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod("computeWordOverlap", String.class, String.class);
        method.setAccessible(true);

        double result = (double) method.invoke(service,
                "The cat sat on the mat.",
                "The cat chased the mouse.");

        // Shared: "the", "cat" — but "the" is a stopword, so only "cat" is content
        // cat: content word. sat, mat, chased, mouse: content words
        // intersection: {cat}, union: {cat, sat, mat, chased, mouse} = 1/5 = 0.2
        assertThat(result).isGreaterThan(0.0).isLessThan(1.0);
    }

    @Test
    void computeWordOverlapNullInputReturnsZero() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod("computeWordOverlap", String.class, String.class);
        method.setAccessible(true);

        double result = (double) method.invoke(service, null, "some text");
        assertThat(result).isEqualTo(0.0);

        result = (double) method.invoke(service, "some text", null);
        assertThat(result).isEqualTo(0.0);
    }

    @Test
    void computeWordOverlapBlankInputReturnsZero() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod("computeWordOverlap", String.class, String.class);
        method.setAccessible(true);

        double result = (double) method.invoke(service, "", "some text");
        assertThat(result).isEqualTo(0.0);
    }

    // ── extractContentWords tests ─────��───────────────────────────────────

    @Test
    void extractContentWordsFiltersStopwords() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod("extractContentWords", String.class);
        method.setAccessible(true);

        @SuppressWarnings("unchecked")
        Set<String> words = (Set<String>) method.invoke(service, "The cat and the dog are running");

        // "the", "and", "are" are stopwords; "cat", "dog", "running" are content
        assertThat(words).contains("cat", "dog", "running");
        assertThat(words).doesNotContain("the", "and", "are");
    }

    @Test
    void extractContentWordsFiltersShortTokens() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod("extractContentWords", String.class);
        method.setAccessible(true);

        @SuppressWarnings("unchecked")
        Set<String> words = (Set<String>) method.invoke(service, "a bb cat do");

        // "a", "bb", "do" are < 3 chars; "cat" is >= 3
        assertThat(words).contains("cat");
        assertThat(words).doesNotContain("bb", "do");
    }

    @Test
    void extractContentWordsLowercasesAllTokens() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod("extractContentWords", String.class);
        method.setAccessible(true);

        @SuppressWarnings("unchecked")
        Set<String> words = (Set<String>) method.invoke(service, "CAT Dog Rabbit");

        assertThat(words).contains("cat", "dog", "rabbit");
    }

    @Test
    void extractContentWordsStripsPunctuation() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod("extractContentWords", String.class);
        method.setAccessible(true);

        @SuppressWarnings("unchecked")
        Set<String> words = (Set<String>) method.invoke(service, "Hello, world! How's it going?");

        assertThat(words).contains("hello", "world", "how", "going");
        // "it" is < 3 chars, so excluded
        assertThat(words).doesNotContain("it");
    }

    // ── splitSentences tests ──────────────────────────────────────────────

    @Test
    void splitSentencesSplitsOnPeriods() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod("splitSentences", String.class);
        method.setAccessible(true);

        @SuppressWarnings("unchecked")
        List<String> sentences = (List<String>) method.invoke(service,
                "First sentence. Second sentence. Third sentence.");

        assertThat(sentences).hasSize(3);
        assertThat(sentences.get(0)).contains("First sentence");
        assertThat(sentences.get(1)).contains("Second sentence");
        assertThat(sentences.get(2)).contains("Third sentence");
    }

    @Test
    void splitSentencesHandlesEmptyInput() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod("splitSentences", String.class);
        method.setAccessible(true);

        @SuppressWarnings("unchecked")
        List<String> sentences = (List<String>) method.invoke(service, "");

        assertThat(sentences).isEmpty();
    }

    @Test
    void splitSentencesHandlesNullInput() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod("splitSentences", String.class);
        method.setAccessible(true);

        @SuppressWarnings("unchecked")
        List<String> sentences = (List<String>) method.invoke(service, (String) null);

        assertThat(sentences).isEmpty();
    }

    // ── chunkTextSemantic tests ─────────────────────────────���─────────────

    @Test
    void semanticChunkingSingleParagraphReturnsOneChunk() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod(
                "chunkTextSemantic", String.class, int.class, int.class, double.class);
        method.setAccessible(true);

        // All sentences share "cat" and "sat" as content words, giving Jaccard > 0.3
        @SuppressWarnings("unchecked")
        List<String> chunks = (List<String>) method.invoke(service,
                "The cat sat on the mat. The cat sat near the door. The cat sat by the window.",
                1500, 100, 0.3);

        assertThat(chunks).hasSize(1);
        assertThat(chunks.get(0)).contains("cat");
        assertThat(chunks.get(0)).contains("door");
        assertThat(chunks.get(0)).contains("window");
    }

    @Test
    void semanticChunkingTopicShiftCreatesNewChunk() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod(
                "chunkTextSemantic", String.class, int.class, int.class, double.class);
        method.setAccessible(true);

        // Two paragraphs with zero word overlap between them, threshold 0.1 guarantees split
        String text = "The cat sat on the mat. The cat sat near the door.\n\n" +
                "Quantum physics explores particles. Quantum mechanics studies atoms.";

        @SuppressWarnings("unchecked")
        List<String> chunks = (List<String>) method.invoke(service, text, 1500, 100, 0.1);

        // Should split at paragraph boundary since word overlap is zero
        assertThat(chunks).hasSize(2);
        assertThat(chunks.get(0)).contains("cat");
        assertThat(chunks.get(1).toLowerCase()).contains("quantum");
    }

    @Test
    void semanticChunkingRespectsHardMaxSize() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod(
                "chunkTextSemantic", String.class, int.class, int.class, double.class);
        method.setAccessible(true);

        // Build a long paragraph that exceeds the hard max
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 50; i++) {
            sb.append("This is sentence number ").append(i)
              .append(" with enough words to make it fairly long for testing purposes. ");
        }
        String text = sb.toString();

        @SuppressWarnings("unchecked")
        List<String> chunks = (List<String>) method.invoke(service, text, 500, 50, 0.1);

        // With a small chunk size, should produce multiple chunks
        assertThat(chunks).hasSizeGreaterThan(1);
        // Each chunk should be <= 500 chars (approximately)
        for (String chunk : chunks) {
            assertThat(chunk.length()).isLessThanOrEqualTo(600); // allow some slack for sentence boundaries
        }
    }

    @Test
    void semanticChunkingOverlapCarriesLastSentence() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod(
                "chunkTextSemantic", String.class, int.class, int.class, double.class);
        method.setAccessible(true);

        // First paragraph: sentences share "cat" and "sat" content words, stays as one chunk
        // Second paragraph: sentences share "quantum", stays as one chunk
        // Between paragraphs: zero overlap, triggers split at threshold 0.1
        // The overlap should carry the last sentence into the second chunk
        String text = "The cat sat on the mat. The cat sat near the door.\n\n" +
                "Quantum physics explores particles. Quantum mechanics studies atoms.";

        @SuppressWarnings("unchecked")
        List<String> chunks = (List<String>) method.invoke(service, text, 1500, 200, 0.1);

        // Paragraph boundary should trigger a split (cat/sat vs quantum = zero overlap)
        assertThat(chunks).hasSize(2);
        // The second chunk should carry over the last sentence from the first chunk as overlap
        assertThat(chunks.get(1)).contains("door");
    }

    @Test
    void semanticChunkingEmptyTextReturnsEmptyList() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod(
                "chunkTextSemantic", String.class, int.class, int.class, double.class);
        method.setAccessible(true);

        @SuppressWarnings("unchecked")
        List<String> chunks = (List<String>) method.invoke(service, "", 1500, 100, 0.3);

        assertThat(chunks).isEmpty();
    }

    @Test
    void semanticChunkingNullTextReturnsEmptyList() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod(
                "chunkTextSemantic", String.class, int.class, int.class, double.class);
        method.setAccessible(true);

        @SuppressWarnings("unchecked")
        List<String> chunks = (List<String>) method.invoke(service, (String) null, 1500, 100, 0.3);

        assertThat(chunks).isEmpty();
    }

    @Test
    void semanticChunkingHighThresholdKeepsMoreTogether() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod(
                "chunkTextSemantic", String.class, int.class, int.class, double.class);
        method.setAccessible(true);

        // Two paragraphs with somewhat different topics
        String text = "The garden has many flowers. Roses bloom in spring.\n\n" +
                "The garden also has vegetables. Tomatoes grow in summer.";

        @SuppressWarnings("unchecked")
        List<String> chunksLow = (List<String>) method.invoke(service, text, 1500, 100, 0.1);
        @SuppressWarnings("unchecked")
        List<String> chunksHigh = (List<String>) method.invoke(service, text, 1500, 100, 0.9);

        // High threshold (0.9) should keep more together than low threshold (0.1)
        // With "garden" shared, high threshold may keep as one chunk
        assertThat(chunksHigh.size()).isLessThanOrEqualTo(chunksLow.size());
    }

    @Test
    void semanticChunkingSafetyValveFallsBackToFixed() throws Exception {
        // This tests the safety valve: if semantic chunking somehow produces zero chunks,
        // it should fall back to fixed-size chunking.
        // We can trigger this by passing text that results in all-empty paragraphs after cleaning.
        Method method = AiSearchService.class.getDeclaredMethod(
                "chunkTextSemantic", String.class, int.class, int.class, double.class);
        method.setAccessible(true);

        // Text with only whitespace paragraphs
        String text = "\n\n\n\n";

        @SuppressWarnings("unchecked")
        List<String> chunks = (List<String>) method.invoke(service, text, 1500, 100, 0.3);

        // Safety valve: should fall back to fixed-size chunking which returns empty for whitespace-only
        assertThat(chunks).isEmpty();
    }

    @Test
    void semanticChunkingPreservesAllContent() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod(
                "chunkTextSemantic", String.class, int.class, int.class, double.class);
        method.setAccessible(true);

        String text = "Alice went to the store. She bought some apples.\n\n" +
                "Bob went to the library. He borrowed a book about history.";

        @SuppressWarnings("unchecked")
        List<String> chunks = (List<String>) method.invoke(service, text, 1500, 100, 0.3);

        // All content should be preserved across chunks
        String combined = String.join(" ", chunks);
        assertThat(combined).contains("Alice");
        assertThat(combined).contains("apples");
        assertThat(combined).contains("Bob");
        assertThat(combined).contains("library");
        assertThat(combined).contains("history");
    }

    // ── chunkTextFixed tests (regression) ─────────────────────────────────

    @Test
    void fixedChunkingProducesNonEmptyChunks() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod(
                "chunkTextFixed", String.class, int.class, int.class);
        method.setAccessible(true);

        @SuppressWarnings("unchecked")
        List<String> chunks = (List<String>) method.invoke(service,
                "This is a test sentence. Here is another one. And a third for good measure.",
                100, 20);

        assertThat(chunks).isNotEmpty();
        for (String chunk : chunks) {
            assertThat(chunk).isNotBlank();
        }
    }

    @Test
    void fixedChunkingEmptyTextReturnsEmptyList() throws Exception {
        Method method = AiSearchService.class.getDeclaredMethod(
                "chunkTextFixed", String.class, int.class, int.class);
        method.setAccessible(true);

        @SuppressWarnings("unchecked")
        List<String> chunks = (List<String>) method.invoke(service, "", 1500, 100);

        assertThat(chunks).isEmpty();
    }
}
