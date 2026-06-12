package org.fable.service.book;

import org.fable.exception.ApiError;
import org.fable.exception.APIException;
import org.fable.mapper.BookMapper;
import org.fable.service.event.aop.BroadcastBookUpdate;
import org.fable.model.dto.Book;
import org.fable.model.dto.BookMetadata;
import org.fable.model.dto.request.CreatePhysicalBookRequest;
import org.fable.model.dto.sidecar.SidecarMetadata;
import org.fable.model.entity.AuthorEntity;
import org.fable.model.entity.BookEntity;
import org.fable.model.entity.BookMetadataEntity;
import org.fable.model.entity.CategoryEntity;
import org.fable.model.entity.LibraryEntity;
import org.fable.model.entity.LibraryPathEntity;
import org.fable.repository.AuthorRepository;
import org.fable.repository.BookRepository;
import org.fable.repository.CategoryRepository;
import org.fable.repository.LibraryRepository;
import org.fable.service.metadata.sidecar.SidecarMetadataReader;
import org.fable.service.metadata.sidecar.SidecarMetadataMapper;
import org.fable.service.metadata.sidecar.SidecarMetadataWriter;
import org.fable.service.metadata.sidecar.SidecarPathResolver;
import org.fable.util.BookCoverUtils;
import org.fable.util.FileService;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.nio.file.Files;
import java.nio.file.Path;
import java.io.IOException;

@Slf4j
@Service
@AllArgsConstructor
public class PhysicalBookService {

    private final BookRepository bookRepository;
    private final LibraryRepository libraryRepository;
    private final AuthorRepository authorRepository;
    private final CategoryRepository categoryRepository;
    private final BookMapper bookMapper;
    private final FileService fileService;
    private final SidecarMetadataWriter sidecarMetadataWriter;
    private final SidecarMetadataReader sidecarMetadataReader;
    private final SidecarMetadataMapper sidecarMetadataMapper;
    private final SidecarPathResolver sidecarPathResolver;

    @BroadcastBookUpdate
    @Transactional
    public Book createPhysicalBook(CreatePhysicalBookRequest request) {
        LibraryEntity library = libraryRepository.findById(request.getLibraryId())
                .orElseThrow(() -> new APIException("Library not found with id: " + request.getLibraryId(), HttpStatus.NOT_FOUND));
        LibraryPathEntity libraryPath = resolveLibraryPath(library, request.getLibraryPathId());
        ensureNoConflictingPhysicalBook(library, libraryPath, request);

        BookEntity bookEntity = BookEntity.builder()
                .library(library)
            .libraryPath(libraryPath)
                .isPhysical(true)
                .addedOn(Instant.now())
                .scannedOn(Instant.now())
                .bookFiles(new ArrayList<>())
                .build();

        BookMetadataEntity metadata = BookMetadataEntity.builder()
                .book(bookEntity)
                .title(request.getTitle())
                .description(request.getDescription())
                .publisher(request.getPublisher())
                .publishedDate(parsePublishedDate(request.getPublishedDate()))
                .language(request.getLanguage())
                .pageCount(request.getPageCount())
                .isbn13(extractIsbn13(request.getIsbn()))
                .isbn10(extractIsbn10(request.getIsbn()))
                .build();

        bookEntity.setMetadata(metadata);

        if (request.getAuthors() != null && !request.getAuthors().isEmpty()) {
            addAuthorsToBook(new ArrayList<>(request.getAuthors()), bookEntity);
        }

        if (request.getCategories() != null && !request.getCategories().isEmpty()) {
            addCategoriesToBook(new HashSet<>(request.getCategories()), bookEntity);
        }

        BookEntity savedBook = bookRepository.save(bookEntity);
        log.info("Created physical book '{}' in library {} with id {}", request.getTitle(), library.getName(), savedBook.getId());

        if (request.getThumbnailUrl() != null && !request.getThumbnailUrl().isBlank()) {
            try {
                fileService.createThumbnailFromUrl(savedBook.getId(), request.getThumbnailUrl());
                savedBook.getMetadata().setCoverUpdatedOn(Instant.now());
                savedBook.setBookCoverHash(BookCoverUtils.generateCoverHash());
                savedBook = bookRepository.save(savedBook);
            } catch (Exception ex) {
                log.warn("Failed to download cover for physical book {}: {}", savedBook.getId(), ex.getMessage());
            }
        }

        sidecarMetadataWriter.writeSidecarMetadata(savedBook);

        return bookMapper.toBook(savedBook);
    }

    @Transactional
    public int importPhysicalBooksFromSidecars(LibraryEntity libraryEntity, List<LibraryPathEntity> libraryPaths) {
        int imported = 0;

        for (LibraryPathEntity libraryPath : libraryPaths) {
            Path libraryDirectory = Path.of(libraryPath.getPath());
            if (!Files.isDirectory(libraryDirectory)) {
                continue;
            }

            try (var files = Files.list(libraryDirectory)) {
                List<Path> physicalSidecars = files
                        .filter(Files::isRegularFile)
                        .filter(sidecarPathResolver::isPhysicalSidecarFile)
                        .sorted()
                        .toList();

                for (Path sidecarPath : physicalSidecars) {
                    Optional<SidecarMetadata> sidecar = sidecarMetadataReader.readSidecarMetadataFromFile(sidecarPath);
                    if (sidecar.isEmpty()) {
                        continue;
                    }
                    if (sidecar.get().getBookId() != null && bookRepository.existsById(sidecar.get().getBookId())) {
                        log.debug("Skipping physical sidecar {} because book with ID {} already exists.", sidecarPath.getFileName(), sidecar.get().getBookId());
                        continue;
                    }

                    CreatePhysicalBookRequest request = toCreateRequest(libraryEntity.getId(), libraryPath.getId(), sidecar.get());
                    if (request == null) {
                        continue;
                    }

                    if (libraryAlreadyContainsMatchingBook(libraryEntity.getId(), request)) {
                        log.debug("Skipping physical sidecar {} because a matching active book already exists in library {}",
                                sidecarPath.getFileName(), libraryEntity.getName());
                        continue;
                    }

                    try {
                        createPhysicalBook(request);
                        imported++;
                    } catch (APIException ex) {
                        if (ex.getStatus() == HttpStatus.CONFLICT) {
                            log.debug("Skipping already-imported physical sidecar {}", sidecarPath.getFileName());
                            continue;
                        }
                        throw ex;
                    }
                }
            } catch (IOException ex) {
                log.warn("Failed to inspect physical sidecars for library path {}: {}", libraryDirectory, ex.getMessage());
            }
        }

        if (imported > 0) {
            log.info("Imported {} physical books from directory sidecars for library {}", imported, libraryEntity.getName());
        }

        return imported;
    }

    private boolean libraryAlreadyContainsMatchingBook(Long libraryId, CreatePhysicalBookRequest request) {
        String requestIsbn13 = extractIsbn13(request.getIsbn());
        String requestIsbn10 = extractIsbn10(request.getIsbn());
        String requestTitle = normalizeText(request.getTitle());
        Set<String> requestAuthors = normalizeAuthors(request.getAuthors());

        return bookRepository.findAllForDuplicateDetectionIncludingRemoved(libraryId).stream()
                .anyMatch(book -> matchesPhysicalDuplicate(book, requestIsbn13, requestIsbn10, requestTitle, requestAuthors));
    }

    private void ensureNoConflictingPhysicalBook(LibraryEntity library, LibraryPathEntity libraryPath, CreatePhysicalBookRequest request) {
        String requestIsbn13 = extractIsbn13(request.getIsbn());
        String requestIsbn10 = extractIsbn10(request.getIsbn());
        String requestTitle = normalizeText(request.getTitle());
        Set<String> requestAuthors = normalizeAuthors(request.getAuthors());

        List<BookEntity> existingPhysicalBooks = bookRepository
                .findActivePhysicalBooksByLibraryIdAndLibraryPathId(library.getId(), libraryPath.getId());

        boolean duplicateExists = existingPhysicalBooks.stream()
                .anyMatch(book -> matchesPhysicalDuplicate(book, requestIsbn13, requestIsbn10, requestTitle, requestAuthors));

        if (duplicateExists) {
            throw new APIException(
                    "A matching physical book already exists in this library directory.",
                    HttpStatus.CONFLICT);
        }
    }

    private boolean matchesPhysicalDuplicate(
            BookEntity existingBook,
            String requestIsbn13,
            String requestIsbn10,
            String requestTitle,
            Set<String> requestAuthors) {
        BookMetadataEntity metadata = existingBook.getMetadata();
        if (metadata == null) {
            return false;
        }

        if (requestIsbn13 != null && requestIsbn13.equals(metadata.getIsbn13())) {
            return true;
        }
        if (requestIsbn10 != null && requestIsbn10.equals(metadata.getIsbn10())) {
            return true;
        }

        if (requestTitle == null) {
            return false;
        }

        String existingTitle = normalizeText(metadata.getTitle());
        if (!requestTitle.equals(existingTitle)) {
            return false;
        }

        Set<String> existingAuthors = normalizeAuthors(metadata.getAuthors() == null
                ? Collections.emptyList()
                : metadata.getAuthors().stream().map(AuthorEntity::getName).toList());

        if (requestAuthors.isEmpty() || existingAuthors.isEmpty()) {
            return true;
        }

        return requestAuthors.stream().anyMatch(existingAuthors::contains);
    }

    private LibraryPathEntity resolveLibraryPath(LibraryEntity library, Long requestedLibraryPathId) {
        List<LibraryPathEntity> libraryPaths = library.getLibraryPaths();
        if (libraryPaths == null || libraryPaths.isEmpty()) {
            throw new APIException("Library has no library paths configured", HttpStatus.BAD_REQUEST);
        }

        if (requestedLibraryPathId != null) {
            return libraryPaths.stream()
                    .filter(path -> requestedLibraryPathId.equals(path.getId()))
                    .findFirst()
                    .orElseThrow(() -> new APIException(
                            "Library path " + requestedLibraryPathId + " does not belong to library " + library.getId(),
                            HttpStatus.BAD_REQUEST));
        }

        return libraryPaths.getFirst();
    }

    private LocalDate parsePublishedDate(String publishedDate) {
        if (publishedDate == null || publishedDate.isBlank()) {
            return null;
        }
        String trimmed = publishedDate.trim();
        // Try full date format first (YYYY-MM-DD)
        try {
            return LocalDate.parse(trimmed, DateTimeFormatter.ISO_LOCAL_DATE);
        } catch (DateTimeParseException ignored) {}
        // Try year only format (YYYY)
        try {
            int year = Integer.parseInt(trimmed);
            return LocalDate.of(year, 1, 1);
        } catch (NumberFormatException ignored) {}
        return null;
    }

    private String extractIsbn13(String isbn) {
        if (isbn == null) return null;
        String cleaned = isbn.replaceAll("[^0-9X]", "");
        return cleaned.length() == 13 ? cleaned : null;
    }

    private String extractIsbn10(String isbn) {
        if (isbn == null) return null;
        String cleaned = isbn.replaceAll("[^0-9X]", "");
        return cleaned.length() == 10 ? cleaned : null;
    }

    private void addAuthorsToBook(List<String> authors, BookEntity bookEntity) {
        if (bookEntity.getMetadata().getAuthors() == null) {
            bookEntity.getMetadata().setAuthors(new ArrayList<>());
        }
        authors.stream()
                .map(authorName -> truncate(authorName, 255))
                .map(authorName -> authorRepository.findByName(authorName)
                        .orElseGet(() -> authorRepository.save(AuthorEntity.builder().name(authorName).build())))
                .forEach(authorEntity -> bookEntity.getMetadata().getAuthors().add(authorEntity));
        bookEntity.getMetadata().updateSearchText();
    }

    private void addCategoriesToBook(Set<String> categories, BookEntity bookEntity) {
        if (bookEntity.getMetadata().getCategories() == null) {
            bookEntity.getMetadata().setCategories(new HashSet<>());
        }
        categories.stream()
                .map(cat -> truncate(cat, 255))
                .map(truncated -> categoryRepository.findByName(truncated)
                        .orElseGet(() -> categoryRepository.save(CategoryEntity.builder().name(truncated).build())))
                .forEach(catEntity -> bookEntity.getMetadata().getCategories().add(catEntity));
    }

    @BroadcastBookUpdate
    @Transactional
    public Book togglePhysicalFlag(long bookId, boolean physical) {
        BookEntity book = bookRepository.findById(bookId)
                .orElseThrow(() -> ApiError.BOOK_NOT_FOUND.createException(bookId));
        book.setIsPhysical(physical);
        bookRepository.save(book);

        if (!book.hasFiles()) {
            if (physical) {
                sidecarMetadataWriter.writeSidecarMetadata(book);
            } else {
                sidecarMetadataWriter.deleteSidecarFiles(book);
            }
        }

        log.info("Book {} physical flag set to {}", bookId, physical);
        return bookMapper.toBook(book);
    }

    private CreatePhysicalBookRequest toCreateRequest(Long libraryId, Long libraryPathId, SidecarMetadata sidecarMetadata) {
        BookMetadata metadata = sidecarMetadataMapper.toBookMetadata(sidecarMetadata);
        if (metadata == null || (metadata.getTitle() == null || metadata.getTitle().isBlank()) && (metadata.getIsbn13() == null || metadata.getIsbn13().isBlank())) {
            return null;
        }

        String isbn = metadata.getIsbn13() != null ? metadata.getIsbn13() : metadata.getIsbn10();
        return CreatePhysicalBookRequest.builder()
                .libraryId(libraryId)
                .libraryPathId(libraryPathId)
                .isbn(isbn)
                .title(metadata.getTitle())
                .authors(metadata.getAuthors())
                .description(metadata.getDescription())
                .publisher(metadata.getPublisher())
                .publishedDate(metadata.getPublishedDate() != null ? metadata.getPublishedDate().toString() : null)
                .language(metadata.getLanguage())
                .pageCount(metadata.getPageCount())
                .categories(metadata.getCategories() != null ? new ArrayList<>(metadata.getCategories()) : null)
                .build();
    }

    private String truncate(String input, int maxLength) {
        if (input == null) return null;
        return input.length() <= maxLength ? input : input.substring(0, maxLength);
    }

    private String normalizeText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        String normalized = value.toLowerCase(Locale.ROOT)
                .replaceAll("[^\\p{L}\\p{Nd}]+", " ")
                .trim()
                .replaceAll("\\s+", " ");
        return normalized.isEmpty() ? null : normalized;
    }

    private Set<String> normalizeAuthors(List<String> authors) {
        if (authors == null || authors.isEmpty()) {
            return Collections.emptySet();
        }

        return authors.stream()
                .flatMap(author -> Arrays.stream(author.split(",")))
                .map(this::normalizeText)
                .filter(value -> value != null && !value.isBlank())
                .collect(Collectors.toCollection(HashSet::new));
    }
}
