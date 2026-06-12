package org.fable.service.metadata.parser;

import org.fable.model.dto.BookMetadata;

public interface DetailedMetadataProvider {
    BookMetadata fetchDetailedMetadata(String providerItemId);
}
