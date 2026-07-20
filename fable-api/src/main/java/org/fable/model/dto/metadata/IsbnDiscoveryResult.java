package org.fable.model.dto.metadata;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.fable.service.metadata.parser.ParserUtils;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IsbnDiscoveryResult {

    public enum Status {
        FOUND,
        AMBIGUOUS,
        NOT_FOUND,
        OCR_UNAVAILABLE,
        DISABLED,
        ERROR
    }

    private Status status;
    private String isbn13;
    private String isbn10;
    private boolean verifiedAgainstFileSignals;
    private boolean highConfidenceAutoPick;
    private boolean requiresReview;
    private int confidence;
    private String message;

    @Builder.Default
    private List<ParserUtils.IsbnCandidate> candidates = new ArrayList<>();

    public static IsbnDiscoveryResult disabled() {
        return IsbnDiscoveryResult.builder()
                .status(Status.DISABLED)
                .requiresReview(false)
                .message("ISBN discovery is disabled")
                .build();
    }

    public static IsbnDiscoveryResult notFound(String message) {
        return IsbnDiscoveryResult.builder()
                .status(Status.NOT_FOUND)
                .requiresReview(true)
                .message(message)
                .build();
    }

    public static IsbnDiscoveryResult ocrUnavailable(String message) {
        return IsbnDiscoveryResult.builder()
                .status(Status.OCR_UNAVAILABLE)
                .requiresReview(true)
                .message(message)
                .build();
    }

    public boolean hasResolvedIsbn() {
        return status == Status.FOUND && (isbn13 != null || isbn10 != null);
    }
}
