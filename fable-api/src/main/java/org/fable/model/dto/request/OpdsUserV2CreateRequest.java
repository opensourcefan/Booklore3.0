package org.fable.model.dto.request;

import org.fable.model.enums.OpdsSortOrder;
import lombok.Data;

@Data
public class OpdsUserV2CreateRequest {
    private String username;
    private String password;
    private OpdsSortOrder sortOrder;
}
