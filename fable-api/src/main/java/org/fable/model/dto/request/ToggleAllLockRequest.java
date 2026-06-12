package org.fable.model.dto.request;

import org.fable.model.enums.Lock;
import lombok.Data;

import java.util.Set;

@Data
public class ToggleAllLockRequest {
    private Set<Long> bookIds;
    private Lock lock;
}
