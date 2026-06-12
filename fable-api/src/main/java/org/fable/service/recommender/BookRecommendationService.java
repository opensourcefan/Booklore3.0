package org.fable.service.recommender;

import org.fable.config.security.service.AuthenticationService;
import org.fable.exception.ApiError;
import org.fable.mapper.BookMapper;
import org.fable.model.dto.*;
import org.fable.model.entity.AuthorEntity;
import org.fable.model.entity.BookEntity;
import org.fable.model.entity.BookMetadataEntity;
import org.fable.repository.BookRepository;
import org.fable.service.book.BookQueryService;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@AllArgsConstructor
@Service
public class BookRecommendationService {

    private record ScoredCandidate(Long bookId, double score, Set<String> authorNames) {}

    private final BookSimilarityService similarityService;
    private final BookRepository bookRepository;
    private final BookQueryService bookQueryService;
    private final BookMapper bookMapper;
    private final AuthenticationService authenticationService;

    private static final int MAX_BOOKS_PER_AUTHOR = 3;
    private static final int FULL_BOOK_BATCH_SIZE = 500;

    public List<BookRecommendation> getRecommendations(Long bookId, int limit) {
        BookEntity book = bookRepository.findById(bookId).orElseThrow(() -> ApiError.BOOK_NOT_FOUND.createException(bookId));

        Set<BookRecommendationLite> recommendations = book.getSimilarBooksJson();
        if (recommendations == null || recommendations.isEmpty()) {
            log.info("Recommendations for book ID {} are missing or empty. Computing similarity...", bookId);
            recommendations = findSimilarBookIds(bookId, limit);
            book.setSimilarBooksJson(recommendations);
            bookRepository.save(book);
        }

        Set<Long> recommendedBookIds = recommendations.stream()
                .map(BookRecommendationLite::getB)
                .collect(Collectors.toSet());

        FableUser user = authenticationService.getAuthenticatedUser();
        Set<Long> accessibleLibraryIds;
        if (user.getPermissions().isAdmin()) {
            accessibleLibraryIds = null;
        } else {
            accessibleLibraryIds = user.getAssignedLibraries().stream()
                    .map(Library::getId)
                    .collect(Collectors.toSet());
        }

        Map<Long, BookEntity> recommendedBooksMap = bookQueryService.findAllWithMetadataByIds(recommendedBookIds).stream()
                .filter(b -> {
                    if (accessibleLibraryIds == null) {
                        return true;
                    }
                    return b.getLibrary() != null && accessibleLibraryIds.contains(b.getLibrary().getId());
                })
                .collect(Collectors.toMap(BookEntity::getId, Function.identity()));

        return recommendations.stream()
                .map(rec -> {
                    BookEntity bookEntity = recommendedBooksMap.get(rec.getB());
                    if (bookEntity == null) return null;
                    return new BookRecommendation(bookMapper.toBookWithDescription(bookEntity, false), rec.getS());
                })
                .filter(Objects::nonNull)
                .limit(limit)
                .collect(Collectors.toList());
    }

    protected Set<BookRecommendationLite> findSimilarBookIds(Long bookId, int limit) {
        List<BookRecommendation> similarBooks = findSimilarBooks(bookId, limit);
        if (similarBooks == null || similarBooks.isEmpty()) {
            return Collections.emptySet();
        }
        return similarBooks.stream()
                .map(b -> new BookRecommendationLite(b.getBook().getId(), b.getSimilarityScore()))
                .collect(Collectors.toSet());
    }

    protected List<BookRecommendation> findSimilarBooks(Long bookId, int limit) {
        BookEntity target = bookRepository.findById(bookId).orElseThrow(() -> ApiError.BOOK_NOT_FOUND.createException(bookId));

        String targetSeriesName = Optional.ofNullable(target.getMetadata())
                .map(BookMetadataEntity::getSeriesName)
                .map(String::toLowerCase)
                .orElse(null);

        List<ScoredCandidate> scoredCandidates = new ArrayList<>();
        for (int batchPage = 0; ; batchPage++) {
            List<BookEntity> candidates = bookQueryService.getAllFullBookEntitiesBatch(PageRequest.of(batchPage, FULL_BOOK_BATCH_SIZE));
            if (candidates.isEmpty()) {
                break;
            }

            for (BookEntity candidate : candidates) {
                if (candidate.getId().equals(bookId)) {
                    continue;
                }

                String candidateSeriesName = Optional.ofNullable(candidate.getMetadata())
                        .map(BookMetadataEntity::getSeriesName)
                        .map(String::toLowerCase)
                        .orElse(null);
                if (targetSeriesName != null && targetSeriesName.equals(candidateSeriesName)) {
                    continue;
                }

                double similarity = similarityService.calculateSimilarity(target, candidate);
                if (similarity > 0.0) {
                    scoredCandidates.add(new ScoredCandidate(candidate.getId(), similarity, getAuthorNames(candidate)));
                }
            }
        }

        scoredCandidates.sort(Comparator.comparingDouble(ScoredCandidate::score).reversed());

        Map<String, Integer> authorCounts = new HashMap<>();
        List<Long> selectedBookIds = new ArrayList<>();
        Map<Long, Double> similarityByBookId = new LinkedHashMap<>();

        for (ScoredCandidate candidate : scoredCandidates) {
            if (selectedBookIds.size() >= limit) {
                break;
            }

            boolean allowed = candidate.authorNames().stream()
                    .allMatch(name -> getAuthorCount(authorCounts, name) < MAX_BOOKS_PER_AUTHOR);
            if (allowed) {
                selectedBookIds.add(candidate.bookId());
                similarityByBookId.put(candidate.bookId(), candidate.score());
                candidate.authorNames().forEach(name ->
                        authorCounts.put(name, getAuthorCount(authorCounts, name) + 1));
            }
        }

        if (selectedBookIds.isEmpty()) {
            return Collections.emptyList();
        }

        Map<Long, BookEntity> booksById = bookQueryService.findAllWithMetadataByIds(new LinkedHashSet<>(selectedBookIds)).stream()
                .collect(Collectors.toMap(BookEntity::getId, Function.identity()));

        return selectedBookIds.stream()
                .map(selectedBookId -> {
                    BookEntity selectedBook = booksById.get(selectedBookId);
                    if (selectedBook == null) {
                        return null;
                    }

                    Book dto = bookMapper.toBookWithDescription(selectedBook, false);
                    return new BookRecommendation(dto, similarityByBookId.get(selectedBookId));
                })
                .filter(Objects::nonNull)
                .toList();
    }

    private int getAuthorCount(Map<String, Integer> authorCounts, String authorName) {
        Integer count = authorCounts.get(authorName);
        return count != null ? count : 0;
    }

    private Set<String> getAuthorNames(BookEntity book) {
        if (book.getMetadata() == null || book.getMetadata().getAuthors() == null) return Collections.emptySet();
        return book.getMetadata().getAuthors().stream()
                .map(AuthorEntity::getName)
                .filter(Objects::nonNull)
                .map(String::toLowerCase)
                .collect(Collectors.toSet());
    }
}