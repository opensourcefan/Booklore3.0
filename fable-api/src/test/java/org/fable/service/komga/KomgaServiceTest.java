package org.fable.service.komga;

import org.fable.mapper.komga.KomgaMapper;
import org.fable.model.dto.komga.KomgaBookDto;
import org.fable.model.dto.komga.KomgaPageDto;
import org.fable.model.dto.komga.KomgaPageableDto;
import org.fable.model.dto.komga.KomgaSeriesDto;
import org.fable.model.dto.settings.AppSettings;
import org.fable.model.entity.BookEntity;
import org.fable.model.entity.BookFileEntity;
import org.fable.model.entity.BookMetadataEntity;
import org.fable.model.entity.LibraryEntity;
import org.fable.model.enums.BookFileType;
import org.fable.repository.BookRepository;
import org.fable.repository.LibraryRepository;
import org.fable.service.MagicShelfService;
import org.fable.service.appsettings.AppSettingService;
import org.fable.service.reader.CbxReaderService;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class KomgaServiceTest {

    @Mock
    private BookRepository bookRepository;

    @Mock
    private LibraryRepository libraryRepository;

    @Mock
    private KomgaMapper komgaMapper;
    
    @Mock
    private MagicShelfService magicShelfService;
    
    @Mock
    private CbxReaderService cbxReaderService;
    
    @Mock
    private AppSettingService appSettingService;

    @InjectMocks
    private KomgaService komgaService;

    private LibraryEntity library;
    private List<BookEntity> seriesBooks;

    @BeforeEach
    void setUp() {
        library = new LibraryEntity();
        library.setId(1L);
        
        // Mock app settings (lenient because not all tests use this)
        AppSettings appSettings = new AppSettings();
        appSettings.setKomgaGroupUnknown(true);
        lenient().when(appSettingService.getAppSettings()).thenReturn(appSettings);
        lenient().when(komgaMapper.getUnknownSeriesName()).thenReturn("Unknown Series");

        // Create multiple books for testing pagination
        seriesBooks = new ArrayList<>();
        for (int i = 1; i <= 50; i++) {
            BookMetadataEntity metadata = BookMetadataEntity.builder()
                    .title("Book " + i)
                    .seriesName("Test Series")
                    .seriesNumber((float) i)
                    .pageCount(null)  // Test null pageCount
                    .build();

            BookEntity book = new BookEntity();
            book.setId((long) i);
            book.setLibrary(library);
            book.setMetadata(metadata);
            book.setAddedOn(Instant.now());

            BookFileEntity pdf = new BookFileEntity();
            pdf.setId((long) i);
            pdf.setBook(book);
            pdf.setFileSubPath("author/title");
            pdf.setFileName("book-" + i + ".pdf");
            pdf.setBookType(BookFileType.PDF);
            pdf.setBookFormat(true);

            book.setBookFiles(List.of(pdf));

            seriesBooks.add(book);
        }
    }

    @Test
    void shouldReturnAllBooksWhenUnpagedIsTrue() {
        // Given
        when(bookRepository.findDistinctSeriesNamesGroupedByLibraryId(1L, "Unknown Series"))
            .thenReturn(List.of("Test Series"));
        when(bookRepository.findBooksBySeriesNameGroupedByLibraryId("Test Series", 1L, "Unknown Series"))
            .thenReturn(seriesBooks);
        
        // Mock the mapper to return DTOs
        for (BookEntity book : seriesBooks) {
            KomgaBookDto dto = KomgaBookDto.builder()
                    .id(book.getId().toString())
                    .name(book.getMetadata().getTitle())
                    .build();
            when(komgaMapper.toKomgaBookDto(book)).thenReturn(dto);
        }

        // When: Request with unpaged=true
        KomgaPageableDto<KomgaBookDto> result = komgaService.getBooksBySeries("1-test-series", 0, 20, true);

        // Then: Should return all 50 books
        assertThat(result).isNotNull();
        assertThat(result.getContent()).hasSize(50);
        assertThat(result.getTotalElements()).isEqualTo(50);
        assertThat(result.getTotalPages()).isEqualTo(1);
        assertThat(result.getSize()).isEqualTo(50);
        assertThat(result.getNumber()).isEqualTo(0);
        verify(bookRepository).findDistinctSeriesNamesGroupedByLibraryId(1L, "Unknown Series");
        verify(bookRepository).findBooksBySeriesNameGroupedByLibraryId("Test Series", 1L, "Unknown Series");
        verify(bookRepository, never()).findAllWithMetadataByLibraryId(anyLong());
    }

    @Test
    void shouldReturnPagedBooksWhenUnpagedIsFalse() {
        // Given
        when(bookRepository.findDistinctSeriesNamesGroupedByLibraryId(1L, "Unknown Series"))
            .thenReturn(List.of("Test Series"));
        when(bookRepository.findBooksBySeriesNameGroupedByLibraryId("Test Series", 1L, "Unknown Series"))
            .thenReturn(seriesBooks);
        
        // Mock the mapper to return DTOs (only for the books that will be used)
        for (int i = 0; i < 20; i++) {
            BookEntity book = seriesBooks.get(i);
            KomgaBookDto dto = KomgaBookDto.builder()
                    .id(book.getId().toString())
                    .name(book.getMetadata().getTitle())
                    .build();
            when(komgaMapper.toKomgaBookDto(book)).thenReturn(dto);
        }

        // When: Request with unpaged=false and page size 20
        KomgaPageableDto<KomgaBookDto> result = komgaService.getBooksBySeries("1-test-series", 0, 20, false);

        // Then: Should return first page with 20 books
        assertThat(result).isNotNull();
        assertThat(result.getContent()).hasSize(20);
        assertThat(result.getTotalElements()).isEqualTo(50);
        assertThat(result.getTotalPages()).isEqualTo(3);
        assertThat(result.getSize()).isEqualTo(20);
        assertThat(result.getNumber()).isEqualTo(0);
        verify(bookRepository).findDistinctSeriesNamesGroupedByLibraryId(1L, "Unknown Series");
        verify(bookRepository).findBooksBySeriesNameGroupedByLibraryId("Test Series", 1L, "Unknown Series");
        verify(bookRepository, never()).findAllWithMetadataByLibraryId(anyLong());
    }

    @Test
    void shouldHandleNullPageCountInGetBookPages() {
        // Given: Book with null pageCount
        BookMetadataEntity metadata = BookMetadataEntity.builder()
                .title("Test Book")
                .pageCount(null)
                .build();

        BookEntity book = new BookEntity();
        book.setId(100L);
        book.setMetadata(metadata);

        when(bookRepository.findById(100L)).thenReturn(Optional.of(book));

        // When: Get book pages
        List<KomgaPageDto> pages = komgaService.getBookPages(100L);

        // Then: Should return empty list without throwing NPE
        assertThat(pages).isNotNull();
        assertThat(pages).isEmpty();
    }

    @Test
    void shouldReturnCorrectPagesWhenPageCountIsValid() {
        // Given: Book with valid pageCount
        BookMetadataEntity metadata = BookMetadataEntity.builder()
                .title("Test Book")
                .pageCount(5)
                .build();

        BookEntity book = new BookEntity();
        book.setId(100L);
        book.setMetadata(metadata);

        when(bookRepository.findById(100L)).thenReturn(Optional.of(book));

        // When: Get book pages
        List<KomgaPageDto> pages = komgaService.getBookPages(100L);

        // Then: Should return 5 pages
        assertThat(pages).isNotNull();
        assertThat(pages).hasSize(5);
        assertThat(pages.get(0).getNumber()).isEqualTo(1);
        assertThat(pages.get(4).getNumber()).isEqualTo(5);
    }

    @Test
    void shouldGetAllSeriesOptimized() {
        // Given: Mock the optimized repository method
        List<String> seriesNames = List.of("Series A", "Series B", "Series C");
        when(bookRepository.findDistinctSeriesNamesGroupedByLibraryId(anyLong(), anyString()))
                .thenReturn(seriesNames);
        
        // Mock books for the first page (Series A and Series B only)
        List<BookEntity> seriesABooks = List.of(seriesBooks.get(0), seriesBooks.get(1));
        List<BookEntity> seriesBBooks = List.of(seriesBooks.get(2), seriesBooks.get(3));
        
        when(bookRepository.findBooksBySeriesNameGroupedByLibraryId("Series A", 1L, "Unknown Series"))
                .thenReturn(seriesABooks);
        when(bookRepository.findBooksBySeriesNameGroupedByLibraryId("Series B", 1L, "Unknown Series"))
                .thenReturn(seriesBBooks);
        
        when(komgaMapper.toKomgaSeriesDto(eq("Series A"), anyLong(), any()))
                .thenReturn(KomgaSeriesDto.builder().id("1-series-a").name("Series A").booksCount(2).build());
        when(komgaMapper.toKomgaSeriesDto(eq("Series B"), anyLong(), any()))
                .thenReturn(KomgaSeriesDto.builder().id("1-series-b").name("Series B").booksCount(2).build());
        
        // When: Request first page with size 2
        KomgaPageableDto<KomgaSeriesDto> result = komgaService.getAllSeries(1L, 0, 2, false);
        
        // Then: Should return only 2 series (not all 3)
        assertThat(result).isNotNull();
        assertThat(result.getContent()).hasSize(2);
        assertThat(result.getTotalElements()).isEqualTo(3);
        assertThat(result.getTotalPages()).isEqualTo(2);
        assertThat(result.getNumber()).isEqualTo(0);
        assertThat(result.getFirst()).isTrue();
        assertThat(result.getLast()).isFalse();
        
        // Verify that only books for Series A and B were loaded (optimization check)
        verify(bookRepository, never()).findAllWithMetadataByLibraryId(anyLong());
        verify(bookRepository, never()).findAllWithMetadata();
    }

    @Test
    void shouldGetAllSeriesAcrossLibrariesWithoutFullTableScan() {
        List<String> seriesNames = List.of("Series A", "Series B", "Series C");
        List<BookEntity> seriesABooks = List.of(seriesBooks.get(0), seriesBooks.get(1));

        when(bookRepository.findDistinctSeriesNamesGrouped("Unknown Series"))
                .thenReturn(seriesNames);
        when(bookRepository.findBooksBySeriesNameGrouped("Series A", "Unknown Series"))
                .thenReturn(seriesABooks);
        when(komgaMapper.toKomgaSeriesDto(eq("Series A"), anyLong(), any()))
                .thenReturn(KomgaSeriesDto.builder().id("1-series-a").name("Series A").booksCount(2).build());

        KomgaPageableDto<KomgaSeriesDto> result = komgaService.getAllSeries(null, 0, 1, false);

        assertThat(result.getContent()).hasSize(1);
        assertThat(result.getTotalElements()).isEqualTo(3);
        verify(bookRepository).findDistinctSeriesNamesGrouped("Unknown Series");
        verify(bookRepository).findBooksBySeriesNameGrouped("Series A", "Unknown Series");
        verify(bookRepository, never()).findAllWithMetadata();
    }

    @Test
    void shouldPageAllBooksWithRepositoryPagination() {
        when(bookRepository.findAllWithSummaryMetadataByLibraryIdsPage(eq(List.of(1L)), any(PageRequest.class)))
                .thenReturn(new PageImpl<>(seriesBooks.subList(0, 10), PageRequest.of(0, 10), seriesBooks.size()));

        for (int i = 0; i < 10; i++) {
            BookEntity book = seriesBooks.get(i);
            when(komgaMapper.toKomgaBookDto(book)).thenReturn(
                    KomgaBookDto.builder().id(book.getId().toString()).name(book.getMetadata().getTitle()).build());
        }

        KomgaPageableDto<KomgaBookDto> result = komgaService.getAllBooks(1L, 0, 10);

        assertThat(result.getContent()).hasSize(10);
        assertThat(result.getTotalElements()).isEqualTo(50);
        assertThat(result.getTotalPages()).isEqualTo(5);
        verify(bookRepository, never()).findAllWithMetadataByLibraryId(anyLong());
    }
}