package org.fable.model.dto.ai;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiPanelScanProgressPayload {
    private String mode;
    private String event;
    private Long bookId;
    private String bookTitle;
    private Integer processedPages;
    private Integer totalPages;
    private Integer panelsFound;
    private Integer pagesWithPanels;
    private Integer completedBooks;
    private Integer totalBooks;
    private Integer skippedBooks;
    private String message;
    private String error;
}