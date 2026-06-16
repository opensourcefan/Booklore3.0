package org.fable.service.book;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Tuple;
import jakarta.persistence.TypedQuery;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.From;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Order;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Selection;
import jakarta.persistence.criteria.Subquery;
import org.fable.app.dto.AppBookGridSummary;
import org.fable.mapper.v2.BookMapperV2;
import org.fable.model.dto.Book;
import org.fable.model.dto.BookMetadata;
import org.fable.model.dto.BookFile;
import org.fable.model.dto.ComicMetadata;
import org.fable.model.entity.BookEntity;
import org.fable.model.entity.BookFileEntity;
import org.fable.model.entity.LibraryEntity;
import org.fable.model.entity.UserBookProgressEntity;
import org.fable.model.enums.BookFileType;
import org.fable.model.enums.ReadStatus;
import org.fable.repository.BookRepository;
import org.fable.service.restriction.ContentRestrictionService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import org.fable.model.dto.BookRecommendationLite;
import org.hibernate.Hibernate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

@RequiredArgsConstructor
@Service
public class BookQueryService {

    private static final String PRIMARY_FILE_NAME_SORT_FIELD = "fileName";
    private static final int PRIMARY_FILE_FALLBACK_RANK = 1000;
    private static final int MAX_NATURAL_SORT_SEGMENTS = 4;
    private static final String NATURAL_PREFIX_PATTERN = "\\d.*$";
    private static final String NATURAL_NUMBER_PATTERN = "\\d+";
    private static final String NATURAL_LEADING_ZERO_PATTERN = "^0+";
    private static final String NATURAL_REMAINDER_PATTERN = "^.*?\\d+";

    private static final Set<String> NATURAL_STRING_SORT_FIELDS = Set.of(
            PRIMARY_FILE_NAME_SORT_FIELD,
            "metadata.title",
            "metadata.seriesName",
            "metadata.publisher",
            "metadata.narrator"
    );

    private static final Set<String> USER_PROGRESS_SORT_FIELDS = Set.of(
            "personalRating",
            "lastReadTime",
            "dateFinished",
            "readStatus"
    );

    private final BookRepository bookRepository;
    private final BookMapperV2 bookMapperV2;
    private final ContentRestrictionService contentRestrictionService;
    private final EntityManager entityManager;

    public List<Book> getAllBooks(boolean includeDescription, boolean stripForListView) {
        List<BookEntity> books = stripForListView
                ? bookRepository.findAllWithSummaryMetadata()
                : bookRepository.findAllWithMetadata();
        return mapBooksToDto(books, includeDescription, null, stripForListView);
    }

    public List<Book> getAllBooksByLibraryIds(Set<Long> libraryIds, boolean includeDescription, boolean stripForListView, Long userId) {
        List<BookEntity> books = stripForListView
                ? bookRepository.findAllWithSummaryMetadataByLibraryIds(libraryIds)
                : bookRepository.findAllWithMetadataByLibraryIds(libraryIds);
        books = contentRestrictionService.applyRestrictions(books, userId);
        return mapBooksToDto(books, includeDescription, userId, stripForListView);
    }

    public Page<Book> getAllBooksPaged(Pageable pageable) {
        Page<BookEntity> page = bookRepository.findAllWithSummaryMetadataPage(pageable);
        return page.map(book -> mapBookToDto(book, false, null, true));
    }

    public Page<AppBookGridSummary> findAllPaged(Specification<BookEntity> spec, Pageable pageable) {
        return findAllPaged(spec, pageable, null);
    }

    @Transactional(readOnly = true)
    public Page<AppBookGridSummary> findAllPaged(Specification<BookEntity> spec, Pageable pageable, Long userId) {
        return findAllPagedCustom(spec, pageable, userId);
    }

    private Page<AppBookGridSummary> findAllPagedCustom(Specification<BookEntity> spec, Pageable pageable, Long userId) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();

        CriteriaQuery<Tuple> idQuery = cb.createTupleQuery();
        Root<BookEntity> idRoot = idQuery.from(BookEntity.class);
        Predicate predicate = applySpecification(spec, idRoot, idQuery, cb);
        
        Join<BookEntity, UserBookProgressEntity> progressJoin = null;
        if (userId != null && requiresUserProgressSort(pageable.getSort())) {
            progressJoin = idRoot.join("userBookProgress", JoinType.LEFT);
            progressJoin.on(cb.equal(progressJoin.get("user").get("id"), userId));
        }

        SortPlan sortPlan = buildSortPlan(pageable.getSort(), idRoot, progressJoin, cb, idQuery);
        List<Selection<?>> selections = new ArrayList<>();
        selections.add(idRoot.get("id").alias("id"));
        selections.addAll(sortPlan.projections());

        // Remove unconditional distinct(true) — specs that require DISTINCT (searchText,
        // withAuthor, withCategory, inShelf, etc.) already call query.distinct(true)
        // internally.  When no such spec is active, omitting DISTINCT prevents Hibernate
        // from implicitly joining every collection association to compute distinctness,
        // which was the root cause of the cartesian-product explosion.
        idQuery.multiselect(selections);
        if (predicate != null) {
            idQuery.where(predicate);
        }
        idQuery.orderBy(sortPlan.orders());

        TypedQuery<Tuple> typedIdQuery = entityManager.createQuery(idQuery);
        typedIdQuery.setFirstResult((int) pageable.getOffset());
        typedIdQuery.setMaxResults(pageable.getPageSize());
        List<Long> orderedIds = typedIdQuery.getResultList().stream()
                .map(tuple -> tuple.get("id", Long.class))
                .toList();

        List<BookEntity> content = fetchOrderedPagedEntities(orderedIds);

        // Lightweight COUNT: use COUNT(DISTINCT b.id) instead of COUNT(DISTINCT b).
        // Counting a specific column rather than the root entity prevents Hibernate
        // from implicitly joining every collection association to compute distinctness,
        // which was the root cause of the cartesian-product explosion in the COUNT query.
        // DISTINCT is retained so filter specs that create JOINs (searchText, withAuthor,
        // withCategory, etc.) still produce correct counts even when JOINs create
        // duplicate intermediate rows.
        CriteriaQuery<Long> countQuery = cb.createQuery(Long.class);
        Root<BookEntity> countRoot = countQuery.from(BookEntity.class);
        Predicate countPredicate = applySpecification(spec, countRoot, countQuery, cb);
        countQuery.select(cb.countDistinct(countRoot.get("id")));
        if (countPredicate != null) {
            countQuery.where(countPredicate);
        }

        long total = entityManager.createQuery(countQuery).getSingleResult();
        List<AppBookGridSummary> mapped = content.stream()
                .map(this::mapBookToGridSummary)
                .toList();
        return new PageImpl<>(mapped, pageable, total);
    }

    private List<BookEntity> fetchOrderedPagedEntities(List<Long> orderedIds) {
        if (orderedIds.isEmpty()) {
            return List.of();
        }

        List<BookEntity> entities = bookRepository.findAllGridSummaryByIds(new LinkedHashSet<>(orderedIds));
        Map<Long, Integer> orderById = new HashMap<>();
        for (int index = 0; index < orderedIds.size(); index++) {
            orderById.put(orderedIds.get(index), index);
        }

        entities.sort(Comparator.comparingInt(entity -> orderById.getOrDefault(entity.getId(), Integer.MAX_VALUE)));
        return entities;
    }

    private Predicate applySpecification(
            Specification<BookEntity> spec,
            Root<BookEntity> root,
            CriteriaQuery<?> query,
            CriteriaBuilder cb) {
        if (spec == null) {
            return cb.conjunction();
        }

        return spec.toPredicate(root, query, cb);
    }

    private boolean requiresUserProgressSort(Sort sort) {
        return sort.stream().anyMatch(order -> USER_PROGRESS_SORT_FIELDS.contains(order.getProperty()));
    }

    private SortPlan buildSortPlan(
            Sort sort,
            Root<BookEntity> root,
            Join<BookEntity, UserBookProgressEntity> progressJoin,
            CriteriaBuilder cb,
            CriteriaQuery<?> query) {
        List<Order> orders = new ArrayList<>();
        List<Selection<?>> projections = new ArrayList<>();
        Map<String, From<?, ?>> joins = new HashMap<>();

        for (Sort.Order sortOrder : sort) {
            String property = sortOrder.getProperty();
            if (USER_PROGRESS_SORT_FIELDS.contains(property)) {
                addUserProgressSort(orders, projections, property, sortOrder.getDirection(), progressJoin, cb);
                continue;
            }

            if (PRIMARY_FILE_NAME_SORT_FIELD.equals(property)) {
                addPrimaryFileNameSort(orders, projections, root, sortOrder.getDirection(), cb, query);
                continue;
            }

            Path<?> path = resolvePath(root, joins, property);
            if (NATURAL_STRING_SORT_FIELDS.contains(property)) {
                addNaturalStringSort(orders, projections, path.as(String.class), cb.isNull(path), sortOrder.getDirection(), cb);
                continue;
            }

            orders.add(sortOrder.isAscending() ? cb.asc(path) : cb.desc(path));
            projections.add(path.alias(nextSortAlias(projections)));
        }

        return new SortPlan(orders, projections);
    }

    private void addPrimaryFileNameSort(
            List<Order> orders,
            List<Selection<?>> projections,
            Root<BookEntity> root,
            Sort.Direction direction,
            CriteriaBuilder cb,
            CriteriaQuery<?> query) {
        Join<BookEntity, BookFileEntity> primaryFileJoin = root.join("bookFiles", JoinType.LEFT);
        primaryFileJoin.on(
                cb.isTrue(primaryFileJoin.get("isBookFormat")),
                cb.equal(primaryFileJoin.get("id"), buildPrimaryBookFileIdSubquery(root, cb, query))
        );

        Expression<String> fileNameExpression = primaryFileJoin.get("fileName").as(String.class);
        addNaturalStringSort(orders, projections, fileNameExpression, cb.isNull(primaryFileJoin.get("fileName")), direction, cb);
    }

        private void addNaturalStringSort(
            List<Order> orders,
            List<Selection<?>> projections,
            Expression<String> expression,
            Predicate isNull,
            Sort.Direction direction,
            CriteriaBuilder cb) {
        Expression<Integer> nullOrder = cb.<Integer>selectCase()
            .when(isNull, direction.isAscending() ? 1 : 0)
            .otherwise(direction.isAscending() ? 0 : 1);
        projections.add(nullOrder.alias(nextSortAlias(projections)));
        orders.add(cb.asc(nullOrder));

        Expression<String> normalizedExpression = cb.coalesce(cb.lower(expression), "");
        Expression<String> currentExpression = normalizedExpression;

        for (int index = 0; index < MAX_NATURAL_SORT_SEGMENTS; index++) {
            Expression<String> prefixExpression = regexReplace(cb, currentExpression, NATURAL_PREFIX_PATTERN, "");
            addOrderedProjection(orders, projections, prefixExpression, direction, cb);

            Expression<String> numberToken = regexSubstr(cb, currentExpression, NATURAL_NUMBER_PATTERN);
            Expression<Integer> hasNumber = cb.<Integer>selectCase()
                .when(cb.isNull(numberToken), 0)
                .otherwise(1);
            addOrderedProjection(orders, projections, hasNumber, direction, cb);

            Expression<String> normalizedNumber = normalizeNumericToken(cb, numberToken);
            Expression<Integer> normalizedNumberLength = cb.function("CHAR_LENGTH", Integer.class, normalizedNumber);
            addOrderedProjection(orders, projections, normalizedNumberLength, direction, cb);
            addOrderedProjection(orders, projections, normalizedNumber, direction, cb);

            currentExpression = remainderAfterFirstNumber(cb, currentExpression, numberToken);
        }

        addOrderedProjection(orders, projections, normalizedExpression, direction, cb);
        }

    private Subquery<Long> buildPrimaryBookFileIdSubquery(
            Root<BookEntity> root,
            CriteriaBuilder cb,
            CriteriaQuery<?> query) {
        Subquery<Integer> minRankSubquery = query.subquery(Integer.class);
        Root<BookFileEntity> minRankFile = minRankSubquery.from(BookFileEntity.class);
        Join<BookFileEntity, BookEntity> minRankBook = minRankFile.join("book");
        Join<BookEntity, LibraryEntity> minRankLibrary = minRankBook.join("library", JoinType.LEFT);
        Expression<Integer> minRankExpression = buildPrimaryFileRank(minRankFile, minRankLibrary, cb);

        minRankSubquery.select(cb.min(minRankExpression));
        minRankSubquery.where(
                cb.equal(minRankBook.get("id"), root.get("id")),
                cb.isTrue(minRankFile.get("isBookFormat"))
        );

        Subquery<Long> primaryFileIdSubquery = query.subquery(Long.class);
        Root<BookFileEntity> primaryFile = primaryFileIdSubquery.from(BookFileEntity.class);
        Join<BookFileEntity, BookEntity> primaryBook = primaryFile.join("book");
        Join<BookEntity, LibraryEntity> primaryLibrary = primaryBook.join("library", JoinType.LEFT);
        Expression<Integer> primaryRankExpression = buildPrimaryFileRank(primaryFile, primaryLibrary, cb);

        primaryFileIdSubquery.select(cb.min(primaryFile.get("id")));
        primaryFileIdSubquery.where(
                cb.equal(primaryBook.get("id"), root.get("id")),
                cb.isTrue(primaryFile.get("isBookFormat")),
                cb.equal(primaryRankExpression, minRankSubquery)
        );

        return primaryFileIdSubquery;
    }

    private Expression<Integer> buildPrimaryFileRank(
            Root<BookFileEntity> fileRoot,
            Join<BookEntity, LibraryEntity> libraryJoin,
            CriteriaBuilder cb) {
        Expression<String> formatPriorityJson = libraryJoin.get("formatPriority").as(String.class);
        Expression<String> bookType = fileRoot.get("bookType").as(String.class);
        CriteriaBuilder.Case<Integer> rankCase = cb.selectCase();

        BookFileType[] supportedTypes = BookFileType.values();
        for (int index = 0; index < supportedTypes.length; index++) {
            Expression<String> priorityAtIndex = cb.function(
                    "JSON_UNQUOTE",
                    String.class,
                    cb.function("JSON_EXTRACT", String.class, formatPriorityJson, cb.literal("$[" + index + "]"))
            );
            rankCase = rankCase.when(cb.equal(priorityAtIndex, bookType), index);
        }

        return rankCase.otherwise(PRIMARY_FILE_FALLBACK_RANK);
    }

    private void addOrderedProjection(
            List<Order> orders,
            List<Selection<?>> projections,
            Expression<?> expression,
            Sort.Direction direction,
            CriteriaBuilder cb) {
        projections.add(expression.alias(nextSortAlias(projections)));
        orders.add(direction.isAscending() ? cb.asc(expression) : cb.desc(expression));
    }

    private Expression<String> regexReplace(
            CriteriaBuilder cb,
            Expression<String> source,
            String pattern,
            String replacement) {
        return cb.function("REGEXP_REPLACE", String.class, source, cb.literal(pattern), cb.literal(replacement));
    }

    private Expression<String> regexSubstr(
            CriteriaBuilder cb,
            Expression<String> source,
            String pattern) {
        return cb.function("REGEXP_SUBSTR", String.class, source, cb.literal(pattern));
    }

    private Expression<String> normalizeNumericToken(
            CriteriaBuilder cb,
            Expression<String> numberToken) {
        Expression<String> strippedNumber = regexReplace(cb, cb.coalesce(numberToken, ""), NATURAL_LEADING_ZERO_PATTERN, "");

        return cb.<String>selectCase()
                .when(cb.isNull(numberToken), "")
                .when(cb.equal(strippedNumber, ""), "0")
                .otherwise(strippedNumber);
    }

    private Expression<String> remainderAfterFirstNumber(
            CriteriaBuilder cb,
            Expression<String> source,
            Expression<String> numberToken) {
        return cb.<String>selectCase()
                .when(cb.isNull(numberToken), "")
                .otherwise(regexReplace(cb, source, NATURAL_REMAINDER_PATTERN, ""));
    }

    private void addUserProgressSort(
            List<Order> orders,
            List<Selection<?>> projections,
            String property,
            Sort.Direction direction,
            Join<BookEntity, UserBookProgressEntity> progressJoin,
            CriteriaBuilder cb) {
        if ("readStatus".equals(property)) {
            Expression<Integer> rank = buildReadStatusRank(progressJoin, cb);
            addNullAwareOrder(orders, projections, rank, cb.isNull(progressJoin.get("id")), direction, cb);
            return;
        }

        Expression<?> expression = progressJoin.get(property);
        addNullAwareOrder(orders, projections, expression, cb.isNull(progressJoin.get(property)), direction, cb);
    }

    private Expression<Integer> buildReadStatusRank(
            Join<BookEntity, UserBookProgressEntity> progressJoin,
            CriteriaBuilder cb) {
        Path<ReadStatus> readStatusPath = progressJoin.get("readStatus");
        return cb.<Integer>selectCase()
            .when(cb.isNull(readStatusPath), 0)
            .when(cb.equal(readStatusPath, ReadStatus.UNREAD), 1)
            .when(cb.equal(readStatusPath, ReadStatus.READING), 2)
            .when(cb.equal(readStatusPath, ReadStatus.RE_READING), 3)
            .when(cb.equal(readStatusPath, ReadStatus.PARTIALLY_READ), 4)
            .when(cb.equal(readStatusPath, ReadStatus.PAUSED), 5)
            .when(cb.equal(readStatusPath, ReadStatus.READ), 6)
            .when(cb.equal(readStatusPath, ReadStatus.ABANDONED), 7)
            .when(cb.equal(readStatusPath, ReadStatus.WONT_READ), 8)
            .otherwise(0);
    }

    private void addNullAwareOrder(
            List<Order> orders,
            List<Selection<?>> projections,
            Expression<?> expression,
            Predicate isNull,
            Sort.Direction direction,
            CriteriaBuilder cb) {
        Expression<Integer> nullOrder = cb.<Integer>selectCase()
            .when(isNull, direction.isAscending() ? 1 : 0)
            .otherwise(direction.isAscending() ? 0 : 1);
        projections.add(nullOrder.alias(nextSortAlias(projections)));
        projections.add(expression.alias(nextSortAlias(projections)));
        orders.add(cb.asc(nullOrder));
        orders.add(direction.isAscending() ? cb.asc(expression) : cb.desc(expression));
    }

    private String nextSortAlias(List<Selection<?>> projections) {
        return "sort_" + projections.size();
    }

    private record SortPlan(List<Order> orders, List<Selection<?>> projections) {
    }

    private Path<?> resolvePath(Root<BookEntity> root, Map<String, From<?, ?>> joins, String propertyPath) {
        if (!propertyPath.contains(".")) {
            return root.get(propertyPath);
        }

        String[] parts = propertyPath.split("\\.");
        From<?, ?> current = root;
        StringBuilder joinPath = new StringBuilder();

        for (int index = 0; index < parts.length - 1; index++) {
            if (!joinPath.isEmpty()) {
                joinPath.append('.');
            }
            joinPath.append(parts[index]);

            String key = joinPath.toString();
            From<?, ?> existing = joins.get(key);
            if (existing == null) {
                existing = current.join(parts[index], JoinType.LEFT);
                joins.put(key, existing);
            }
            current = existing;
        }

        return current.get(parts[parts.length - 1]);
    }

    public Page<Book> getAllBooksByLibraryIdsPaged(Collection<Long> libraryIds, Long userId, Pageable pageable) {
        Page<BookEntity> page = bookRepository.findAllWithSummaryMetadataByLibraryIdsPage(libraryIds, pageable);
        List<BookEntity> filtered = contentRestrictionService.applyRestrictions(page.getContent(), userId);
        List<Book> dtos = filtered.stream()
                .map(book -> mapBookToDto(book, false, userId, true))
                .toList();
        return new PageImpl<>(dtos, pageable, page.getTotalElements());
    }

    @Transactional(readOnly = true)
    public List<BookEntity> getAllFullBookEntitiesBatch(Pageable pageable) {
        List<BookEntity> books = bookRepository.findAllFullBooksBatch(pageable);
        for (BookEntity book : books) {
            if (book.getMetadata() != null) {
                Hibernate.initialize(book.getMetadata().getAuthors());
                Hibernate.initialize(book.getMetadata().getCategories());
                Hibernate.initialize(book.getMetadata().getDescription());
            }
        }
        return books;
    }

    public long countAllNonDeleted() {
        return bookRepository.countNonDeleted();
    }

    @Transactional(readOnly = true)
    public List<BookEntity> findAllWithMetadataByIds(Set<Long> bookIds) {
        List<BookEntity> books = bookRepository.findAllWithMetadataByIds(bookIds);
        for (BookEntity book : books) {
            if (book.getMetadata() != null && book.getMetadata().getComicMetadata() != null) {
                var comicMeta = book.getMetadata().getComicMetadata();
                Hibernate.initialize(comicMeta.getCharacters());
                Hibernate.initialize(comicMeta.getTeams());
                Hibernate.initialize(comicMeta.getLocations());
                Hibernate.initialize(comicMeta.getCreatorMappings());
            }
        }
        return books;
    }

    public List<Book> mapEntitiesToDto(List<BookEntity> entities, boolean includeDescription, Long userId) {
        return mapBooksToDto(entities, includeDescription, userId, !includeDescription);
    }

    public List<BookEntity> getAllFullBookEntities() {
        return bookRepository.findAllFullBooks();
    }

    public void saveAll(List<BookEntity> books) {
        bookRepository.saveAll(books);
    }

    @Transactional
    public void compareAndSaveEmbeddings(Map<Long, String> embeddingJsonByBookId) {
        List<BookEntity> books = bookRepository.findAllWithMetadataByIds(new HashSet<>(embeddingJsonByBookId.keySet()));
        for (BookEntity book : books) {
            String embeddingJson = embeddingJsonByBookId.get(book.getId());
            if (embeddingJson != null && book.getMetadata() != null) {
                if (!Objects.equals(book.getMetadata().getEmbeddingVector(), embeddingJson)) {
                    book.getMetadata().setEmbeddingVector(embeddingJson);
                    book.getMetadata().setEmbeddingUpdatedAt(java.time.Instant.now());
                }
            }
        }
    }

    @Transactional
    public void saveRecommendationsInBatches(Map<Long, Set<BookRecommendationLite>> recommendations, int batchSize) {
        List<Long> bookIds = new ArrayList<>(recommendations.keySet());
        for (int i = 0; i < bookIds.size(); i += batchSize) {
            List<Long> batchIds = bookIds.subList(i, Math.min(i + batchSize, bookIds.size()));
            List<BookEntity> batch = bookRepository.findAllById(batchIds);
            for (BookEntity book : batch) {
                Set<BookRecommendationLite> recs = recommendations.get(book.getId());
                if (recs != null) {
                    book.setSimilarBooksJson(recs);
                }
            }
            bookRepository.saveAll(batch);
        }
    }

    private List<Book> mapBooksToDto(List<BookEntity> books, boolean includeDescription, Long userId, boolean stripForListView) {
        return books.stream()
                .map(book -> mapBookToDto(book, includeDescription, userId, stripForListView))
                .collect(Collectors.toList());
    }

    AppBookGridSummary mapBookToGridSummary(BookEntity bookEntity) {
        BookFileEntity primaryFile = bookMapperV2.getPrimaryBookFile(bookEntity.getBookFiles());
        BookFile primaryFileDto = bookMapperV2.toBookFile(primaryFile);

        AppBookGridSummary.AppBookGridSummaryBuilder builder = AppBookGridSummary.builder()
                .id(bookEntity.getId())
                .fileType(bookEntity.getFileType())
                .isPhysical(bookEntity.getIsPhysical())
                .addedOn(bookEntity.getAddedOn())
                .markedForAiSearch(Boolean.TRUE.equals(bookEntity.getMarkedForAiSearch()));

        if (primaryFileDto != null) {
            builder.fileName(primaryFileDto.getFileName())
                    .primaryFileType(primaryFileDto.getBookType() != null ? primaryFileDto.getBookType().name() : null)
                    .primaryFileExtension(primaryFileDto.getExtension())
                    .primaryFileSizeKb(primaryFileDto.getFileSizeKb());
        }

        if (bookEntity.getMetadata() != null) {
            var m = bookEntity.getMetadata();
            builder.title(m.getTitle())
                    .subtitle(m.getSubtitle())
                    .authors(m.getAuthors() != null ? m.getAuthors().stream().map(a -> a.getName()).toList() : null)
                    .publisher(m.getPublisher())
                    .publishedDate(m.getPublishedDate())
                    .seriesName(m.getSeriesName())
                    .seriesNumber(m.getSeriesNumber())
                    .isbn13(m.getIsbn13())
                    .isbn10(m.getIsbn10())
                    .pageCount(m.getPageCount())
                    .language(m.getLanguage())
                    .categories(m.getCategories() != null ? new ArrayList<>(m.getCategories().stream().map(c -> c.getName()).collect(Collectors.toSet())) : null)
                    .amazonRating(m.getAmazonRating())
                    .amazonReviewCount(m.getAmazonReviewCount())
                    .goodreadsRating(m.getGoodreadsRating())
                    .goodreadsReviewCount(m.getGoodreadsReviewCount())
                    .hardcoverRating(m.getHardcoverRating())
                    .hardcoverReviewCount(m.getHardcoverReviewCount())
                    .ranobedbRating(m.getRanobedbRating())
                    .coverUpdatedOn(m.getCoverUpdatedOn())
                    .audiobookCoverUpdatedOn(m.getAudiobookCoverUpdatedOn());

            if (m.getComicMetadata() != null) {
                builder.comicIssueNumber(m.getComicMetadata().getIssueNumber());
            }
        }

        return builder.build();
    }

    private Book mapBookToDto(BookEntity bookEntity, boolean includeDescription, Long userId, boolean stripForListView) {
        Book dto = stripForListView
                ? bookMapperV2.toSummaryDTO(bookEntity)
                : bookMapperV2.toDTO(bookEntity);

        if (includeDescription && dto.getMetadata() != null && bookEntity.getMetadata() != null) {
            dto.getMetadata().setDescription(bookEntity.getMetadata().getDescription());
        }

        if (dto.getShelves() != null && userId != null) {
            dto.setShelves(dto.getShelves().stream()
                    .filter(shelf -> userId.equals(shelf.getUserId()))
                    .collect(Collectors.toSet()));
        }

        if (stripForListView) {
            stripFieldsForListView(dto);
        }

        return dto;
    }

    private void stripFieldsForListView(Book dto) {
        BookMetadata m = dto.getMetadata();
        if (m != null) {
            // Compute allMetadataLocked before stripping lock flags
            m.setAllMetadataLocked(computeAllMetadataLocked(m));

            // Strip lock flags
            m.setTitleLocked(null);
            m.setSubtitleLocked(null);
            m.setPublisherLocked(null);
            m.setPublishedDateLocked(null);
            m.setDescriptionLocked(null);
            m.setSeriesNameLocked(null);
            m.setSeriesNumberLocked(null);
            m.setSeriesTotalLocked(null);
            m.setIsbn13Locked(null);
            m.setIsbn10Locked(null);
            m.setAsinLocked(null);
            m.setGoodreadsIdLocked(null);
            m.setComicvineIdLocked(null);
            m.setHardcoverIdLocked(null);
            m.setHardcoverBookIdLocked(null);
            m.setDoubanIdLocked(null);
            m.setGoogleIdLocked(null);
            m.setPageCountLocked(null);
            m.setLanguageLocked(null);
            m.setAmazonRatingLocked(null);
            m.setAmazonReviewCountLocked(null);
            m.setGoodreadsRatingLocked(null);
            m.setGoodreadsReviewCountLocked(null);
            m.setHardcoverRatingLocked(null);
            m.setHardcoverReviewCountLocked(null);
            m.setDoubanRatingLocked(null);
            m.setDoubanReviewCountLocked(null);
            m.setLubimyczytacIdLocked(null);
            m.setLubimyczytacRatingLocked(null);
            m.setRanobedbIdLocked(null);
            m.setRanobedbRatingLocked(null);
            m.setAudibleIdLocked(null);
            m.setAudibleRatingLocked(null);
            m.setAudibleReviewCountLocked(null);
            m.setExternalUrlLocked(null);
            m.setCoverLocked(null);
            m.setAudiobookCoverLocked(null);
            m.setAuthorsLocked(null);
            m.setCategoriesLocked(null);
            m.setMoodsLocked(null);
            m.setTagsLocked(null);
            m.setReviewsLocked(null);
            m.setNarratorLocked(null);
            m.setAbridgedLocked(null);
            m.setAgeRatingLocked(null);
            m.setContentRatingLocked(null);

            // Strip external IDs
            m.setAsin(null);
            m.setGoodreadsId(null);
            m.setComicvineId(null);
            m.setHardcoverId(null);
            m.setHardcoverBookId(null);
            m.setGoogleId(null);
            m.setLubimyczytacId(null);
            m.setRanobedbId(null);
            m.setAudibleId(null);
            m.setDoubanId(null);

            // Strip unused detail fields
            m.setSeriesTotal(null);
            m.setAbridged(null);
            m.setExternalUrl(null);
            m.setThumbnailUrl(null);
            m.setProvider(null);
            if (m.getAudiobookMetadata() != null) {
                m.getAudiobookMetadata().setChapters(null);
            }
            m.setBookReviews(null);

            // Strip unused ratings
            m.setDoubanRating(null);
            m.setDoubanReviewCount(null);
            m.setAudibleRating(null);
            m.setAudibleReviewCount(null);
            m.setLubimyczytacRating(null);

            // Strip empty metadata collections
            if (m.getMoods() != null && m.getMoods().isEmpty()) m.setMoods(null);
            if (m.getTags() != null && m.getTags().isEmpty()) m.setTags(null);
            if (m.getAuthors() != null && m.getAuthors().isEmpty()) m.setAuthors(null);
            if (m.getCategories() != null && m.getCategories().isEmpty()) m.setCategories(null);

            // Strip ComicMetadata fields
            ComicMetadata cm = m.getComicMetadata();
            if (cm != null) {
                // Strip comic lock flags
                cm.setIssueNumberLocked(null);
                cm.setVolumeNameLocked(null);
                cm.setVolumeNumberLocked(null);
                cm.setStoryArcLocked(null);
                cm.setStoryArcNumberLocked(null);
                cm.setAlternateSeriesLocked(null);
                cm.setAlternateIssueLocked(null);
                cm.setImprintLocked(null);
                cm.setFormatLocked(null);
                cm.setBlackAndWhiteLocked(null);
                cm.setMangaLocked(null);
                cm.setReadingDirectionLocked(null);
                cm.setWebLinkLocked(null);
                cm.setNotesLocked(null);
                cm.setCreatorsLocked(null);
                cm.setPencillersLocked(null);
                cm.setInkersLocked(null);
                cm.setColoristsLocked(null);
                cm.setLetterersLocked(null);
                cm.setCoverArtistsLocked(null);
                cm.setEditorsLocked(null);
                cm.setCharactersLocked(null);
                cm.setTeamsLocked(null);
                cm.setLocationsLocked(null);

                // Strip non-filter detail fields
                cm.setIssueNumber(null);
                cm.setVolumeName(null);
                cm.setVolumeNumber(null);
                cm.setStoryArc(null);
                cm.setStoryArcNumber(null);
                cm.setAlternateSeries(null);
                cm.setAlternateIssue(null);
                cm.setImprint(null);
                cm.setFormat(null);
                cm.setBlackAndWhite(null);
                cm.setManga(null);
                cm.setReadingDirection(null);
                cm.setWebLink(null);
                cm.setNotes(null);
            }
        }

        // Strip empty book-level collections
        if (dto.getAlternativeFormats() != null && dto.getAlternativeFormats().isEmpty()) dto.setAlternativeFormats(null);
        if (dto.getSupplementaryFiles() != null && dto.getSupplementaryFiles().isEmpty()) dto.setSupplementaryFiles(null);
    }

    private boolean computeAllMetadataLocked(BookMetadata m) {
        Boolean[] bookLocks = {
                m.getTitleLocked(), m.getSubtitleLocked(), m.getPublisherLocked(),
                m.getPublishedDateLocked(), m.getDescriptionLocked(), m.getSeriesNameLocked(),
                m.getSeriesNumberLocked(), m.getSeriesTotalLocked(), m.getIsbn13Locked(),
                m.getIsbn10Locked(), m.getAsinLocked(), m.getGoodreadsIdLocked(),
                m.getComicvineIdLocked(), m.getHardcoverIdLocked(), m.getHardcoverBookIdLocked(),
                m.getDoubanIdLocked(), m.getGoogleIdLocked(), m.getPageCountLocked(),
                m.getLanguageLocked(), m.getAmazonRatingLocked(), m.getAmazonReviewCountLocked(),
                m.getGoodreadsRatingLocked(), m.getGoodreadsReviewCountLocked(),
                m.getHardcoverRatingLocked(), m.getHardcoverReviewCountLocked(),
                m.getDoubanRatingLocked(), m.getDoubanReviewCountLocked(),
                m.getLubimyczytacIdLocked(), m.getLubimyczytacRatingLocked(),
                m.getRanobedbIdLocked(), m.getRanobedbRatingLocked(),
                m.getAudibleIdLocked(), m.getAudibleRatingLocked(), m.getAudibleReviewCountLocked(),
                m.getExternalUrlLocked(), m.getCoverLocked(), m.getAudiobookCoverLocked(),
                m.getAuthorsLocked(), m.getCategoriesLocked(), m.getMoodsLocked(),
                m.getTagsLocked(), m.getReviewsLocked(), m.getNarratorLocked(),
                m.getAbridgedLocked(), m.getAgeRatingLocked(), m.getContentRatingLocked()
        };

        boolean hasAnyLock = false;
        for (Boolean lock : bookLocks) {
            if (Boolean.TRUE.equals(lock)) {
                hasAnyLock = true;
            } else {
                return false;
            }
        }
        return hasAnyLock;
    }
}
