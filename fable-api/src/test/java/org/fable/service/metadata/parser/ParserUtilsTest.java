package org.fable.service.metadata.parser;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ParserUtilsTest {

    @Test
    void cleanIsbn_stripsSeparatorsAndNormalizesX() {
        assertThat(ParserUtils.cleanIsbn("978-0-306-40615-7")).isEqualTo("9780306406157");
        assertThat(ParserUtils.cleanIsbn("0-306-40615-x")).isEqualTo("030640615X");
    }

    @Test
    void isValidIsbn13Checksum_acceptsKnownValid() {
        assertThat(ParserUtils.isValidIsbn13Checksum("9780306406157")).isTrue();
        assertThat(ParserUtils.isValidIsbnChecksum("978-0-306-40615-7")).isTrue();
    }

    @Test
    void isValidIsbn13Checksum_rejectsBadCheckDigit() {
        assertThat(ParserUtils.isValidIsbn13Checksum("9780306406158")).isFalse();
        assertThat(ParserUtils.isValidIsbn13Checksum("1234567890123")).isFalse();
    }

    @Test
    void isValidIsbn10Checksum_acceptsKnownValid() {
        assertThat(ParserUtils.isValidIsbn10Checksum("0306406152")).isTrue();
        assertThat(ParserUtils.isValidIsbnChecksum("0-306-40615-2")).isTrue();
    }

    @Test
    void isValidIsbn10Checksum_acceptsXCheckDigit() {
        assertThat(ParserUtils.isValidIsbn10Checksum("080442957X")).isTrue();
    }

    @Test
    void toIsbn13_convertsValidIsbn10() {
        assertThat(ParserUtils.toIsbn13("0306406152")).isEqualTo("9780306406157");
    }

    @Test
    void toIsbn10_convertsValid978Isbn13() {
        assertThat(ParserUtils.toIsbn10("9780306406157")).isEqualTo("0306406152");
    }

    @Test
    void findIsbnCandidates_prefersLabeledMatches() {
        String text = """
                Copyright page
                ISBN-13: 978-0-306-40615-7
                Some other text mentioning 9781234567897 incorrectly
                """;
        List<ParserUtils.IsbnCandidate> candidates = ParserUtils.findIsbnCandidates(text);
        assertThat(candidates).isNotEmpty();
        assertThat(candidates.getFirst().isbn13()).isEqualTo("9780306406157");
        assertThat(candidates.getFirst().labeled()).isTrue();
    }

    @Test
    void findIsbnCandidates_acceptsSpacedBareIsbn13() {
        String text = "Published 2019. 978 0 306 40615 7 printed in USA.";
        List<ParserUtils.IsbnCandidate> candidates = ParserUtils.findIsbnCandidates(text);
        assertThat(candidates).extracting(ParserUtils.IsbnCandidate::isbn13)
                .contains("9780306406157");
    }

    @Test
    void findIsbnCandidates_toleratesOcrLetterOInDigits() {
        String text = "ISBN: 978-O-306-40615-7";
        List<ParserUtils.IsbnCandidate> candidates = ParserUtils.findIsbnCandidates(text);
        assertThat(candidates).isNotEmpty();
        assertThat(candidates.getFirst().isbn13()).isEqualTo("9780306406157");
    }

    @Test
    void hasIsbnLikeSignal_detectsLabelAndBarePrefix() {
        assertThat(ParserUtils.hasIsbnLikeSignal("ISBN 123")).isTrue();
        assertThat(ParserUtils.hasIsbnLikeSignal("code 9780306406157 here")).isTrue();
        assertThat(ParserUtils.hasIsbnLikeSignal("page 4")).isFalse();
    }

    @Test
    void findIsbnCandidates_ignoresInvalidChecksums() {
        String text = "ISBN: 978-0-306-40615-8";
        assertThat(ParserUtils.findIsbnCandidates(text)).isEmpty();
    }

    @Test
    void titleAuthorMatchScore_returnsOverlapPercent() {
        int score = ParserUtils.titleAuthorMatchScore(
                "The Great Gatsby", "F Scott Fitzgerald",
                "Great Gatsby", "Fitzgerald");
        assertThat(score).isGreaterThan(40);
    }
}
