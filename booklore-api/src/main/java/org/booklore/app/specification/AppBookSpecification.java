package org.booklore.app.specification;

import org.booklore.util.BookUtils;
import org.booklore.model.entity.*;
import org.booklore.model.enums.BookFileType;
import org.booklore.model.enums.ReadStatus;
import jakarta.persistence.criteria.*;
import org.springframework.data.jpa.domain.Specification;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

public class AppBookSpecification {

    private AppBookSpecification() {
    }

    public static Specification<BookEntity> inLibraries(Collection<Long> libraryIds) {
        return (root, query, cb) -> {
            if (libraryIds == null || libraryIds.isEmpty()) {
                return cb.conjunction();
            }
            return root.get("library").get("id").in(libraryIds);
        };
    }

    public static Specification<BookEntity> inLibrary(Long libraryId) {
        return (root, query, cb) -> {
            if (libraryId == null) {
                return cb.conjunction();
            }
            return cb.equal(root.get("library").get("id"), libraryId);
        };
    }

    public static Specification<BookEntity> inShelf(Long shelfId) {
        return (root, query, cb) -> {
            if (shelfId == null) {
                return cb.conjunction();
            }
            Join<BookEntity, ShelfEntity> shelvesJoin = root.join("shelves", JoinType.INNER);
            query.distinct(true);
            return cb.equal(shelvesJoin.get("id"), shelfId);
        };
    }

    public static Specification<BookEntity> withoutShelvesForUser(Long userId) {
        return (root, query, cb) -> {
            if (userId == null) {
                return cb.conjunction();
            }

            Subquery<Long> subquery = query.subquery(Long.class);
            Root<ShelfEntity> shelfRoot = subquery.from(ShelfEntity.class);
            Join<ShelfEntity, BookEntity> shelfBooks = shelfRoot.join("bookEntities", JoinType.INNER);

            subquery.select(shelfBooks.get("id"))
                    .where(cb.equal(shelfRoot.get("user").get("id"), userId));

            return cb.not(root.get("id").in(subquery));
        };
    }

    public static Specification<BookEntity> withReadStatus(ReadStatus status, Long userId) {
        return (root, query, cb) -> {
            if (status == null || userId == null) {
                return cb.conjunction();
            }
            Subquery<Long> subquery = query.subquery(Long.class);
            Root<UserBookProgressEntity> progressRoot = subquery.from(UserBookProgressEntity.class);
            subquery.select(progressRoot.get("book").get("id"))
                    .where(
                            cb.equal(progressRoot.get("user").get("id"), userId),
                            cb.equal(progressRoot.get("readStatus"), status)
                    );
            return root.get("id").in(subquery);
        };
    }

    public static Specification<BookEntity> inProgress(Long userId) {
        return (root, query, cb) -> {
            if (userId == null) {
                return cb.conjunction();
            }
            Subquery<Long> subquery = query.subquery(Long.class);
            Root<UserBookProgressEntity> progressRoot = subquery.from(UserBookProgressEntity.class);
            subquery.select(progressRoot.get("book").get("id"))
                    .where(
                            cb.equal(progressRoot.get("user").get("id"), userId),
                            progressRoot.get("readStatus").in(ReadStatus.READING, ReadStatus.RE_READING)
                    );
            return root.get("id").in(subquery);
        };
    }

    public static Specification<BookEntity> addedWithinDays(int days) {
        return (root, query, cb) -> {
            Instant cutoff = Instant.now().minus(days, ChronoUnit.DAYS);
            return cb.greaterThanOrEqualTo(root.get("addedOn"), cutoff);
        };
    }

    public static Specification<BookEntity> searchText(String searchQuery) {
        return (root, query, cb) -> {
            if (searchQuery == null || searchQuery.trim().isEmpty()) {
                return cb.conjunction();
            }
            String normalizedTerm = BookUtils.normalizeForSearch(searchQuery);
            String normalizedPattern = "%" + normalizedTerm + "%";
            String rawPattern = "%" + BookUtils.cleanSearchTerm(searchQuery).toLowerCase().trim() + "%";

            Join<BookEntity, BookMetadataEntity> metadataJoin = root.join("metadata", JoinType.LEFT);
            Join<BookMetadataEntity, CategoryEntity> categoriesJoin = metadataJoin.join("categories", JoinType.LEFT);
            Join<BookEntity, BookFileEntity> filesJoin = root.join("bookFiles", JoinType.LEFT);

            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.like(cb.lower(metadataJoin.get("searchText")), normalizedPattern));
            predicates.add(cb.like(cb.lower(categoriesJoin.get("name")), rawPattern));
            predicates.add(cb.like(cb.lower(metadataJoin.get("isbn10")), rawPattern));
            predicates.add(cb.like(cb.lower(metadataJoin.get("isbn13")), rawPattern));
            predicates.add(cb.like(cb.lower(filesJoin.get("fileName")), rawPattern));

            query.distinct(true);

            return cb.or(predicates.toArray(new Predicate[0]));
        };
    }

    public static Specification<BookEntity> notDeleted() {
        return (root, query, cb) -> cb.or(
                cb.isNull(root.get("deleted")),
                cb.equal(root.get("deleted"), false)
        );
    }

    public static Specification<BookEntity> hasScannedOn() {
        return (root, query, cb) -> cb.isNotNull(root.get("scannedOn"));
    }

    public static Specification<BookEntity> hasDigitalFile() {
        return (root, query, cb) -> cb.isNotEmpty(root.get("bookFiles"));
    }

    public static Specification<BookEntity> hasDigitalFileOrIsPhysical() {
        return (root, query, cb) -> cb.or(
                cb.isNotEmpty(root.get("bookFiles")),
                cb.isTrue(root.get("isPhysical"))
        );
    }

    public static Specification<BookEntity> hasAudiobookFile() {
        return (root, query, cb) -> {
            Subquery<Long> subquery = query.subquery(Long.class);
            Root<BookFileEntity> bookFileRoot = subquery.from(BookFileEntity.class);
            subquery.select(bookFileRoot.get("book").get("id"))
                    .where(cb.equal(bookFileRoot.get("bookType"), BookFileType.AUDIOBOOK));
            return root.get("id").in(subquery);
        };
    }

    public static Specification<BookEntity> hasNonAudiobookFile() {
        return (root, query, cb) -> {
            Subquery<Long> subquery = query.subquery(Long.class);
            Root<BookFileEntity> bookFileRoot = subquery.from(BookFileEntity.class);
            subquery.select(bookFileRoot.get("book").get("id"))
                    .where(cb.notEqual(bookFileRoot.get("bookType"), BookFileType.AUDIOBOOK));
            return root.get("id").in(subquery);
        };
    }

    /**
     * Filter books that have at least one file of the given type.
     */
    public static Specification<BookEntity> withFileType(BookFileType fileType) {
        return (root, query, cb) -> {
            if (fileType == null) {
                return cb.conjunction();
            }
            Subquery<Long> subquery = query.subquery(Long.class);
            Root<BookFileEntity> bookFileRoot = subquery.from(BookFileEntity.class);
            subquery.select(bookFileRoot.get("book").get("id"))
                    .where(cb.equal(bookFileRoot.get("bookType"), fileType));
            return root.get("id").in(subquery);
        };
    }

    /**
     * Filter books where the user's personal rating is >= minRating.
     */
    public static Specification<BookEntity> withMinRating(int minRating, Long userId) {
        return (root, query, cb) -> {
            Subquery<Long> subquery = query.subquery(Long.class);
            Root<UserBookProgressEntity> progressRoot = subquery.from(UserBookProgressEntity.class);
            subquery.select(progressRoot.get("book").get("id"))
                    .where(
                            cb.equal(progressRoot.get("user").get("id"), userId),
                            cb.greaterThanOrEqualTo(progressRoot.get("personalRating"), minRating)
                    );
            return root.get("id").in(subquery);
        };
    }

    /**
     * Filter books where the user's personal rating is <= maxRating.
     * Use maxRating=0 to find unrated books.
     */
    public static Specification<BookEntity> withMaxRating(int maxRating, Long userId) {
        return (root, query, cb) -> {
            Subquery<Long> subquery = query.subquery(Long.class);
            Root<UserBookProgressEntity> progressRoot = subquery.from(UserBookProgressEntity.class);

            if (maxRating == 0) {
                // Unrated: books with no progress entry or null personalRating
                Subquery<Long> ratedSubquery = query.subquery(Long.class);
                Root<UserBookProgressEntity> ratedRoot = ratedSubquery.from(UserBookProgressEntity.class);
                ratedSubquery.select(ratedRoot.get("book").get("id"))
                        .where(
                                cb.equal(ratedRoot.get("user").get("id"), userId),
                                cb.isNotNull(ratedRoot.get("personalRating"))
                        );
                return cb.not(root.get("id").in(ratedSubquery));
            }

            subquery.select(progressRoot.get("book").get("id"))
                    .where(
                            cb.equal(progressRoot.get("user").get("id"), userId),
                            cb.lessThanOrEqualTo(progressRoot.get("personalRating"), maxRating)
                    );
            return root.get("id").in(subquery);
        };
    }

    /**
     * Filter books by author name (case-insensitive exact match).
     */
    public static Specification<BookEntity> withAuthor(String authorName) {
        return (root, query, cb) -> {
            if (authorName == null || authorName.trim().isEmpty()) {
                return cb.conjunction();
            }
            Join<BookEntity, BookMetadataEntity> metadataJoin = root.join("metadata", JoinType.LEFT);
            Join<BookMetadataEntity, AuthorEntity> authorsJoin = metadataJoin.join("authors", JoinType.LEFT);
            query.distinct(true);
            return cb.equal(cb.lower(authorsJoin.get("name")), authorName.toLowerCase().trim());
        };
    }

    /**
     * Filter books by language code (case-insensitive).
     */
    public static Specification<BookEntity> withLanguage(String language) {
        return (root, query, cb) -> {
            if (language == null || language.trim().isEmpty()) {
                return cb.conjunction();
            }
            Join<BookEntity, BookMetadataEntity> metadataJoin = root.join("metadata", JoinType.LEFT);
            return cb.equal(cb.lower(metadataJoin.get("language")), language.toLowerCase().trim());
        };
    }

    public static Specification<BookEntity> withCustomMediaType(String mediaType) {
        return (root, query, cb) -> {
            if (mediaType == null || mediaType.trim().isEmpty()) {
                return cb.conjunction();
            }

            String trimmed = mediaType.trim();
            if ("PHYSICAL".equalsIgnoreCase(trimmed)) {
                Expression<String> normalizedFileType = cb.trim(cb.coalesce(root.get("fileType"), ""));
                return cb.and(
                        cb.isTrue(root.get("isPhysical")),
                        cb.equal(normalizedFileType, "")
                );
            }

            return cb.equal(root.get("fileType"), trimmed);
        };
    }

    public static Specification<BookEntity> inSeries(String seriesName) {
        return (root, query, cb) -> {
            if (seriesName == null || seriesName.trim().isEmpty()) {
                return cb.conjunction();
            }
            Join<BookEntity, BookMetadataEntity> metadataJoin = root.join("metadata", JoinType.LEFT);
            return cb.equal(metadataJoin.get("seriesName"), seriesName);
        };
    }

    @SafeVarargs
    public static Specification<BookEntity> combine(Specification<BookEntity>... specs) {
        Specification<BookEntity> result = (root, query, cb) -> cb.conjunction();
        for (Specification<BookEntity> spec : specs) {
            if (spec != null) {
                result = result.and(spec);
            }
        }
        return result;
    }

    @SafeVarargs
    public static Specification<BookEntity> combineOr(Specification<BookEntity>... specs) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            for (Specification<BookEntity> spec : specs) {
                if (spec != null) {
                    predicates.add(spec.toPredicate(root, query, cb));
                }
            }
            if (predicates.isEmpty()) {
                return cb.conjunction();
            }
            return cb.or(predicates.toArray(new Predicate[0]));
        };
    }

    public static Specification<BookEntity> withCategory(String category) {
        return (root, query, cb) -> {
            if (category == null || category.trim().isEmpty()) return cb.conjunction();
            Join<BookEntity, BookMetadataEntity> metadataJoin = root.join("metadata", JoinType.LEFT);
            Join<BookMetadataEntity, CategoryEntity> catJoin = metadataJoin.join("categories", JoinType.LEFT);
            query.distinct(true);
            return cb.equal(cb.lower(catJoin.get("name")), category.toLowerCase().trim());
        };
    }

    public static Specification<BookEntity> withPublisher(String publisher) {
        return (root, query, cb) -> {
            if (publisher == null || publisher.trim().isEmpty()) return cb.conjunction();
            Join<BookEntity, BookMetadataEntity> metadataJoin = root.join("metadata", JoinType.LEFT);
            return cb.equal(cb.lower(metadataJoin.get("publisher")), publisher.toLowerCase().trim());
        };
    }

    public static Specification<BookEntity> withIsbn(String isbn) {
        return (root, query, cb) -> {
            if (isbn == null || isbn.trim().isEmpty()) return cb.conjunction();
            Join<BookEntity, BookMetadataEntity> metadataJoin = root.join("metadata", JoinType.LEFT);
            String trimmed = isbn.trim();
            return cb.or(
                cb.equal(metadataJoin.get("isbn13"), trimmed),
                cb.equal(metadataJoin.get("isbn10"), trimmed)
            );
        };
    }

    public static Specification<BookEntity> withAmazonRatingBetween(Double min, Double max) {
        return numericRangeSpec("metadata", "amazonRating", min, max);
    }

    public static Specification<BookEntity> withGoodreadsRatingBetween(Double min, Double max) {
        return numericRangeSpec("metadata", "goodreadsRating", min, max);
    }

    public static Specification<BookEntity> withHardcoverRatingBetween(Double min, Double max) {
        return numericRangeSpec("metadata", "hardcoverRating", min, max);
    }

    public static Specification<BookEntity> withPageCountBetween(Integer min, Integer max) {
        return numericRangeSpec("metadata", "pageCount", min, max);
    }

    public static Specification<BookEntity> withPublishedYear(int year) {
        return (root, query, cb) -> {
            Join<BookEntity, BookMetadataEntity> metadataJoin = root.join("metadata", JoinType.LEFT);
            Expression<String> dateExpr = metadataJoin.get("publishedDate");
            return cb.like(dateExpr, year + "%");
        };
    }

    public static Specification<BookEntity> withContentRating(String contentRating) {
        return (root, query, cb) -> {
            if (contentRating == null || contentRating.trim().isEmpty()) return cb.conjunction();
            Join<BookEntity, BookMetadataEntity> metadataJoin = root.join("metadata", JoinType.LEFT);
            return cb.equal(cb.lower(metadataJoin.get("contentRating")), contentRating.toLowerCase().trim());
        };
    }

    public static Specification<BookEntity> withAgeRating(int ageRating) {
        return (root, query, cb) -> {
            Join<BookEntity, BookMetadataEntity> metadataJoin = root.join("metadata", JoinType.LEFT);
            return cb.equal(metadataJoin.get("ageRating"), ageRating);
        };
    }

    public static Specification<BookEntity> withFileSizeBetween(Long minKb, Long maxKb) {
        return (root, query, cb) -> {
            Join<BookEntity, BookFileEntity> filesJoin = root.join("bookFiles", JoinType.LEFT);
            query.distinct(true);
            List<Predicate> predicates = new ArrayList<>();
            if (minKb != null) {
                predicates.add(cb.greaterThanOrEqualTo(filesJoin.get("fileSizeKb"), minKb));
            }
            if (maxKb != null) {
                predicates.add(cb.lessThanOrEqualTo(filesJoin.get("fileSizeKb"), maxKb));
            }
            return predicates.isEmpty() ? cb.conjunction() : cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    public static Specification<BookEntity> withMatchScoreBetween(Double min, Double max) {
        return numericRangeSpec(null, "metadataMatchScore", min, max);
    }

    public static Specification<BookEntity> withTag(String tag) {
        return (root, query, cb) -> {
            if (tag == null || tag.trim().isEmpty()) return cb.conjunction();
            Join<BookEntity, BookMetadataEntity> metadataJoin = root.join("metadata", JoinType.LEFT);
            Join<BookMetadataEntity, TagEntity> tagJoin = metadataJoin.join("tags", JoinType.LEFT);
            query.distinct(true);
            return cb.equal(cb.lower(tagJoin.get("name")), tag.toLowerCase().trim());
        };
    }

    public static Specification<BookEntity> withSeriesNumber(Integer number) {
        return (root, query, cb) -> {
            if (number == null) return cb.conjunction();
            Join<BookEntity, BookMetadataEntity> metadataJoin = root.join("metadata", JoinType.LEFT);
            return cb.equal(metadataJoin.get("seriesNumber"), number);
        };
    }

    public static Specification<BookEntity> withNarrator(String narrator) {
        return (root, query, cb) -> {
            if (narrator == null || narrator.trim().isEmpty()) return cb.conjunction();
            Join<BookEntity, BookMetadataEntity> metadataJoin = root.join("metadata", JoinType.LEFT);
            return cb.equal(cb.lower(metadataJoin.get("narrator")), narrator.toLowerCase().trim());
        };
    }

    private static <T extends Number & Comparable<?>> Specification<BookEntity> numericRangeSpec(
            String joinPath, String field, T min, T max) {
        return (root, query, cb) -> {
            Path<T> path;
            if (joinPath != null) {
                path = root.join(joinPath, JoinType.LEFT).get(field);
            } else {
                path = root.get(field);
            }
            List<Predicate> predicates = new ArrayList<>();
            if (min != null) {
                predicates.add(cb.ge(path, min));
            }
            if (max != null) {
                predicates.add(cb.le(path, max));
            }
            return predicates.isEmpty() ? cb.conjunction() : cb.and(predicates.toArray(new Predicate[0]));
        };
    }
}
