package org.fable.service.metadata;

import org.fable.model.dto.BookMetadata;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class IsbnMetadataFillServiceTest {

    @Test
    void fillMissingFields_onlyFillsBlankTargets() {
        BookMetadata target = BookMetadata.builder()
                .title("Existing Title")
                .publisher(null)
                .authors(List.of("A"))
                .build();
        BookMetadata source = BookMetadata.builder()
                .title("Provider Title")
                .publisher("Publisher Co")
                .authors(List.of("B"))
                .description("Desc")
                .build();

        IsbnMetadataFillService.fillMissingFields(target, source);

        assertThat(target.getTitle()).isEqualTo("Existing Title");
        assertThat(target.getPublisher()).isEqualTo("Publisher Co");
        assertThat(target.getAuthors()).containsExactly("A");
        assertThat(target.getDescription()).isEqualTo("Desc");
    }
}
