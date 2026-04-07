package org.booklore.service.library;

import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookFileEntity;
import org.booklore.model.entity.BookMetadataEntity;
import org.booklore.model.entity.LibraryEntity;
import org.booklore.model.entity.LibraryPathEntity;
import org.booklore.model.entity.TagEntity;
import org.booklore.model.enums.DirectoryTagDepth;
import org.booklore.repository.BookMetadataRepository;
import org.booklore.repository.BookRepository;
import org.booklore.repository.TagRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DirectoryTagServiceBatchTest {

    @Mock
    private BookRepository bookRepository;
    @Mock
    private BookMetadataRepository bookMetadataRepository;
    @Mock
    private TagRepository tagRepository;

    private DirectoryTagService directoryTagService;

    @BeforeEach
    void setUp() {
        directoryTagService = new DirectoryTagService(bookRepository, bookMetadataRepository, tagRepository);
    }

    @Test
    void applyMissingDirectoryTags_shouldBatchResolveTagsAndSaveOnlyModifiedMetadata() {
        LibraryEntity library = new LibraryEntity();
        library.setId(1L);
        library.setName("AI");
        library.setDirectoryTagDepth(DirectoryTagDepth.ALL_SEGMENTS);

        LibraryPathEntity libraryPath = new LibraryPathEntity();
        libraryPath.setId(10L);
        libraryPath.setPath("/books/AI");
        library.setLibraryPaths(List.of(libraryPath));

        BookEntity book = new BookEntity();
        book.setId(100L);
        book.setLibraryPath(libraryPath);
        BookMetadataEntity metadata = BookMetadataEntity.builder()
                .bookId(100L)
                .title("Example")
                .tags(new HashSet<>())
                .build();
        book.setMetadata(metadata);
        BookFileEntity file = new BookFileEntity();
        file.setBook(book);
        file.setFileSubPath("Series/Volume 1");
        file.setFileName("Example.cbz");
        book.setBookFiles(new ArrayList<>(List.of(file)));

        TagEntity existingSeriesTag = TagEntity.builder().id(1L).name("Series").build();
        TagEntity existingRootTag = TagEntity.builder().id(2L).name("AI").build();
        TagEntity newVolumeTag = TagEntity.builder().id(3L).name("Volume 1").build();

        when(bookRepository.findAllByLibraryIdWithFiles(1L)).thenReturn(List.of(book));
        when(tagRepository.findAllByNormalizedNames(any())).thenReturn(List.of(existingSeriesTag, existingRootTag));
        when(tagRepository.saveAll(any())).thenReturn(List.of(newVolumeTag));

        DirectoryTagService.DirectoryTagRunResult result = directoryTagService.applyMissingDirectoryTags(library, null, null);

        assertThat(result.totalBooks()).isEqualTo(1);
        assertThat(result.updatedBooks()).isEqualTo(1);
        assertThat(metadata.getTags()).extracting(TagEntity::getName)
                .containsExactlyInAnyOrder("AI", "Series", "Volume 1");

        verify(bookMetadataRepository).saveAll(argThat(items -> {
            List<BookMetadataEntity> captured = new ArrayList<>();
            items.forEach(captured::add);
            return captured.equals(List.of(metadata));
        }));
    }
}