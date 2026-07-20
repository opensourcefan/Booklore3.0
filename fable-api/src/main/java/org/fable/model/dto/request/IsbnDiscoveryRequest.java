package org.fable.model.dto.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import tools.jackson.databind.annotation.JsonDeserialize;

import java.util.LinkedHashSet;
import java.util.Set;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IsbnDiscoveryRequest {
    @JsonDeserialize(as = LinkedHashSet.class)
    private Set<Long> bookIds;
}
