package org.booklore.model.dto.request;

import lombok.Data;

import java.util.Set;

@Data
public class BulkMetadataWipeRequest {
    private Set<Long> bookIds;
}