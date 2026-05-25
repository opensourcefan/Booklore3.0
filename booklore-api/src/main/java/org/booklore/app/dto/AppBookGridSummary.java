package org.booklore.app.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AppBookGridSummary {
    private Long id;
    private Long libraryId;
    private String fileName;
    private String fileType;
    private Boolean isPhysical;

    private String primaryFileType;
    private String primaryFileExtension;
    private Long primaryFileSizeKb;

    private String title;
    private String subtitle;
    private List<String> authors;
    private String publisher;
    private LocalDate publishedDate;
    private String seriesName;
    private Float seriesNumber;
    private String isbn13;
    private String isbn10;
    private Integer pageCount;
    private String language;
    private List<String> categories;
    private String comicIssueNumber;

    private Double amazonRating;
    private Integer amazonReviewCount;
    private Double goodreadsRating;
    private Integer goodreadsReviewCount;
    private Double hardcoverRating;
    private Integer hardcoverReviewCount;
    private Double ranobedbRating;

    private Instant coverUpdatedOn;
    private Instant audiobookCoverUpdatedOn;

    private Float epubProgressPercent;
    private Float pdfProgressPercent;
    private Float cbxProgressPercent;
    private Float koreaderProgressPercent;
    private Float koboProgressPercent;

    private String readStatus;
    private Boolean hasAiPanelData;
    private Instant lastReadTime;
    private Instant addedOn;
}
