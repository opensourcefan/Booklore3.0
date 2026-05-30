package org.booklore.model.dto.request;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

import java.util.Set;

public record DuplicateDetectionRequest(
                @NotNull DuplicateScanScope scope,
                Long libraryId,
                Set<Long> bookIds,
        boolean matchByIsbn,
        boolean matchByExternalId,
        boolean matchByTitleAuthor,
        boolean matchByDirectory,
        boolean matchByFilename
) {
        @AssertTrue(message = "Duplicate scan scope requires matching library or book selections")
        public boolean hasValidScopeConfig() {
                return switch (scope) {
                        case CURRENT_LIBRARY -> libraryId != null;
                        case ALL_LIBRARIES -> true;
                        case BOOK_IDS -> bookIds != null && !bookIds.isEmpty();
                };
        }
}
