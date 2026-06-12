package org.fable.task.options;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MetadataFlushOptions {

    /**
     * Scope the flush to a single library. When null, all libraries are flushed.
     */
    private Long libraryId;
}
