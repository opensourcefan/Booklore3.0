package org.fable.model.dto.request;

import lombok.Data;

import java.util.Set;

@Data
public class FileTypeAssignmentRequest {
    private Set<Long> bookIds;
    private String fileType;
}
