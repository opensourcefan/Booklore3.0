package org.fable.model.dto.request;

import org.fable.model.enums.MetadataProvider;
import lombok.Data;

@Data
public class LibraryMetadataRefreshRequest {
    private Long libraryId;
    private MetadataProvider metadataProvider;
    private boolean replaceCover;
}
