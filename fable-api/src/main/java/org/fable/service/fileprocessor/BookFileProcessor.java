package org.fable.service.fileprocessor;

import org.fable.model.FileProcessResult;
import org.fable.model.dto.settings.LibraryFile;
import org.fable.model.entity.BookEntity;
import org.fable.model.enums.BookFileType;

import java.util.List;

import org.fable.model.entity.BookFileEntity;

public interface BookFileProcessor {
    List<BookFileType> getSupportedTypes();

    FileProcessResult processFile(LibraryFile libraryFile);

    boolean generateCover(BookEntity bookEntity);

    default boolean generateCover(BookEntity bookEntity, BookFileEntity bookFile) {
        return generateCover(bookEntity);
    }

    default boolean generateAudiobookCover(BookEntity bookEntity) {
        return generateCover(bookEntity);
    }
}
