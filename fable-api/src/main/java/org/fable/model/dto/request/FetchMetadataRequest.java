package org.fable.model.dto.request;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.fable.model.enums.MetadataProvider;

import java.util.List;

@Builder
@Data
@NoArgsConstructor
@AllArgsConstructor
public class FetchMetadataRequest {
    private Long bookId;
    private List<MetadataProvider> providers;
    private String isbn;
    private String title;
    private String author;
    private String asin;
    private String sourceUrl;
    private String issueNumber;
    private String issueRange;
}
