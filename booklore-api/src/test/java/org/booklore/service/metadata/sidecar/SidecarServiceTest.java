package org.booklore.service.metadata.sidecar;

import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.LibraryEntity;
import org.booklore.repository.BookRepository;
import org.booklore.repository.LibraryRepository;
import org.booklore.service.metadata.BookMetadataUpdater;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SidecarServiceTest {

    @Mock
    private BookRepository bookRepository;

    @Mock
    private LibraryRepository libraryRepository;

    @Mock
    private SidecarMetadataReader sidecarReader;

    @Mock
    private SidecarMetadataWriter sidecarWriter;

    @Mock
    private SidecarMetadataMapper sidecarMapper;

    @Mock
    private BookMetadataUpdater bookMetadataUpdater;

    @InjectMocks
    private SidecarService sidecarService;

    @Test
    void bulkExport_countsOnlySuccessfulWrites() {
        LibraryEntity library = new LibraryEntity();
        library.setId(5L);
        library.setName("Library");

        BookEntity firstBook = new BookEntity();
        firstBook.setId(10L);
        BookEntity secondBook = new BookEntity();
        secondBook.setId(11L);

        when(libraryRepository.findById(5L)).thenReturn(Optional.of(library));
        when(bookRepository.findAllForMetadataFlushByLibraryId(5L)).thenReturn(List.of(firstBook, secondBook));
        when(sidecarWriter.writeSidecarMetadata(firstBook, false)).thenReturn(true);
        when(sidecarWriter.writeSidecarMetadata(secondBook, false)).thenReturn(false);

        int exported = sidecarService.bulkExport(5L);

        assertEquals(1, exported);
        verify(sidecarWriter).writeSidecarMetadata(firstBook, false);
        verify(sidecarWriter).writeSidecarMetadata(secondBook, false);
    }

    @Test
    void backupLibrarySidecars_forcesWritesRegardlessOfAutomaticSettingState() {
        LibraryEntity library = new LibraryEntity();
        library.setId(7L);
        library.setName("Backup Library");

        BookEntity firstBook = new BookEntity();
        firstBook.setId(20L);
        BookEntity secondBook = new BookEntity();
        secondBook.setId(21L);

        when(libraryRepository.findById(7L)).thenReturn(Optional.of(library));
        when(bookRepository.findAllForMetadataFlushByLibraryId(7L)).thenReturn(List.of(firstBook, secondBook));
        when(sidecarWriter.writeSidecarMetadata(firstBook, true)).thenReturn(true);
        when(sidecarWriter.writeSidecarMetadata(secondBook, true)).thenReturn(true);

        int exported = sidecarService.backupLibrarySidecars(7L);

        assertEquals(2, exported);
        verify(sidecarWriter).writeSidecarMetadata(firstBook, true);
        verify(sidecarWriter).writeSidecarMetadata(secondBook, true);
    }

    @Test
    void bulkImport_usesBooksWithResolvedLibraryPaths() {
        LibraryEntity library = new LibraryEntity();
        library.setId(8L);
        library.setName("Import Library");

        BookEntity book = new BookEntity();
        book.setId(30L);

        when(libraryRepository.findById(8L)).thenReturn(Optional.of(library));
        when(bookRepository.findAllForMetadataFlushByLibraryId(8L)).thenReturn(List.of(book));
        when(sidecarReader.readSidecarMetadata(book)).thenReturn(Optional.empty());

        int imported = sidecarService.bulkImport(8L);

        assertEquals(0, imported);
        verify(bookRepository).findAllForMetadataFlushByLibraryId(8L);
    }
}