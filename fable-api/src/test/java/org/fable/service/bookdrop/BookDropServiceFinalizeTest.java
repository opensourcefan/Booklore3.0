package org.fable.service.bookdrop;

import org.fable.config.AppProperties;
import org.fable.model.dto.request.BookdropFinalizeRequest;
import org.fable.repository.BookdropFileRepository;
import org.fable.repository.LibraryRepository;
import org.fable.service.NotificationService;
import org.fable.service.file.FileMovingHelper;
import org.fable.service.kobo.KoboAutoShelfService;
import org.fable.service.monitoring.MonitoringRegistrationService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import tools.jackson.databind.ObjectMapper;

import java.util.Collections;
import java.util.List;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BookDropServiceFinalizeTest {

    @Mock
    private BookdropFileRepository bookdropFileRepository;
    @Mock
    private BookdropMonitoringService bookdropMonitoringService;
    @Mock
    private LibraryRepository libraryRepository;
    @Mock
    private MonitoringRegistrationService monitoringRegistrationService;
    @Mock
    private NotificationService notificationService;
    @Mock
    private ObjectMapper objectMapper;
    @Mock
    private FileMovingHelper fileMovingHelper;
    @Mock
    private AppProperties appProperties;
    @Mock
    private BookdropNotificationService bookdropNotificationService;
    @Mock
    private KoboAutoShelfService koboAutoShelfService;

    @InjectMocks
    private BookDropService bookDropService;

    @Test
    void finalizeImport_selectAll_emptyExcludedIds_shouldCallFindAllIds() {
        BookdropFinalizeRequest request = new BookdropFinalizeRequest();
        request.setSelectAll(true);
        request.setExcludedIds(Collections.emptyList());
        request.setDefaultLibraryId(1L);
        request.setDefaultPathId(1L);

        when(bookdropFileRepository.findAllIds()).thenReturn(List.of(1L, 2L));
        when(bookdropFileRepository.findAllById(anyList())).thenReturn(Collections.emptyList()); // Mock chunk processing

        bookDropService.finalizeImport(request);

        verify(bookdropFileRepository).findAllIds();
        verify(bookdropFileRepository, never()).findAllExcludingIdsFlat(anyList());
    }

    @Test
    void finalizeImport_selectAll_withExcludedIds_shouldCallFindAllExcludingIdsFlat() {
        BookdropFinalizeRequest request = new BookdropFinalizeRequest();
        request.setSelectAll(true);
        request.setExcludedIds(List.of(3L));
        request.setDefaultLibraryId(1L);
        request.setDefaultPathId(1L);

        when(bookdropFileRepository.findAllExcludingIdsFlat(anyList())).thenReturn(List.of(1L, 2L));
        when(bookdropFileRepository.findAllById(anyList())).thenReturn(Collections.emptyList()); // Mock chunk processing

        bookDropService.finalizeImport(request);

        verify(bookdropFileRepository).findAllExcludingIdsFlat(List.of(3L));
        verify(bookdropFileRepository, never()).findAllIds();
    }
}
