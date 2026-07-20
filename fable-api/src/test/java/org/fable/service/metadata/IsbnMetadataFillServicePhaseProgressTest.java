package org.fable.service.metadata;

import org.fable.mapper.BookMapper;
import org.fable.model.dto.MetadataBatchProgressNotification;
import org.fable.model.enums.MetadataFetchTaskStatus;
import org.fable.model.enums.MetadataProvider;
import org.fable.model.websocket.Topic;
import org.fable.repository.BookRepository;
import org.fable.service.appsettings.AppSettingService;
import org.fable.service.NotificationService;
import org.fable.service.metadata.parser.BookParser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class IsbnMetadataFillServicePhaseProgressTest {

    @Mock
    private AppSettingService appSettingService;
    @Mock
    private BookRepository bookRepository;
    @Mock
    private BookMapper bookMapper;
    @Mock
    private BookMetadataService bookMetadataService;
    @Mock
    private BookMetadataUpdater bookMetadataUpdater;
    @Mock
    private IsbnDiscoveryService isbnDiscoveryService;
    @Mock
    private NotificationService notificationService;

    private IsbnMetadataFillService service;

    @BeforeEach
    void setUp() {
        Map<MetadataProvider, BookParser> parserMap = Map.of();
        service = new IsbnMetadataFillService(
                appSettingService,
                bookRepository,
                bookMapper,
                bookMetadataService,
                bookMetadataUpdater,
                isbnDiscoveryService,
                notificationService,
                parserMap
        );
    }

    @AfterEach
    void tearDown() {
        MetadataTaskContext.clear();
    }

    @Test
    void emitPhaseProgress_noOpsWithoutTaskContext() {
        service.emitPhaseProgress(MetadataBatchProgressNotification.PHASE_ISBN_DISCOVERY, "ISBN fetch");
        verify(notificationService, never()).sendMessage(eq(Topic.BOOK_METADATA_BATCH_PROGRESS),
                org.mockito.ArgumentMatchers.any());
    }

    @Test
    void emitPhaseProgress_sendsPhaseWhenContextSet() {
        MetadataTaskContext.set("task-abc", 0, 2, false);

        service.emitPhaseProgress(MetadataBatchProgressNotification.PHASE_METADATA_FETCH,
                "Metadata fetch — book 1 of 2…");

        ArgumentCaptor<MetadataBatchProgressNotification> captor =
                ArgumentCaptor.forClass(MetadataBatchProgressNotification.class);
        verify(notificationService).sendMessage(eq(Topic.BOOK_METADATA_BATCH_PROGRESS), captor.capture());

        MetadataBatchProgressNotification sent = captor.getValue();
        assertThat(sent.getTaskId()).isEqualTo("task-abc");
        assertThat(sent.getCompleted()).isEqualTo(0);
        assertThat(sent.getTotal()).isEqualTo(2);
        assertThat(sent.getStatus()).isEqualTo(MetadataFetchTaskStatus.IN_PROGRESS.name());
        assertThat(sent.getPhase()).isEqualTo(MetadataBatchProgressNotification.PHASE_METADATA_FETCH);
        assertThat(sent.getMessage()).contains("Metadata fetch");
    }
}
