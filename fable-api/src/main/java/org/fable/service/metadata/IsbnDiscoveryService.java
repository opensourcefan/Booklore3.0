package org.fable.service.metadata;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.fable.config.AppProperties;
import org.fable.model.dto.BookMetadata;
import org.fable.model.dto.metadata.IsbnDiscoveryResult;
import org.fable.model.dto.settings.AiSearchSettings;
import org.fable.model.dto.settings.AppSettings;
import org.fable.model.enums.BookFileExtension;
import org.fable.model.enums.BookFileType;
import org.fable.service.ai.AiSearchAuthHeaders;
import org.fable.service.appsettings.AppSettingService;
import org.fable.service.metadata.parser.ParserUtils;
import org.fable.util.epub.EpubContentReader;
import org.jsoup.Jsoup;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Discovers ISBN identifiers from front-matter text (first N pages/spine items).
 * Does not use vector embeddings. OCR soft-fails when the AI Search sidecar is unavailable.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class IsbnDiscoveryService {

    private static final int HIGH_CONFIDENCE_THRESHOLD = 75;
    private static final int TITLE_VERIFY_THRESHOLD = 55;
    private static final int DEFAULT_MAX_PAGES = 8;

    private final AppSettingService appSettingService;
    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;

    public IsbnDiscoveryResult discoverFromFile(File file, BookMetadata existingMetadata) {
        AppSettings settings = appSettingService.getAppSettings();
        if (!settings.isIsbnDiscoveryEnabled()) {
            return IsbnDiscoveryResult.disabled();
        }

        BookFileExtension extension = BookFileExtension.fromFileName(file.getName()).orElse(null);
        if (extension == null) {
            return IsbnDiscoveryResult.notFound("Unsupported file extension for ISBN discovery");
        }

        int maxPages = settings.getMaxFrontMatterPages() != null && settings.getMaxFrontMatterPages() > 0
                ? settings.getMaxFrontMatterPages()
                : DEFAULT_MAX_PAGES;

        try {
            FrontMatterExtract extract = extractFrontMatter(file, extension.getType(), maxPages, settings.isUseOcrForIsbnDiscovery());
            if (extract.text() == null || extract.text().isBlank()) {
                if (extract.ocrAttempted() && !extract.ocrSucceeded()) {
                    return IsbnDiscoveryResult.ocrUnavailable(
                            "No extractable text and OCR sidecar unavailable or failed for image-only content");
                }
                return IsbnDiscoveryResult.notFound("No front-matter text found for ISBN discovery");
            }

            List<ParserUtils.IsbnCandidate> candidates = ParserUtils.findIsbnCandidates(extract.text());
            return resolveCandidates(candidates, existingMetadata);
        } catch (Exception e) {
            log.warn("ISBN discovery failed for {}: {}", file.getName(), e.getMessage());
            return IsbnDiscoveryResult.builder()
                    .status(IsbnDiscoveryResult.Status.ERROR)
                    .requiresReview(true)
                    .message("ISBN discovery error: " + e.getMessage())
                    .build();
        }
    }

    /**
     * Apply a resolved ISBN onto metadata DTO used by bookdrop / refresh paths.
     */
    public void applyResolvedIsbn(BookMetadata metadata, IsbnDiscoveryResult result) {
        if (metadata == null || result == null || !result.hasResolvedIsbn()) {
            return;
        }
        if (result.getIsbn13() != null && !result.getIsbn13().isBlank()) {
            metadata.setIsbn13(result.getIsbn13());
        }
        if (result.getIsbn10() != null && !result.getIsbn10().isBlank()) {
            metadata.setIsbn10(result.getIsbn10());
        }
        metadata.setIsbnVerified(Boolean.TRUE);
    }

    IsbnDiscoveryResult resolveCandidates(List<ParserUtils.IsbnCandidate> candidates, BookMetadata existingMetadata) {
        if (candidates == null || candidates.isEmpty()) {
            return IsbnDiscoveryResult.notFound("No checksum-valid ISBN candidates in front matter");
        }

        String expectedTitle = existingMetadata != null ? existingMetadata.getTitle() : null;
        String expectedAuthor = firstAuthor(existingMetadata);

        List<ScoredCandidate> scored = new ArrayList<>();
        for (ParserUtils.IsbnCandidate candidate : candidates) {
            int verifyScore = 0;
            // Without provider metadata yet, verify against nearby file signals only:
            // labeled ISBNs near "ISBN" get a boost; title/author token presence in
            // candidate context is represented by labeled confidence today.
            if (candidate.labeled()) {
                verifyScore = Math.max(verifyScore, candidate.confidence());
            }
            // Soft title/author presence check: if file already has a non-filename title,
            // prefer labeled candidates (they already encode copyright-page context).
            if (expectedTitle != null && !expectedTitle.isBlank()) {
                verifyScore = Math.max(verifyScore, candidate.labeled() ? candidate.confidence() : candidate.confidence() / 2);
            }
            if (expectedAuthor != null && !expectedAuthor.isBlank() && candidate.labeled()) {
                verifyScore = Math.max(verifyScore, candidate.confidence());
            }
            scored.add(new ScoredCandidate(candidate, verifyScore));
        }

        scored.sort((a, b) -> Integer.compare(b.score(), a.score()));
        ScoredCandidate best = scored.getFirst();

        boolean verified = best.score() >= TITLE_VERIFY_THRESHOLD && best.candidate().labeled();
        boolean soleHighConfidence = scored.size() == 1 && best.candidate().confidence() >= HIGH_CONFIDENCE_THRESHOLD;
        boolean multiButClearWinner = scored.size() > 1
                && best.score() >= HIGH_CONFIDENCE_THRESHOLD
                && (best.score() - scored.get(1).score()) >= 20;

        if (verified || soleHighConfidence || multiButClearWinner) {
            return IsbnDiscoveryResult.builder()
                    .status(IsbnDiscoveryResult.Status.FOUND)
                    .isbn13(best.candidate().isbn13())
                    .isbn10(best.candidate().isbn10())
                    .verifiedAgainstFileSignals(verified)
                    .highConfidenceAutoPick(!verified && (soleHighConfidence || multiButClearWinner))
                    .requiresReview(false)
                    .confidence(best.score())
                    .candidates(candidates)
                    .message("ISBN resolved from front matter")
                    .build();
        }

        return IsbnDiscoveryResult.builder()
                .status(IsbnDiscoveryResult.Status.AMBIGUOUS)
                .requiresReview(true)
                .confidence(best.score())
                .candidates(candidates)
                .isbn13(best.candidate().isbn13())
                .isbn10(best.candidate().isbn10())
                .message("Multiple ISBN candidates; staging review required")
                .build();
    }

    private FrontMatterExtract extractFrontMatter(File file, BookFileType type, int maxPages, boolean useOcr) throws Exception {
        return switch (type) {
            case PDF -> extractPdfFrontMatter(file, maxPages, useOcr);
            case EPUB -> extractEpubFrontMatter(file, maxPages);
            case CBX -> extractCbxFrontMatterPlaceholder(useOcr);
            default -> new FrontMatterExtract("", false, false);
        };
    }

    private FrontMatterExtract extractPdfFrontMatter(File file, int maxPages, boolean useOcr) throws Exception {
        StringBuilder text = new StringBuilder();
        boolean ocrAttempted = false;
        boolean ocrSucceeded = false;

        try (PDDocument document = Loader.loadPDF(file)) {
            int pageCount = Math.min(document.getNumberOfPages(), maxPages);
            PDFTextStripper stripper = new PDFTextStripper();
            for (int page = 1; page <= pageCount; page++) {
                stripper.setStartPage(page);
                stripper.setEndPage(page);
                String pageText = stripper.getText(document);
                if (pageText != null && !pageText.isBlank()) {
                    text.append(pageText).append('\n');
                    continue;
                }
                if (!useOcr) {
                    continue;
                }
                ocrAttempted = true;
                String ocrText = softOcrPdfPage(document, page - 1);
                if (ocrText != null && !ocrText.isBlank()) {
                    ocrSucceeded = true;
                    text.append(ocrText).append('\n');
                }
            }
        }

        return new FrontMatterExtract(text.toString(), ocrAttempted, ocrSucceeded);
    }

    private FrontMatterExtract extractEpubFrontMatter(File file, int maxPages) {
        StringBuilder text = new StringBuilder();
        try {
            int spineSize = EpubContentReader.getSpineSize(file);
            int limit = Math.min(spineSize, maxPages);
            for (int i = 0; i < limit; i++) {
                String html = EpubContentReader.getSpineItemContent(file, i);
                String pageText = Jsoup.parse(html).text();
                if (pageText != null && !pageText.isBlank()) {
                    text.append(pageText).append('\n');
                }
            }
        } catch (Exception e) {
            log.debug("EPUB front-matter extract failed for {}: {}", file.getName(), e.getMessage());
        }
        return new FrontMatterExtract(text.toString(), false, false);
    }

    /**
     * CBX pages are images; OCR requires sidecar. Soft-fail when OCR off or unavailable.
     * Full CBX page streaming is wired in a later pass via CbxReaderService when a bookId exists.
     */
    private FrontMatterExtract extractCbxFrontMatterPlaceholder(boolean useOcr) {
        if (!useOcr) {
            return new FrontMatterExtract("", false, false);
        }
        return new FrontMatterExtract("", true, false);
    }

    private String softOcrPdfPage(PDDocument document, int pageIndex) {
        try {
            PDFRenderer renderer = new PDFRenderer(document);
            BufferedImage bufferedImage = renderer.renderImageWithDPI(pageIndex, 150, ImageType.RGB);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(bufferedImage, "jpg", baos);
            String base64Image = Base64.getEncoder().encodeToString(baos.toByteArray());

            AiSearchSettings aiSettings = appSettingService.getAppSettings().getAiSearchSettings();
            String language = aiSettings != null && aiSettings.getOcrLanguage() != null
                    ? aiSettings.getOcrLanguage()
                    : "eng";

            String baseUrl = appProperties.getAiSearch().getBaseUrl();
            RestClient restClient = buildOcrRestClient();

            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("image", base64Image);
            payload.put("lang", language);

            Map<?, ?> result = restClient.post()
                    .uri(baseUrl + "/v1/ocr")
                    .body(payload)
                    .exchange((request, response) -> {
                        byte[] bytes = response.getBody().readAllBytes();
                        if (bytes == null || bytes.length == 0) {
                            return Map.of();
                        }
                        return objectMapper.readValue(bytes, Map.class);
                    });

            Object text = result != null ? result.get("text") : null;
            return text != null ? text.toString() : null;
        } catch (Exception e) {
            log.debug("ISBN OCR soft-fail on page {}: {}", pageIndex, e.getMessage());
            return null;
        }
    }

    private RestClient buildOcrRestClient() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Math.min(3000, appProperties.getAiSearch().getConnectTimeoutMs()));
        factory.setReadTimeout(30_000);
        RestClient.Builder builder = RestClient.builder().requestFactory(factory);
        String secret = appProperties.getAiSearch().getSharedSecret();
        if (secret != null && !secret.isBlank()) {
            builder.defaultHeader(AiSearchAuthHeaders.HEADER_NAME, secret);
        }
        return builder.build();
    }

    private static String firstAuthor(BookMetadata metadata) {
        if (metadata == null || metadata.getAuthors() == null || metadata.getAuthors().isEmpty()) {
            return null;
        }
        return metadata.getAuthors().getFirst();
    }

    private record FrontMatterExtract(String text, boolean ocrAttempted, boolean ocrSucceeded) {
    }

    private record ScoredCandidate(ParserUtils.IsbnCandidate candidate, int score) {
    }
}
