package org.fable.service.metadata;

import org.fable.model.dto.BookMetadata;
import org.fable.model.enums.MetadataProvider;
import org.fable.service.metadata.parser.BookParser;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
                .doubanRating(8.9)
                .doubanReviewCount(120)
                .lubimyczytacRating(7.8)
                .ranobedbRating(9.1)
                .audibleRating(4.7)
                .audibleReviewCount(321)
                .rating(4.5)
                .ageRating(13)
                .contentRating("Teen")
                .externalUrl("https://example.test/book")
                .build();

        IsbnMetadataFillService.fillMissingFields(target, source);

        assertThat(target.getTitle()).isEqualTo("Existing Title");
        assertThat(target.getPublisher()).isEqualTo("Publisher Co");
        assertThat(target.getAuthors()).containsExactly("A");
        assertThat(target.getDescription()).isEqualTo("Desc");
        assertThat(target.getDoubanRating()).isEqualTo(8.9);
        assertThat(target.getDoubanReviewCount()).isEqualTo(120);
        assertThat(target.getLubimyczytacRating()).isEqualTo(7.8);
        assertThat(target.getRanobedbRating()).isEqualTo(9.1);
        assertThat(target.getAudibleRating()).isEqualTo(4.7);
        assertThat(target.getAudibleReviewCount()).isEqualTo(321);
        assertThat(target.getRating()).isEqualTo(4.5);
        assertThat(target.getAgeRating()).isEqualTo(13);
        assertThat(target.getContentRating()).isEqualTo("Teen");
        assertThat(target.getExternalUrl()).isEqualTo("https://example.test/book");
    }

    @Test
    void mergeByIsbn_queriesOnlySelectedProvidersInOrder() throws Exception {
        BookParser amazon = mock(BookParser.class);
        BookParser google = mock(BookParser.class);
        BookParser hardcover = mock(BookParser.class);
        when(amazon.fetchMetadata(any(), any())).thenReturn(List.of(
                BookMetadata.builder().title("Selected Provider Result").build()));
        when(google.fetchMetadata(any(), any())).thenReturn(List.of(
                BookMetadata.builder().title("Later Title").description("Filled Later").build()));

        IsbnMetadataFillService service = new IsbnMetadataFillService(
                null, null, null, null, null, null, null,
                Map.of(
                        MetadataProvider.Amazon, amazon,
                        MetadataProvider.Google, google,
                        MetadataProvider.Hardcover, hardcover));

        BookMetadata merged = service.mergeByIsbn(
                "9780132350884",
                BookMetadata.builder().build(),
                List.of(MetadataProvider.Amazon, MetadataProvider.Google));

        assertThat(merged).isNotNull();
        assertThat(merged.getTitle()).isEqualTo("Selected Provider Result");
        assertThat(merged.getDescription()).isEqualTo("Filled Later");
        InOrder providerOrder = inOrder(amazon, google);
        providerOrder.verify(amazon).fetchMetadata(any(), any());
        providerOrder.verify(google).fetchMetadata(any(), any());
        verify(hardcover, never()).fetchMetadata(any(), any());
    }
}
