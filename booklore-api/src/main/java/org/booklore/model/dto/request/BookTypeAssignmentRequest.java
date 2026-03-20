package org.booklore.model.dto.request;

import lombok.Data;
import org.booklore.model.enums.BookFileType;

import java.util.Set;

@Data
public class BookTypeAssignmentRequest {
    private Set<Long> bookIds;
    private BookFileType bookType;
}
