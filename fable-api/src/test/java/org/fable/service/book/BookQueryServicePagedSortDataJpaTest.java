package org.fable.service.book;

import jakarta.persistence.EntityManager;
import org.fable.app.dto.AppBookGridSummary;
import org.fable.mapper.v2.BookMapperV2;
import org.fable.model.dto.BookFile;
import org.fable.model.entity.BookEntity;
import org.fable.model.entity.BookFileEntity;
import org.fable.model.entity.BookMetadataEntity;
import org.fable.model.entity.LibraryEntity;
import org.fable.model.entity.LibraryPathEntity;
import org.fable.model.enums.BookFileType;
import org.fable.FableApplication;
import org.fable.config.BookmarkProperties;
import org.fable.repository.BookRepository;
import org.fable.service.restriction.ContentRestrictionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@SpringBootTest(classes = {
        FableApplication.class,
        BookQueryServicePagedSortDataJpaTest.TestConfig.class,
})
@ActiveProfiles("test")
@Transactional
public class BookQueryServicePagedSortDataJpaTest {

    @TestConfiguration
    static class TestConfig {

        @Bean
        @Primary
        RestTemplate testRestTemplate() {
            return new RestTemplate();
        }

        @Bean
        @Primary
        BookmarkProperties bookmarkProperties() {
            return new BookmarkProperties();
        }
    }

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private BookRepository bookRepository;

    private BookQueryService service;

    @BeforeEach
    void setUp() {
        registerHelperAliases(entityManager);

        BookMapperV2 bookMapperV2 = mock(BookMapperV2.class);
        when(bookMapperV2.getPrimaryBookFile(any())).thenAnswer(invocation -> {
            List<BookFileEntity> files = invocation.getArgument(0);
            return files != null && !files.isEmpty() ? files.get(0) : null;
        });
        when(bookMapperV2.toBookFile(any(BookFileEntity.class))).thenAnswer(invocation -> {
            BookFileEntity entity = invocation.getArgument(0);
            return BookFile.builder()
                    .fileName(entity.getFileName())
                    .bookType(entity.getBookType())
                    .extension(entity.getFileName() != null && entity.getFileName().contains(".")
                            ? entity.getFileName().substring(entity.getFileName().lastIndexOf('.') + 1)
                            : null)
                    .build();
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

        Page<AppBookGridSummary> page = service.findAllPaged(null, PageRequest.of(0, 10, Sort.by(Sort.Direction.ASC, "fileName")), null);

        assertThat(page.getContent()).extracting(AppBookGridSummary::getId)
                .containsExactly(alphaBookId, zuluBookId);
    }

    @Test
    void findAllPaged_sortsPrimaryFileNameDescending() {
        long alphaBookId = persistBookWithPrimaryFile("Alpha.cbz");
        long zuluBookId = persistBookWithPrimaryFile("Zulu.cbz");

        Page<AppBookGridSummary> page = service.findAllPaged(null, PageRequest.of(0, 10, Sort.by(Sort.Direction.DESC, "fileName")), null);

        assertThat(page.getContent()).extracting(AppBookGridSummary::getId)
                .containsExactly(zuluBookId, alphaBookId);
    }

    @Test
    void findAllPaged_sortsPrimaryFileNameNaturallyAscending() {
        long issue10BookId = persistBookWithPrimaryFile("Issue 10.cbz");
        long issue02BookId = persistBookWithPrimaryFile("Issue 02.cbz");
        long issue01BookId = persistBookWithPrimaryFile("Issue 01.cbz");

        Page<AppBookGridSummary> page = service.findAllPaged(null, PageRequest.of(0, 10, Sort.by(Sort.Direction.ASC, "fileName")), null);

        assertThat(page.getContent()).extracting(AppBookGridSummary::getId)
                .containsExactly(issue01BookId, issue02BookId, issue10BookId);
    }

    @Test
    void findAllPaged_sortsMetadataTitleNaturallyAscending() {
        long title10BookId = persistBookWithPrimaryFileAndTitle("Archive 10", "archive-10.cbz");
        long title02BookId = persistBookWithPrimaryFileAndTitle("Archive 02", "archive-02.cbz");
        long title01BookId = persistBookWithPrimaryFileAndTitle("Archive 01", "archive-01.cbz");

        Page<AppBookGridSummary> page = service.findAllPaged(null, PageRequest.of(0, 10, Sort.by(Sort.Direction.ASC, "metadata.title")), null);

        assertThat(page.getContent()).extracting(AppBookGridSummary::getId)
                .containsExactly(title01BookId, title02BookId, title10BookId);
    }

    private long persistBookWithPrimaryFile(String fileName) {
        return persistBookWithPrimaryFileAndTitle(null, fileName);
    }

    private long persistBookWithPrimaryFileAndTitle(String title, String fileName) {
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

        BookMetadataEntity metadata = BookMetadataEntity.builder()
            .book(book)
            .title(title != null ? title : fileName)
            .build();
        entityManager.persist(metadata);
        book.setMetadata(metadata);

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

        private static void registerHelperAliases(EntityManager entityManager) {
        entityManager.createNativeQuery(
                "CREATE ALIAS IF NOT EXISTS JSON_EXTRACT FOR \"org.fable.service.book.BookQueryServicePagedSortDataJpaTest.jsonExtract\""
        ).executeUpdate();
        entityManager.createNativeQuery(
                "CREATE ALIAS IF NOT EXISTS JSON_UNQUOTE FOR \"org.fable.service.book.BookQueryServicePagedSortDataJpaTest.jsonUnquote\""
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

    public static String regexSubstr(String value, String pattern) {
        if (value == null || pattern == null) {
            return null;
        }

        Matcher matcher = Pattern.compile(pattern).matcher(value);
        return matcher.find() ? matcher.group() : null;
    }

    public static String regexReplace(String value, String pattern, String replacement) {
        if (value == null || pattern == null || replacement == null) {
            return value;
        }

        return value.replaceAll(pattern, replacement);
    }
}