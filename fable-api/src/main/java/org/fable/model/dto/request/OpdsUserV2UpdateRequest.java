package org.fable.model.dto.request;

import org.fable.model.enums.OpdsSortOrder;
import jakarta.validation.constraints.NotNull;

public record OpdsUserV2UpdateRequest(
        @NotNull(message = "Sort order is required")
        OpdsSortOrder sortOrder
) {
}
