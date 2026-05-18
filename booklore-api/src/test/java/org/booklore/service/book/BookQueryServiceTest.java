package org.booklore.service.book;

import org.booklore.mapper.v2.BookMapperV2;
import org.booklore.model.dto.Book;
import org.booklore.model.dto.BookMetadata;
import org.booklore.model.entity.BookEntity;
import org.booklore.repository.BookRepository;
import org.booklore.service.restriction.ContentRestrictionService;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class BookQueryServiceTest {

    @Test
    void getAllBooks_listViewPreservesSubtitleWhileStrippingDescription() {
        BookRepository bookRepository = mock(BookRepository.class);
        BookMapperV2 bookMapperV2 = mock(BookMapperV2.class);
        ContentRestrictionService contentRestrictionService = mock(ContentRestrictionService.class);
        EntityManager entityManager = mock(EntityManager.class);
        BookQueryService service = new BookQueryService(bookRepository, bookMapperV2, contentRestrictionService, entityManager);

        BookEntity entity = new BookEntity();
        entity.setId(1L);

        Book dto = Book.builder()
                .id(1L)
                .metadata(BookMetadata.builder()
                        .title("Existing Title")
                        .subtitle("TEST")
                        .build())
                .build();

        when(bookRepository.findAllWithSummaryMetadata()).thenReturn(List.of(entity));
        when(bookMapperV2.toSummaryDTO(entity)).thenReturn(dto);

        Book result = service.getAllBooks(false, true).getFirst();

        assertEquals("Existing Title", result.getMetadata().getTitle());
        assertEquals("TEST", result.getMetadata().getSubtitle());
        assertNull(result.getMetadata().getDescription());
        verify(bookRepository).findAllWithSummaryMetadata();
        verify(bookMapperV2).toSummaryDTO(entity);
        verify(bookMapperV2, never()).toDTO(entity);
    }
}
