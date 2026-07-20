package org.fable.service.metadata.parser;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class ParserUtils {

    private static final Pattern NON_ISBN_CHAR_PATTERN = Pattern.compile("[^0-9Xx]");

    /**
     * Matches labeled ISBN tokens and bare ISBN-13 / ISBN-10 digit runs.
     * Allows spaces/dashes (common in OCR and copyright pages). Candidates are
     * validated via checksum before use.
     */
    private static final Pattern ISBN_CANDIDATE_PATTERN = Pattern.compile(
            "(?i)(?:ISBN(?:-1[03])?|International\\s+Standard\\s+Book\\s+Number)"
                    + "\\s*[:#]?\\s*([0-9XxOoIl|][0-9XxOoIl|\\-\\s]{8,22}[0-9XxOoIl|])"
                    + "|(?<![0-9])(97[89][0-9\\-\\s]{10,20}[0-9])(?![0-9])"
                    + "|(?<![0-9])([0-9][0-9\\-\\s]{8,14}[0-9Xx])(?![0-9A-Za-z])"
    );

    private static final Pattern ISBN_LABEL_NEARBY = Pattern.compile(
            "(?i)(?:ISBN(?:-1[03])?|International\\s+Standard\\s+Book\\s+Number)"
    );

    /** Cheap signal that a page might already contain an ISBN in its text layer. */
    private static final Pattern ISBN_LIKE_SIGNAL = Pattern.compile(
            "(?i)ISBN|97[89][\\d\\-\\s]{10,}|\\b\\d[\\d\\-\\s]{8,12}\\d[Xx]?\\b"
    );

    private ParserUtils() {
    }

    public static String cleanIsbn(String isbn) {
        if (isbn == null) return null;
        String cleaned = NON_ISBN_CHAR_PATTERN.matcher(isbn).replaceAll("");
        // Normalize 'x' to 'X' for ISBN-10 check digit
        if (cleaned.length() == 10 && cleaned.endsWith("x")) {
            cleaned = cleaned.substring(0, 9) + "X";
        }
        return cleaned;
    }

    /**
     * Like {@link #cleanIsbn(String)} but also maps common OCR confusions (O→0, l/I/|→1)
     * when the plain clean fails checksum validation.
     */
    public static String cleanIsbnTolerant(String isbn) {
        String cleaned = cleanIsbn(isbn);
        if (cleaned != null && isValidIsbnChecksum(cleaned)) {
            return cleaned;
        }
        if (isbn == null) {
            return cleaned;
        }
        String deconfused = isbn
                .replace('O', '0')
                .replace('o', '0')
                .replace('I', '1')
                .replace('l', '1')
                .replace('|', '1');
        return cleanIsbn(deconfused);
    }

    /**
     * True when text already looks like it contains an ISBN token (label or digit run).
     * Used to decide whether a PDF page still needs OCR for ISBN discovery.
     */
    public static boolean hasIsbnLikeSignal(String text) {
        return text != null && !text.isBlank() && ISBN_LIKE_SIGNAL.matcher(text).find();
    }

    /**
     * Returns true when {@code isbn} cleans to a checksum-valid ISBN-10 or ISBN-13.
     */
    public static boolean isValidIsbnChecksum(String isbn) {
        String cleaned = cleanIsbn(isbn);
        if (cleaned == null || cleaned.isBlank()) {
            return false;
        }
        if (cleaned.length() == 13) {
            return isValidIsbn13Checksum(cleaned);
        }
        if (cleaned.length() == 10) {
            return isValidIsbn10Checksum(cleaned);
        }
        return false;
    }

    public static boolean isValidIsbn13Checksum(String isbn13) {
        if (isbn13 == null || isbn13.length() != 13 || !isbn13.chars().allMatch(Character::isDigit)) {
            return false;
        }
        if (!(isbn13.startsWith("978") || isbn13.startsWith("979"))) {
            return false;
        }
        int sum = 0;
        for (int i = 0; i < 12; i++) {
            int digit = isbn13.charAt(i) - '0';
            sum += (i % 2 == 0) ? digit : digit * 3;
        }
        int check = (10 - (sum % 10)) % 10;
        return check == (isbn13.charAt(12) - '0');
    }

    public static boolean isValidIsbn10Checksum(String isbn10) {
        if (isbn10 == null || isbn10.length() != 10) {
            return false;
        }
        int sum = 0;
        for (int i = 0; i < 9; i++) {
            char c = isbn10.charAt(i);
            if (!Character.isDigit(c)) {
                return false;
            }
            sum += (c - '0') * (10 - i);
        }
        char checkChar = isbn10.charAt(9);
        int checkDigit;
        if (checkChar == 'X' || checkChar == 'x') {
            checkDigit = 10;
        } else if (Character.isDigit(checkChar)) {
            checkDigit = checkChar - '0';
        } else {
            return false;
        }
        return (sum + checkDigit) % 11 == 0;
    }

    /**
     * Convert a valid ISBN-10 to ISBN-13 (978 prefix) when possible.
     */
    public static String toIsbn13(String isbn) {
        String cleaned = cleanIsbn(isbn);
        if (cleaned == null) {
            return null;
        }
        if (cleaned.length() == 13 && isValidIsbn13Checksum(cleaned)) {
            return cleaned;
        }
        if (cleaned.length() != 10 || !isValidIsbn10Checksum(cleaned)) {
            return null;
        }
        String body = "978" + cleaned.substring(0, 9);
        int sum = 0;
        for (int i = 0; i < 12; i++) {
            int digit = body.charAt(i) - '0';
            sum += (i % 2 == 0) ? digit : digit * 3;
        }
        int check = (10 - (sum % 10)) % 10;
        return body + check;
    }

    public static String toIsbn10(String isbn) {
        String cleaned = cleanIsbn(isbn);
        if (cleaned == null) {
            return null;
        }
        if (cleaned.length() == 10 && isValidIsbn10Checksum(cleaned)) {
            return cleaned;
        }
        if (cleaned.length() != 13 || !cleaned.startsWith("978") || !isValidIsbn13Checksum(cleaned)) {
            return null;
        }
        String body = cleaned.substring(3, 12);
        int sum = 0;
        for (int i = 0; i < 9; i++) {
            sum += (body.charAt(i) - '0') * (10 - i);
        }
        int remainder = sum % 11;
        int check = (11 - remainder) % 11;
        return body + (check == 10 ? "X" : String.valueOf(check));
    }

    /**
     * Extract checksum-valid ISBN candidates from free text (front matter).
     * Preference order: labeled matches first, then bare digit runs (deduped).
     */
    public static List<IsbnCandidate> findIsbnCandidates(String text) {
        if (text == null || text.isBlank()) {
            return List.of();
        }

        Set<String> seen = new LinkedHashSet<>();
        List<IsbnCandidate> labeled = new ArrayList<>();
        List<IsbnCandidate> bare = new ArrayList<>();

        Matcher matcher = ISBN_CANDIDATE_PATTERN.matcher(text);
        while (matcher.find()) {
            String raw = firstNonNull(matcher.group(1), matcher.group(2), matcher.group(3));
            if (raw == null) {
                continue;
            }
            String cleaned = cleanIsbnTolerant(raw);
            if (!isValidIsbnChecksum(cleaned) || !seen.add(cleaned)) {
                continue;
            }
            boolean nearLabel = matcher.group(1) != null || hasNearbyIsbnLabel(text, matcher.start());
            int confidence = nearLabel ? 90 : 55;
            IsbnCandidate candidate = new IsbnCandidate(cleaned, toIsbn13(cleaned), toIsbn10(cleaned), nearLabel, confidence);
            if (nearLabel) {
                labeled.add(candidate);
            } else {
                bare.add(candidate);
            }
        }

        List<IsbnCandidate> result = new ArrayList<>(labeled.size() + bare.size());
        result.addAll(labeled);
        result.addAll(bare);
        return result;
    }

    private static boolean hasNearbyIsbnLabel(String text, int matchStart) {
        int from = Math.max(0, matchStart - 40);
        String window = text.substring(from, matchStart);
        return ISBN_LABEL_NEARBY.matcher(window).find();
    }

    private static String firstNonNull(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    /**
     * Simple token-overlap confidence between discovered metadata signals and a candidate context.
     * Returns 0–100.
     */
    public static int titleAuthorMatchScore(String expectedTitle, String expectedAuthor, String candidateTitle, String candidateAuthor) {
        int score = 0;
        int parts = 0;
        if (expectedTitle != null && !expectedTitle.isBlank() && candidateTitle != null && !candidateTitle.isBlank()) {
            parts++;
            score += tokenOverlapPercent(expectedTitle, candidateTitle);
        }
        if (expectedAuthor != null && !expectedAuthor.isBlank() && candidateAuthor != null && !candidateAuthor.isBlank()) {
            parts++;
            score += tokenOverlapPercent(expectedAuthor, candidateAuthor);
        }
        if (parts == 0) {
            return 0;
        }
        return score / parts;
    }

    private static int tokenOverlapPercent(String a, String b) {
        Set<String> left = tokenize(a);
        Set<String> right = tokenize(b);
        if (left.isEmpty() || right.isEmpty()) {
            return 0;
        }
        int overlap = 0;
        for (String token : left) {
            if (right.contains(token)) {
                overlap++;
            }
        }
        return (int) Math.round((overlap * 100.0) / Math.max(left.size(), right.size()));
    }

    private static Set<String> tokenize(String value) {
        String normalized = value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9\\s]", " ");
        Set<String> tokens = new LinkedHashSet<>();
        for (String part : normalized.split("\\s+")) {
            if (part.length() >= 2) {
                tokens.add(part);
            }
        }
        return tokens;
    }

    public record IsbnCandidate(
            String cleaned,
            String isbn13,
            String isbn10,
            boolean labeled,
            int confidence
    ) {
    }
}
