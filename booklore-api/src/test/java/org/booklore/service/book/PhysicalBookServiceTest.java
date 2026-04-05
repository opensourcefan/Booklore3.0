package org.booklore.service.book;

import org.booklore.mapper.BookMapper;
import org.booklore.model.dto.Book;
import org.booklore.model.dto.request.CreatePhysicalBookRequest;
import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.LibraryEntity;
import org.booklore.model.entity.LibraryPathEntity;
import org.booklore.repository.AuthorRepository;
import org.booklore.repository.BookRepository;
import org.booklore.repository.CategoryRepository;
import org.booklore.repository.LibraryRepository;
import org.booklore.util.FileService;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
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

        when(libraryRepository.findById(1L)).thenReturn(Optional.of(library));
    }

    @Test
    void createPhysicalBook_usesRequestedLibraryPath() {
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
    }

    @Test
    void createPhysicalBook_defaultsToFirstLibraryPathWhenNotSpecified() {
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
}