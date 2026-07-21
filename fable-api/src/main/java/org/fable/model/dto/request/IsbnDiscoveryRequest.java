package org.fable.model.dto.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.fable.model.enums.MetadataProvider;
import tools.jackson.databind.annotation.JsonDeserialize;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IsbnDiscoveryRequest {
    @JsonDeserialize(as = LinkedHashSet.class)
    private Set<Long> bookIds;
    /** Optional ordered provider subset for manual ISBN fills; null keeps configured defaults. */
    private List<MetadataProvider> providers;
}
