package org.fable.task.options;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.fable.model.enums.MetadataReplaceMode;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LibraryRescanOptions {

    private boolean updateMetadataFromFiles;
    private MetadataReplaceMode metadataReplaceMode;
}