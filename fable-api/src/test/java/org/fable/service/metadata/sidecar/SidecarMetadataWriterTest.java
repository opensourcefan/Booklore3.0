package org.fable.service.metadata.sidecar;

import org.fable.config.AppProperties;
import org.fable.model.dto.settings.AppSettings;
import org.fable.model.dto.settings.MetadataPersistenceSettings;
import org.fable.model.dto.settings.SidecarSettings;
import org.fable.model.entity.BookEntity;
import org.fable.model.entity.BookMetadataEntity;
import org.fable.service.appsettings.AppSettingService;
import org.fable.util.FileService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SidecarMetadataWriterTest {

    @Mock
    private AppProperties appProperties;

    @Mock
    private SidecarMetadataMapper mapper;

    @Mock
    private SidecarPathResolver sidecarPathResolver;

    @Mock
    private FileService fileService;

    @Mock
    private AppSettingService appSettingService;

    @InjectMocks
    private SidecarMetadataWriter sidecarMetadataWriter;

    @BeforeEach
    void setUp() {
        lenient().when(appProperties.isLocalStorage()).thenReturn(true);
    }

    @Test
    void writeSidecarMetadata_networkStorage_skipsWrite() {
        when(appProperties.isLocalStorage()).thenReturn(false);

        sidecarMetadataWriter.writeSidecarMetadata(new BookEntity());

        verify(appSettingService, never()).getAppSettings();
    }

    @Test
    void writeSidecarMetadata_localStorage_proceedsNormally() {
        sidecarMetadataWriter.writeSidecarMetadata(null);

        verify(appProperties).isLocalStorage();
    }

    @Test
    void writeSidecarMetadata_forceWrite_ignoresNetworkStorageGate() {
        BookEntity book = new BookEntity();
        book.setId(42L);
        book.setMetadata(new BookMetadataEntity());

        AppSettings appSettings = AppSettings.builder()
                .metadataPersistenceSettings(MetadataPersistenceSettings.builder()
                        .sidecarSettings(SidecarSettings.builder()
                                .enabled(false)
                                .includeCoverFile(false)
                                .build())
                        .build())
                .build();

        lenient().when(appSettingService.getAppSettings()).thenReturn(appSettings);
        lenient().when(sidecarPathResolver.isPhysicalDirectorySidecar(book)).thenReturn(false);
        lenient().when(sidecarPathResolver.resolveSidecarPath(book)).thenReturn(java.nio.file.Path.of("/tmp/test-book.metadata.json"));

        sidecarMetadataWriter.writeSidecarMetadata(book, true);

        verify(appProperties, never()).isLocalStorage();
        verify(sidecarPathResolver).resolveSidecarPath(book);
    }
}
