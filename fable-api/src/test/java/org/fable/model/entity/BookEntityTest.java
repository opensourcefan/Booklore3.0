package org.fable.model.entity;

import org.fable.model.enums.BookFileType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class BookEntityTest {

    @Test
    void getPrimaryBookFile_ignoresNonBookAttachmentsWhenNoPriorityConfigured() {
        BookFileEntity imageAttachment = BookFileEntity.builder()
                .fileName("cover.jpg")
                .isBookFormat(false)
                .build();
        BookFileEntity epubFile = BookFileEntity.builder()
                .fileName("book.epub")
                .isBookFormat(true)
                .bookType(BookFileType.EPUB)
                .build();

        BookEntity book = new BookEntity();
        book.setLibrary(LibraryEntity.builder().formatPriority(List.of()).build());
        book.setBookFiles(List.of(imageAttachment, epubFile));

        assertThat(book.getPrimaryBookFile()).isSameAs(epubFile);
    }

    @Test
    void getPrimaryBookFile_appliesFormatPriorityOnlyAcrossBookFormats() {
        BookFileEntity imageAttachment = BookFileEntity.builder()
                .fileName("cover.jpg")
                .isBookFormat(false)
                .build();
        BookFileEntity pdfFile = BookFileEntity.builder()
                .fileName("book.pdf")
                .isBookFormat(true)
                .bookType(BookFileType.PDF)
                .build();
        BookFileEntity epubFile = BookFileEntity.builder()
                .fileName("book.epub")
                .isBookFormat(true)
                .bookType(BookFileType.EPUB)
                .build();

        BookEntity book = new BookEntity();
        book.setLibrary(LibraryEntity.builder().formatPriority(List.of(BookFileType.EPUB, BookFileType.PDF)).build());
        book.setBookFiles(List.of(imageAttachment, pdfFile, epubFile));

        assertThat(book.getPrimaryBookFile()).isSameAs(epubFile);
    }
}