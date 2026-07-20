package org.fable.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.fable.model.entity.BookEntity;
import org.fable.model.enums.MetadataReplaceMode;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MetadataUpdateContext {
    private BookEntity bookEntity;
    private MetadataUpdateWrapper metadataUpdateWrapper;
    private boolean updateThumbnail;
    private boolean mergeCategories;
    private boolean mergeMoods;
    private boolean mergeTags;
    private MetadataReplaceMode replaceMode;
    /**
     * When true, attempt file write-back even if the update would not otherwise
     * trigger persistence (used by ISBN fill write-back toggle). Still requires
     * local storage and format write enabled.
     */
    private boolean forceFileWrite;
}
