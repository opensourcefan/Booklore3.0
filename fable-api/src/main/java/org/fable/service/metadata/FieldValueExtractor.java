package org.fable.service.metadata;

import org.fable.model.dto.BookMetadata;

@FunctionalInterface
interface FieldValueExtractor {
    String extract(BookMetadata metadata);
}
