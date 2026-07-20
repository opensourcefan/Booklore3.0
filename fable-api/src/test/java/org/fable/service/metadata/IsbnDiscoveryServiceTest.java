package org.fable.service.metadata;

import org.fable.config.AppProperties;
import org.fable.model.dto.BookMetadata;
import org.fable.model.dto.metadata.IsbnDiscoveryResult;
import org.fable.model.dto.settings.AppSettings;
import org.fable.service.appsettings.AppSettingService;
import org.fable.service.metadata.parser.ParserUtils;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import tools.jackson.databind.ObjectMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class IsbnDiscoveryServiceTest {

    @Mock
    private AppSettingService appSettingService;
    @Mock
    private AppProperties appProperties;

    private IsbnDiscoveryService service;

    @BeforeEach
    void setUp() {
        service = new IsbnDiscoveryService(appSettingService, appProperties, new ObjectMapper());
    }

    @Test
    void discoverFromFile_returnsDisabledWhenSettingOff() {
        AppSettings settings = new AppSettings();
        settings.setIsbnDiscoveryEnabled(false);
        when(appSettingService.getAppSettings()).thenReturn(settings);

        IsbnDiscoveryResult result = service.discoverFromFile(
                new java.io.File("/tmp/book.epub"),
                BookMetadata.builder().title("T").build());

        assertThat(result.getStatus()).isEqualTo(IsbnDiscoveryResult.Status.DISABLED);
    }

    @Test
    void resolveCandidates_autoAcceptsSoleLabeledHighConfidence() {
        List<ParserUtils.IsbnCandidate> candidates = List.of(
                new ParserUtils.IsbnCandidate("9780306406157", "9780306406157", "0306406152", true, 90)
        );
        BookMetadata existing = BookMetadata.builder().title("Some Title").build();

        IsbnDiscoveryResult result = service.resolveCandidates(candidates, existing);

        assertThat(result.getStatus()).isEqualTo(IsbnDiscoveryResult.Status.FOUND);
        assertThat(result.isRequiresReview()).isFalse();
        assertThat(result.getIsbn13()).isEqualTo("9780306406157");
    }

    @Test
    void resolveCandidates_requiresReviewWhenAmbiguous() {
        List<ParserUtils.IsbnCandidate> candidates = List.of(
                new ParserUtils.IsbnCandidate("9780306406157", "9780306406157", "0306406152", false, 55),
                new ParserUtils.IsbnCandidate("9780143127550", "9780143127550", null, false, 55)
        );

        IsbnDiscoveryResult result = service.resolveCandidates(candidates, BookMetadata.builder().build());

        assertThat(result.getStatus()).isEqualTo(IsbnDiscoveryResult.Status.AMBIGUOUS);
        assertThat(result.isRequiresReview()).isTrue();
    }

    @Test
    void applyResolvedIsbn_setsVerifiedFlag() {
        BookMetadata metadata = BookMetadata.builder().build();
        IsbnDiscoveryResult result = IsbnDiscoveryResult.builder()
                .status(IsbnDiscoveryResult.Status.FOUND)
                .isbn13("9780306406157")
                .isbn10("0306406152")
                .build();

        service.applyResolvedIsbn(metadata, result);

        assertThat(metadata.getIsbn13()).isEqualTo("9780306406157");
        assertThat(metadata.getIsbn10()).isEqualTo("0306406152");
        assertThat(metadata.getIsbnVerified()).isTrue();
    }

    @Test
    void pageNeedsOcrForIsbn_whenBlankOrSparseOrNoSignal() {
        assertThat(IsbnDiscoveryService.pageNeedsOcrForIsbn(null)).isTrue();
        assertThat(IsbnDiscoveryService.pageNeedsOcrForIsbn("")).isTrue();
        assertThat(IsbnDiscoveryService.pageNeedsOcrForIsbn("4")).isTrue();
        assertThat(IsbnDiscoveryService.pageNeedsOcrForIsbn("ISBN-13: 978-0-306-40615-7")).isFalse();
        assertThat(IsbnDiscoveryService.pageNeedsOcrForIsbn(
                "This chapter discusses narrative structure at length without any catalog identifiers present here."
        )).isTrue();
    }

    @Test
    void discoverFromFile_findsIsbnOnPdfPage4_withoutOcr() throws Exception {
        AppSettings settings = new AppSettings();
        settings.setIsbnDiscoveryEnabled(true);
        settings.setMaxFrontMatterPages(8);
        settings.setUseOcrForIsbnDiscovery(false);
        when(appSettingService.getAppSettings()).thenReturn(settings);

        java.io.File pdf = java.io.File.createTempFile("isbn-page4-", ".pdf");
        pdf.deleteOnExit();
        try (org.apache.pdfbox.pdmodel.PDDocument doc = new org.apache.pdfbox.pdmodel.PDDocument()) {
            for (int i = 0; i < 4; i++) {
                org.apache.pdfbox.pdmodel.PDPage page = new org.apache.pdfbox.pdmodel.PDPage();
                doc.addPage(page);
                if (i == 3) {
                    try (org.apache.pdfbox.pdmodel.PDPageContentStream cs =
                                 new org.apache.pdfbox.pdmodel.PDPageContentStream(doc, page)) {
                        cs.beginText();
                        cs.setFont(new org.apache.pdfbox.pdmodel.font.PDType1Font(
                                org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName.HELVETICA), 12);
                        cs.newLineAtOffset(50, 700);
                        cs.showText("ISBN-13: 978-0-306-40615-7");
                        cs.endText();
                    }
                }
            }
            doc.save(pdf);
        }

        IsbnDiscoveryResult result = service.discoverFromFile(pdf, BookMetadata.builder().title("T").build());

        assertThat(result.getStatus()).isEqualTo(IsbnDiscoveryResult.Status.FOUND);
        assertThat(result.getIsbn13()).isEqualTo("9780306406157");
    }

    @Test
    void discoverFromFile_findsIsbnOnPdfBackCover_whenMissingFromFront() throws Exception {
        AppSettings settings = new AppSettings();
        settings.setIsbnDiscoveryEnabled(true);
        settings.setMaxFrontMatterPages(2);
        settings.setUseOcrForIsbnDiscovery(false);
        when(appSettingService.getAppSettings()).thenReturn(settings);

        java.io.File pdf = java.io.File.createTempFile("isbn-back-cover-", ".pdf");
        pdf.deleteOnExit();
        try (org.apache.pdfbox.pdmodel.PDDocument doc = new org.apache.pdfbox.pdmodel.PDDocument()) {
            // 6 pages: front window is 1–2; back window is 5–6. ISBN only on last page.
            for (int i = 0; i < 6; i++) {
                org.apache.pdfbox.pdmodel.PDPage page = new org.apache.pdfbox.pdmodel.PDPage();
                doc.addPage(page);
                if (i == 5) {
                    try (org.apache.pdfbox.pdmodel.PDPageContentStream cs =
                                 new org.apache.pdfbox.pdmodel.PDPageContentStream(doc, page)) {
                        cs.beginText();
                        cs.setFont(new org.apache.pdfbox.pdmodel.font.PDType1Font(
                                org.apache.pdfbox.pdmodel.font.Standard14Fonts.FontName.HELVETICA), 12);
                        cs.newLineAtOffset(50, 700);
                        cs.showText("ISBN-13: 978-0-306-40615-7");
                        cs.endText();
                    }
                }
            }
            doc.save(pdf);
        }

        IsbnDiscoveryResult result = service.discoverFromFile(pdf, BookMetadata.builder().title("T").build());

        assertThat(result.getStatus()).isEqualTo(IsbnDiscoveryResult.Status.FOUND);
        assertThat(result.getIsbn13()).isEqualTo("9780306406157");
    }

    @Test
    void buildClearUnlockedFlags_skipsLockedFields() {
        org.fable.model.entity.BookMetadataEntity entity = new org.fable.model.entity.BookMetadataEntity();
        entity.setTitleLocked(true);
        entity.setPublisherLocked(false);

        org.fable.model.MetadataClearFlags flags = BookMetadataService.buildClearUnlockedFlags(entity);

        assertThat(flags.isTitle()).isFalse();
        assertThat(flags.isPublisher()).isTrue();
    }
}
