package org.fable.service.bookdrop;

import org.fable.config.AppProperties;
import org.fable.config.security.service.AuthenticationService;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.request.BookdropFinalizeRequest;
import org.fable.repository.BookdropFileRepository;
import org.fable.repository.LibraryRepository;
import org.fable.service.NotificationService;
import org.fable.service.file.FileMovingHelper;
import org.fable.service.kobo.KoboAutoShelfService;
import org.fable.service.library.LibraryVisibilityService;
import org.fable.service.monitoring.MonitoringRegistrationService;
import org.junit.jupiter.api.BeforeEach;
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
    private org.fable.service.FailureNotificationService failureNotificationService;
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
    @Mock
    private AuthenticationService authenticationService;
    @Mock
    private BookdropInboxService bookdropInboxService;
    @Mock
    private LibraryVisibilityService libraryVisibilityService;

    @InjectMocks
    private BookDropService bookDropService;

    @BeforeEach
    void setUp() {
        FableUser admin = new FableUser();
        admin.setId(1L);
        FableUser.UserPermissions perms = new FableUser.UserPermissions();
        perms.setAdmin(true);
        admin.setPermissions(perms);
        when(authenticationService.getAuthenticatedUser()).thenReturn(admin);
        when(bookdropInboxService.isAdminUser(admin)).thenReturn(true);
    }

    @Test
    void finalizeImport_selectAll_emptyExcludedIds_shouldCallFindAllGlobalIds() {
        BookdropFinalizeRequest request = new BookdropFinalizeRequest();
        request.setSelectAll(true);
        request.setExcludedIds(Collections.emptyList());
        request.setDefaultLibraryId(1L);
        request.setDefaultPathId(1L);

        when(bookdropFileRepository.findAllGlobalIds()).thenReturn(List.of(1L, 2L));
        when(bookdropFileRepository.findAllById(anyList())).thenReturn(Collections.emptyList());

        bookDropService.finalizeImport(request);

        verify(bookdropFileRepository).findAllGlobalIds();
        verify(bookdropFileRepository, never()).findAllGlobalExcludingIdsFlat(anyList());
    }

    @Test
    void finalizeImport_selectAll_withExcludedIds_shouldCallFindAllGlobalExcludingIdsFlat() {
        BookdropFinalizeRequest request = new BookdropFinalizeRequest();
        request.setSelectAll(true);
        request.setExcludedIds(List.of(3L));
        request.setDefaultLibraryId(1L);
        request.setDefaultPathId(1L);

        when(bookdropFileRepository.findAllGlobalExcludingIdsFlat(anyList())).thenReturn(List.of(1L, 2L));
        when(bookdropFileRepository.findAllById(anyList())).thenReturn(Collections.emptyList());

        bookDropService.finalizeImport(request);

        verify(bookdropFileRepository).findAllGlobalExcludingIdsFlat(List.of(3L));
        verify(bookdropFileRepository, never()).findAllGlobalIds();
    }
}
