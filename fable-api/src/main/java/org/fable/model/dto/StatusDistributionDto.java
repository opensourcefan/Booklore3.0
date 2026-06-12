package org.fable.model.dto;

import org.fable.model.enums.ReadStatus;

public interface StatusDistributionDto {
    ReadStatus getStatus();
    Long getCount();
}
