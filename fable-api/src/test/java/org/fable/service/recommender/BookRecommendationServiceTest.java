package org.fable.service.recommender;

import org.fable.config.security.service.AuthenticationService;
import org.fable.mapper.BookMapper;
import org.fable.model.dto.Book;
import org.fable.model.dto.BookRecommendation;
import org.fable.model.entity.AuthorEntity;
import org.fable.model.entity.BookEntity;
import org.fable.model.entity.BookMetadataEntity;
import org.fable.repository.BookRepository;
import org.fable.service.book.BookQueryService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BookRecommendationServiceTest {

    @Mock
    private BookSimilarityService similarityService;

    @Mock
    private BookRepository bookRepository;

    @Mock
    private BookQueryService bookQueryService;

    @Mock
    private BookMapper bookMapper;

    @Mock
    private AuthenticationService authenticationService;

    @InjectMocks
    private BookRecommendationService service;

    @Test
    void findSimilarBooks_batchesCandidatesAndPreservesRankingRules() {
        BookEntity target = book(1L, "Target", "Saga", List.of("Target Author"));
        BookEntity sameSeries = book(2L, "Same Series", "Saga", List.of("Series Author"));
        BookEntity authorOneA = book(3L, "Author One A", null, List.of("Author One"));
        BookEntity authorOneB = book(4L, "Author One B", null, List.of("Author One"));
        BookEntity authorOneC = book(5L, "Author One C", null, List.of("Author One"));
        BookEntity authorOneD = book(6L, "Author One D", null, List.of("Author One"));
        BookEntity authorTwo = book(7L, "Author Two", null, List.of("Author Two"));

        when(bookRepository.findById(1L)).thenReturn(Optional.of(target));
        when(bookQueryService.getAllFullBookEntitiesBatch(PageRequest.of(0, 500)))
                .thenReturn(List.of(sameSeries, authorOneA, authorOneB));
        when(bookQueryService.getAllFullBookEntitiesBatch(PageRequest.of(1, 500)))
                .thenReturn(List.of(authorOneC, authorOneD, authorTwo));
        when(bookQueryService.getAllFullBookEntitiesBatch(PageRequest.of(2, 500)))
                .thenReturn(List.of());

        when(similarityService.calculateSimilarity(target, authorOneA)).thenReturn(0.95);
        when(similarityService.calculateSimilarity(target, authorOneB)).thenReturn(0.85);
        when(similarityService.calculateSimilarity(target, authorOneC)).thenReturn(0.75);
        when(similarityService.calculateSimilarity(target, authorOneD)).thenReturn(0.65);
        when(similarityService.calculateSimilarity(target, authorTwo)).thenReturn(0.55);

        when(bookQueryService.findAllWithMetadataByIds(anySet()))
                .thenReturn(List.of(authorOneC, authorTwo, authorOneA, authorOneB));

        when(bookMapper.toBookWithDescription(authorOneA, false)).thenReturn(Book.builder().id(3L).build());
        when(bookMapper.toBookWithDescription(authorOneB, false)).thenReturn(Book.builder().id(4L).build());
        when(bookMapper.toBookWithDescription(authorOneC, false)).thenReturn(Book.builder().id(5L).build());
        when(bookMapper.toBookWithDescription(authorTwo, false)).thenReturn(Book.builder().id(7L).build());

        List<BookRecommendation> recommendations = service.findSimilarBooks(1L, 4);

        assertThat(recommendations)
                .extracting(recommendation -> recommendation.getBook().getId())
                .containsExactly(3L, 4L, 5L, 7L);
        assertThat(recommendations)
                .extracting(BookRecommendation::getSimilarityScore)
                .containsExactly(0.95, 0.85, 0.75, 0.55);

        verify(bookQueryService).findAllWithMetadataByIds(eq(new LinkedHashSet<>(List.of(3L, 4L, 5L, 7L))));
        verify(bookQueryService, never()).getAllFullBookEntities();
    }

    private static BookEntity book(Long id, String title, String seriesName, List<String> authorNames) {
        List<AuthorEntity> authors = authorNames.stream()
                .map(name -> AuthorEntity.builder().name(name).build())
                .toList();

        return BookEntity.builder()
                .id(id)
                .metadata(BookMetadataEntity.builder()
                        .title(title)
                        .seriesName(seriesName)
                        .authors(authors)
                        .build())
                .build();
    }
}