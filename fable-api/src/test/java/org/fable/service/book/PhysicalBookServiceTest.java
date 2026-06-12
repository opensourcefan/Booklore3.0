package org.fable.service.book;

import org.fable.mapper.BookMapper;
import org.fable.model.dto.Book;
import org.fable.model.dto.BookMetadata;
import org.fable.model.dto.request.CreatePhysicalBookRequest;
import org.fable.model.dto.sidecar.SidecarMetadata;
import org.fable.model.entity.BookEntity;
import org.fable.model.entity.BookMetadataEntity;
import org.fable.model.entity.LibraryEntity;
import org.fable.model.entity.LibraryPathEntity;
import org.fable.repository.AuthorRepository;
import org.fable.repository.BookRepository;
import org.fable.repository.CategoryRepository;
import org.fable.repository.LibraryRepository;
import org.fable.service.metadata.sidecar.SidecarMetadataMapper;
import org.fable.service.metadata.sidecar.SidecarMetadataReader;
import org.fable.service.metadata.sidecar.SidecarMetadataWriter;
import org.fable.service.metadata.sidecar.SidecarPathResolver;
import org.fable.util.FileService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.nio.file.Path;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.lenient;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PhysicalBookServiceTest {

    @Mock
    private BookRepository bookRepository;

    @Mock
    private LibraryRepository libraryRepository;

    @Mock
    private AuthorRepository authorRepository;

    @Mock
    private CategoryRepository categoryRepository;

    @Mock
    private BookMapper bookMapper;

    @Mock
    private FileService fileService;

    @Mock
    private SidecarMetadataWriter sidecarMetadataWriter;

    @Mock
    private SidecarMetadataReader sidecarMetadataReader;

    @Mock
    private SidecarMetadataMapper sidecarMetadataMapper;

    @Mock
    private SidecarPathResolver sidecarPathResolver;

    @InjectMocks
    private PhysicalBookService physicalBookService;

    private LibraryEntity library;
    private LibraryPathEntity primaryPath;
    private LibraryPathEntity secondaryPath;

    @BeforeEach
    void setUp() {
        primaryPath = LibraryPathEntity.builder().id(10L).path("/books/primary").build();
        secondaryPath = LibraryPathEntity.builder().id(11L).path("/books/secondary").build();
        library = LibraryEntity.builder()
                .id(1L)
                .name("Library")
            .libraryPaths(new ArrayList<>(List.of(primaryPath, secondaryPath)))
                .build();

        primaryPath.setLibrary(library);
        secondaryPath.setLibrary(library);

        lenient().when(libraryRepository.findById(1L)).thenReturn(Optional.of(library));
    }

    @Test
    void createPhysicalBook_usesRequestedLibraryPath() {
        when(bookRepository.findActivePhysicalBooksByLibraryIdAndLibraryPathId(1L, 11L)).thenReturn(List.of());
        when(bookRepository.save(any(BookEntity.class))).thenAnswer(invocation -> {
            BookEntity saved = invocation.getArgument(0);
            saved.setId(99L);
            return saved;
        });
        when(bookMapper.toBook(any(BookEntity.class))).thenReturn(Book.builder().id(99L).build());

        CreatePhysicalBookRequest request = CreatePhysicalBookRequest.builder()
                .libraryId(1L)
                .libraryPathId(11L)
                .title("Physical Book")
                .build();

        physicalBookService.createPhysicalBook(request);

        ArgumentCaptor<BookEntity> captor = ArgumentCaptor.forClass(BookEntity.class);
        verify(bookRepository).save(captor.capture());
        assertThat(captor.getValue().getLibraryPath()).isSameAs(secondaryPath);
        assertThat(captor.getValue().getIsPhysical()).isTrue();
        verify(sidecarMetadataWriter).writeSidecarMetadata(any(BookEntity.class));
    }

    @Test
    void createPhysicalBook_defaultsToFirstLibraryPathWhenNotSpecified() {
        when(bookRepository.findActivePhysicalBooksByLibraryIdAndLibraryPathId(1L, 10L)).thenReturn(List.of());
        when(bookRepository.save(any(BookEntity.class))).thenAnswer(invocation -> {
            BookEntity saved = invocation.getArgument(0);
            saved.setId(99L);
            return saved;
        });
        when(bookMapper.toBook(any(BookEntity.class))).thenReturn(Book.builder().id(99L).build());

        CreatePhysicalBookRequest request = CreatePhysicalBookRequest.builder()
                .libraryId(1L)
                .title("Physical Book")
                .build();

        physicalBookService.createPhysicalBook(request);

        ArgumentCaptor<BookEntity> captor = ArgumentCaptor.forClass(BookEntity.class);
        verify(bookRepository).save(captor.capture());
        assertThat(captor.getValue().getLibraryPath()).isSameAs(primaryPath);
    }

    @Test
    void createPhysicalBook_rejectsLibraryPathFromDifferentLibrary() {
        CreatePhysicalBookRequest request = CreatePhysicalBookRequest.builder()
                .libraryId(1L)
                .libraryPathId(999L)
                .title("Physical Book")
                .build();

        assertThrows(RuntimeException.class, () -> physicalBookService.createPhysicalBook(request));
    }

    @Test
    void createPhysicalBook_rejectsMatchingPhysicalBookInSameLibraryPath() {
        BookMetadataEntity metadata = BookMetadataEntity.builder()
                .title("Physical Book")
                .isbn13("9780134685991")
                .build();
        BookEntity existingBook = BookEntity.builder()
                .id(5L)
                .library(library)
                .libraryPath(primaryPath)
                .isPhysical(true)
                .metadata(metadata)
                .build();
        metadata.setBook(existingBook);

        when(bookRepository.findActivePhysicalBooksByLibraryIdAndLibraryPathId(1L, 10L)).thenReturn(List.of(existingBook));

        CreatePhysicalBookRequest request = CreatePhysicalBookRequest.builder()
                .libraryId(1L)
                .libraryPathId(10L)
                .title("Physical Book")
                .isbn("9780134685991")
                .build();

        assertThrows(RuntimeException.class, () -> physicalBookService.createPhysicalBook(request));
    }

    @Test
    void createPhysicalBook_allowsMatchingPhysicalBookInDifferentLibraryPath() {
        when(bookRepository.save(any(BookEntity.class))).thenAnswer(invocation -> {
            BookEntity saved = invocation.getArgument(0);
            saved.setId(99L);
            return saved;
        });
        when(bookMapper.toBook(any(BookEntity.class))).thenReturn(Book.builder().id(99L).build());

        BookMetadataEntity metadata = BookMetadataEntity.builder()
                .title("Physical Book")
                .isbn13("9780134685991")
                .build();
        BookEntity existingBook = BookEntity.builder()
                .id(5L)
                .library(library)
                .libraryPath(primaryPath)
                .isPhysical(true)
                .metadata(metadata)
                .build();
        metadata.setBook(existingBook);

        when(bookRepository.findActivePhysicalBooksByLibraryIdAndLibraryPathId(1L, 11L)).thenReturn(List.of());

        CreatePhysicalBookRequest request = CreatePhysicalBookRequest.builder()
                .libraryId(1L)
                .libraryPathId(11L)
                .title("Physical Book")
                .isbn("9780134685991")
                .build();

        physicalBookService.createPhysicalBook(request);

        ArgumentCaptor<BookEntity> captor = ArgumentCaptor.forClass(BookEntity.class);
        verify(bookRepository).save(captor.capture());
        assertThat(captor.getValue().getLibraryPath()).isSameAs(secondaryPath);
    }

    @Test
    void importPhysicalBooksFromSidecars_createsBooksFromDirectorySidecars(@org.junit.jupiter.api.io.TempDir Path tempDir) throws Exception {
        Path sidecarFile = tempDir.resolve("my-physical-book.physical.metadata.json");
        java.nio.file.Files.writeString(sidecarFile, "{}");

        primaryPath.setPath(tempDir.toString());

        when(sidecarPathResolver.isPhysicalSidecarFile(any(Path.class))).thenAnswer(invocation ->
                ((Path) invocation.getArgument(0)).getFileName().toString().endsWith(".physical.metadata.json"));

        SidecarMetadata sidecarMetadata = SidecarMetadata.builder().build();
        when(sidecarMetadataReader.readSidecarMetadataFromFile(eq(sidecarFile))).thenReturn(Optional.of(sidecarMetadata));
        when(sidecarMetadataMapper.toBookMetadata(sidecarMetadata)).thenReturn(BookMetadata.builder()
                .title("Imported Physical Book")
                .authors(List.of("Jane Doe"))
                .categories(Set.of("History"))
                .isbn13("9780134685991")
                .build());
        when(bookRepository.findActivePhysicalBooksByLibraryIdAndLibraryPathId(1L, 10L)).thenReturn(List.of());
        when(bookRepository.save(any(BookEntity.class))).thenAnswer(invocation -> {
            BookEntity saved = invocation.getArgument(0);
            saved.setId(101L);
            return saved;
        });
        when(bookMapper.toBook(any(BookEntity.class))).thenReturn(Book.builder().id(101L).build());

        int imported = physicalBookService.importPhysicalBooksFromSidecars(library, List.of(primaryPath));

        assertThat(imported).isEqualTo(1);
        verify(sidecarMetadataWriter).writeSidecarMetadata(any(BookEntity.class));
    }

    @Test
    void importPhysicalBooksFromSidecars_skipsWhenMatchingActiveBookAlreadyExistsInLibrary(@org.junit.jupiter.api.io.TempDir Path tempDir) throws Exception {
    Path sidecarFile = tempDir.resolve("moby-dick.physical.metadata.json");
    java.nio.file.Files.writeString(sidecarFile, "{}");

    primaryPath.setPath(tempDir.toString());

    when(sidecarPathResolver.isPhysicalSidecarFile(any(Path.class))).thenAnswer(invocation ->
        ((Path) invocation.getArgument(0)).getFileName().toString().endsWith(".physical.metadata.json"));

    SidecarMetadata sidecarMetadata = SidecarMetadata.builder().build();
    when(sidecarMetadataReader.readSidecarMetadataFromFile(eq(sidecarFile))).thenReturn(Optional.of(sidecarMetadata));
    when(sidecarMetadataMapper.toBookMetadata(sidecarMetadata)).thenReturn(BookMetadata.builder()
        .title("Moby-Dick or, The Whale")
        .authors(List.of("Herman Melville"))
        .isbn13("9780142437247")
        .build());

    BookMetadataEntity metadata = BookMetadataEntity.builder()
        .title("Moby-Dick or, The Whale")
        .isbn13("9780142437247")
        .build();
    metadata.setAuthors(new ArrayList<>(List.of(org.fable.model.entity.AuthorEntity.builder().name("Herman Melville").build())));

    BookEntity existingBook = BookEntity.builder()
        .id(77L)
        .library(library)
        .libraryPath(secondaryPath)
        .isPhysical(false)
        .metadata(metadata)
        .bookFiles(new ArrayList<>())
        .build();
    metadata.setBook(existingBook);

    when(bookRepository.findAllForDuplicateDetectionIncludingRemoved(1L)).thenReturn(List.of(existingBook));

    int imported = physicalBookService.importPhysicalBooksFromSidecars(library, List.of(primaryPath));

    assertThat(imported).isEqualTo(0);
    verify(bookRepository, org.mockito.Mockito.never()).save(any(BookEntity.class));
    }
}