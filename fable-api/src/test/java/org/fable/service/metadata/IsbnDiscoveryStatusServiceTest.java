package org.fable.service.metadata;

import org.fable.mapper.BookMapper;
import org.fable.model.dto.Book;
import org.fable.model.entity.BookEntity;
import org.fable.model.enums.IsbnDiscoveryStatus;
import org.fable.repository.BookRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class IsbnDiscoveryStatusServiceTest {

    @Mock
    private BookRepository bookRepository;
    @Mock
    private BookMapper bookMapper;

    private IsbnDiscoveryStatusService service;
    private BookEntity book;

    @BeforeEach
    void setUp() {
        service = new IsbnDiscoveryStatusService(bookRepository, bookMapper);
        book = BookEntity.builder().id(42L).build();
    }

    @Test
    void recordNotFound_persistsAmberBadgeStateAndSanitizedDetail() {
        when(bookMapper.toBookWithDescription(book, true))
                .thenReturn(Book.builder().id(42L).build());
        service.recordNotFound(book, "No valid ISBN\nfound");

        assertThat(book.getIsbnDiscoveryStatus()).isEqualTo(IsbnDiscoveryStatus.NOT_FOUND);
        assertThat(book.getIsbnDiscoveryCheckedAt()).isNotNull();
        assertThat(book.getIsbnDiscoveryDetail()).isEqualTo("No valid ISBN found");
        verify(bookRepository).save(book);
    }

    @Test
    void recordError_persistsRedBadgeState() {
        when(bookMapper.toBookWithDescription(book, true))
                .thenReturn(Book.builder().id(42L).build());
        service.recordError(book, "OCR sidecar unavailable");

        assertThat(book.getIsbnDiscoveryStatus()).isEqualTo(IsbnDiscoveryStatus.ERROR);
        assertThat(book.getIsbnDiscoveryDetail()).isEqualTo("OCR sidecar unavailable");
        verify(bookRepository).save(book);
    }

    @Test
    void clearRecordedProblem_removesPreviousBadgeState() {
        book.setIsbnDiscoveryStatus(IsbnDiscoveryStatus.ERROR);
        book.setIsbnDiscoveryDetail("Previous failure");
        when(bookMapper.toBookWithDescription(book, true))
                .thenReturn(Book.builder().id(42L).build());

        service.clearRecordedProblem(book);

        assertThat(book.getIsbnDiscoveryStatus()).isNull();
        assertThat(book.getIsbnDiscoveryCheckedAt()).isNull();
        assertThat(book.getIsbnDiscoveryDetail()).isNull();
        verify(bookRepository).save(book);
    }

    @Test
    void clearRecordedProblem_noOpsWhenNoProblemWasRecorded() {
        assertThat(service.clearRecordedProblem(book)).isNull();

        verify(bookRepository, never()).save(book);
    }
}
