package org.fable.service.metadata;

import org.fable.mapper.BookMapper;
import org.fable.model.dto.Book;
import org.fable.model.dto.BookMetadata;
import org.fable.model.dto.metadata.IsbnDiscoveryResult;
import org.fable.model.dto.settings.AppSettings;
import org.fable.model.entity.BookEntity;
import org.fable.model.entity.BookMetadataEntity;
import org.fable.model.enums.MetadataProvider;
import org.fable.repository.BookRepository;
import org.fable.service.NotificationService;
import org.fable.service.appsettings.AppSettingService;
import org.fable.service.metadata.parser.BookParser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.file.Path;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class IsbnMetadataFillServiceStatusTest {

    @Mock
    private AppSettingService appSettingService;
    @Mock
    private BookRepository bookRepository;
    @Mock
    private BookMapper bookMapper;
    @Mock
    private BookMetadataService bookMetadataService;
    @Mock
    private BookMetadataUpdater bookMetadataUpdater;
    @Mock
    private IsbnDiscoveryService isbnDiscoveryService;
    @Mock
    private IsbnDiscoveryStatusService isbnDiscoveryStatusService;
    @Mock
    private NotificationService notificationService;
    @Mock
    private AppSettings settings;
    @Mock
    private BookEntity book;
    @Mock
    private BookMetadataEntity metadataEntity;

    private IsbnMetadataFillService service;

    @BeforeEach
    void setUp() {
        Map<MetadataProvider, BookParser> parsers = Map.of();
        service = new IsbnMetadataFillService(
                appSettingService,
                bookRepository,
                bookMapper,
                bookMetadataService,
                bookMetadataUpdater,
                isbnDiscoveryService,
                isbnDiscoveryStatusService,
                notificationService,
                parsers
        );

        when(appSettingService.getAppSettings()).thenReturn(settings);
        when(settings.isIsbnDiscoveryEnabled()).thenReturn(true);
        when(bookRepository.findById(1L)).thenReturn(Optional.of(book));
        when(book.getMetadata()).thenReturn(metadataEntity);
        when(metadataEntity.areAllFieldsLocked()).thenReturn(false);
        when(bookMapper.toBook(book)).thenReturn(Book.builder()
                .id(1L)
                .metadata(BookMetadata.builder().build())
                .build());
        when(book.getFullFilePath()).thenReturn(Path.of("/tmp/test.pdf"));
    }

    @Test
    void fillBookFromIsbn_recordsNotFoundSeparatelyFromTechnicalFailure() {
        IsbnDiscoveryResult result = IsbnDiscoveryResult.notFound("No checksum-valid ISBN found");
        when(isbnDiscoveryService.discoverFromFile(
                eq(Path.of("/tmp/test.pdf").toFile()),
                any(BookMetadata.class)))
                .thenReturn(result);

        IsbnMetadataFillService.IsbnFillOutcome outcome = service.fillBookFromIsbn(1L);

        assertThat(outcome.status()).isEqualTo(IsbnMetadataFillService.IsbnFillOutcome.Status.ERROR);
        verify(isbnDiscoveryStatusService)
                .recordNotFound(book, "No checksum-valid ISBN found");
    }

    @Test
    void fillBookFromIsbn_recordsOcrUnavailableAsTechnicalFailure() {
        IsbnDiscoveryResult result = IsbnDiscoveryResult.ocrUnavailable("OCR sidecar unavailable");
        when(isbnDiscoveryService.discoverFromFile(
                eq(Path.of("/tmp/test.pdf").toFile()),
                any(BookMetadata.class)))
                .thenReturn(result);

        IsbnMetadataFillService.IsbnFillOutcome outcome = service.fillBookFromIsbn(1L);

        assertThat(outcome.status()).isEqualTo(IsbnMetadataFillService.IsbnFillOutcome.Status.ERROR);
        verify(isbnDiscoveryStatusService)
                .recordError(book, "OCR sidecar unavailable");
    }
}
