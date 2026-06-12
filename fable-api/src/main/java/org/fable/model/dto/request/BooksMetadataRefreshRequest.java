package org.fable.model.dto.request;

import org.fable.model.enums.MetadataProvider;
import lombok.Data;

import java.util.Set;

@Data
public class BooksMetadataRefreshRequest {
    private Set<Long> bookIds;
    private MetadataProvider metadataProvider;
    private boolean replaceCover;
}
