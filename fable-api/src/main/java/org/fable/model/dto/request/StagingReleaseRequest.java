package org.fable.model.dto.request;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.Set;

@Data
public class StagingReleaseRequest {
    @NotEmpty
    @Size(max = 500)
    private Set<Long> bookIds;
}
