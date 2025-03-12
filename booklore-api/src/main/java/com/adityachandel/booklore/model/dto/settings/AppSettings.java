package com.adityachandel.booklore.model.dto.settings;

import com.adityachandel.booklore.model.dto.request.MetadataRefreshOptions;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class AppSettings {
    private EpubSettings epub;
    private PdfSettings pdf;
    private ReaderSettings readerSettings;
    private MetadataRefreshOptions metadataRefreshOptions;

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class EpubSettings {
        private String theme;
        private String fontSize;
        private String font;
    }

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class PdfSettings {
        private String spread;
        private String zoom;
    }

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class ReaderSettings {
        private SettingScope pdfScope;
        private SettingScope epubScope;
    }

    public enum SettingScope {
        global, individual
    }
}
