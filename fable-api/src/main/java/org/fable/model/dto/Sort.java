package org.fable.model.dto;

import org.fable.model.enums.SortDirection;
import lombok.Data;

@Data
public class Sort {
    private String field;
    private SortDirection direction;
}
