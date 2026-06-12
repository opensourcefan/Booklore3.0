package org.fable.model;

import lombok.*;
import org.fable.model.dto.Book;
import org.fable.model.enums.FileProcessStatus;

@Builder
@Getter
@Setter
@ToString
@NoArgsConstructor
@AllArgsConstructor
public class FileProcessResult {
    private Book book;
    private FileProcessStatus status;
}
