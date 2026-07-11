package org.fable.model.dto.request;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class FailureNotificationRequest {

    @NotBlank
    private String message;

    /** Optional operation label, e.g. "Save LLM settings". Prepended to message when present. */
    private String operation;
}
