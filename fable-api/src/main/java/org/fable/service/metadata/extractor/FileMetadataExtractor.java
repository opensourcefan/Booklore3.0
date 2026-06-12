package org.fable.service.metadata.extractor;

import org.fable.model.dto.BookMetadata;

import java.io.File;

public interface FileMetadataExtractor {

    BookMetadata extractMetadata(File file);

    byte[] extractCover(File file);
}
