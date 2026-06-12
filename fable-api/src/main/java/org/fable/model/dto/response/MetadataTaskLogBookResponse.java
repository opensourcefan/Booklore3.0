package org.fable.model.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MetadataTaskLogBookResponse {

    private Long bookId;
    private String title;
    private String fileName;
}