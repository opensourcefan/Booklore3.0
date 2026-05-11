package org.booklore.service.book;

import jakarta.persistence.EntityManager;
import org.booklore.mapper.v2.BookMapperV2;
import org.booklore.model.dto.Book;
import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookFileEntity;
import org.booklore.model.entity.LibraryEntity;
import org.booklore.model.entity.LibraryPathEntity;
import org.booklore.model.enums.BookFileType;
import org.booklore.BookloreApplication;
import org.booklore.repository.BookRepository;
import org.booklore.service.restriction.ContentRestrictionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@SpringBootTest(classes = BookloreApplication.class)
@ActiveProfiles("test")
@Transactional
public class BookQueryServicePagedSortDataJpaTest {

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private BookRepository bookRepository;

    private BookQueryService service;

    @BeforeEach
    void setUp() {
        registerJsonAliases(entityManager);

        BookMapperV2 bookMapperV2 = mock(BookMapperV2.class);
        when(bookMapperV2.toDTO(any(BookEntity.class))).thenAnswer(invocation -> {
            BookEntity entity = invocation.getArgument(0);
            return Book.builder().id(entity.getId()).build();
        });

        service = new BookQueryService(
                bookRepository,
                bookMapperV2,
                mock(ContentRestrictionService.class),
                entityManager
        );
    }

    @Test
    void findAllPaged_sortsPrimaryFileNameAscending() {
        long alphaBookId = persistBookWithPrimaryFile("Alpha.cbz");
        long zuluBookId = persistBookWithPrimaryFile("Zulu.cbz");

        Page<Book> page = service.findAllPaged(null, PageRequest.of(0, 10, Sort.by(Sort.Direction.ASC, "fileName")), null);

        assertThat(page.getContent()).extracting(Book::getId)
                .containsExactly(alphaBookId, zuluBookId);
    }

    @Test
    void findAllPaged_sortsPrimaryFileNameDescending() {
        long alphaBookId = persistBookWithPrimaryFile("Alpha.cbz");
        long zuluBookId = persistBookWithPrimaryFile("Zulu.cbz");

        Page<Book> page = service.findAllPaged(null, PageRequest.of(0, 10, Sort.by(Sort.Direction.DESC, "fileName")), null);

        assertThat(page.getContent()).extracting(Book::getId)
                .containsExactly(zuluBookId, alphaBookId);
    }

    private long persistBookWithPrimaryFile(String fileName) {
        LibraryEntity library = LibraryEntity.builder()
                .name("Test Library " + fileName)
                .watch(false)
                .formatPriority(List.of(BookFileType.CBX, BookFileType.EPUB))
                .build();
        entityManager.persist(library);

        LibraryPathEntity libraryPath = LibraryPathEntity.builder()
                .library(library)
                .path("/tmp/" + fileName)
                .build();
        entityManager.persist(libraryPath);

        BookEntity book = BookEntity.builder()
                .library(library)
                .libraryPath(libraryPath)
                .addedOn(Instant.parse("2026-01-01T00:00:00Z"))
                .build();
        entityManager.persist(book);

        BookFileEntity primaryFile = BookFileEntity.builder()
                .book(book)
                .fileName(fileName)
                .fileSubPath("")
                .isBookFormat(true)
                .bookType(BookFileType.CBX)
                .addedOn(Instant.parse("2026-01-01T00:00:00Z"))
                .build();
        entityManager.persist(primaryFile);

        book.setBookFiles(List.of(primaryFile));
        library.setLibraryPaths(List.of(libraryPath));

        entityManager.flush();
        entityManager.clear();
        return book.getId();
    }

    private static void registerJsonAliases(EntityManager entityManager) {
        entityManager.createNativeQuery(
                "CREATE ALIAS IF NOT EXISTS JSON_EXTRACT FOR \"org.booklore.service.book.BookQueryServicePagedSortDataJpaTest.jsonExtract\""
        ).executeUpdate();
        entityManager.createNativeQuery(
                "CREATE ALIAS IF NOT EXISTS JSON_UNQUOTE FOR \"org.booklore.service.book.BookQueryServicePagedSortDataJpaTest.jsonUnquote\""
        ).executeUpdate();
    }

    public static String jsonExtract(String json, String path) {
        if (json == null || path == null || !path.startsWith("$[") || !path.endsWith("]")) {
            return null;
        }

        int index = Integer.parseInt(path.substring(2, path.length() - 1));
        String normalized = json.trim();
        if (normalized.length() < 2 || normalized.charAt(0) != '[' || normalized.charAt(normalized.length() - 1) != ']') {
            return null;
        }

        String body = normalized.substring(1, normalized.length() - 1).trim();
        if (body.isEmpty()) {
            return null;
        }

        String[] parts = body.split(",");
        if (index < 0 || index >= parts.length) {
            return null;
        }

        return jsonUnquote(parts[index].trim());
    }

    public static String jsonUnquote(String value) {
        if (value == null) {
            return null;
        }

        String trimmed = value.trim();
        if (trimmed.length() >= 2 && trimmed.charAt(0) == '"' && trimmed.charAt(trimmed.length() - 1) == '"') {
            return trimmed.substring(1, trimmed.length() - 1);
        }

        return trimmed;
    }
}