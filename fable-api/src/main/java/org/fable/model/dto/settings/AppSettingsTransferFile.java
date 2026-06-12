package org.fable.model.dto.settings;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AppSettingsTransferFile {
    private Integer version;
    private String exportedAt;
    private List<SettingRequest> settings;
}