package org.fable.service;

import org.fable.model.dto.BookdropFileNotification;
import org.fable.model.entity.BookdropFileEntity;
import org.fable.model.enums.PermissionType;
import org.fable.model.websocket.Topic;
import org.fable.repository.BookdropFileRepository;
import org.fable.repository.UserRepository;
import org.fable.service.bookdrop.BookdropNotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class BookdropNotificationServiceTest {

    private BookdropFileRepository bookdropFileRepository;
    private NotificationService notificationService;
    private UserRepository userRepository;

    private BookdropNotificationService bookdropNotificationService;

    @BeforeEach
    void setup() {
        bookdropFileRepository = mock(BookdropFileRepository.class);
        notificationService = mock(NotificationService.class);
        userRepository = mock(UserRepository.class);

        bookdropNotificationService = new BookdropNotificationService(
                bookdropFileRepository, notificationService, userRepository);
    }

    @Test
    void sendBookdropFileSummaryNotification_shouldSendCorrectNotification() {
        long pendingCount = 5L;
        long totalCount = 20L;

        when(bookdropFileRepository.countByStatusAndOwnerUserIdIsNull(BookdropFileEntity.Status.PENDING_REVIEW))
                .thenReturn(pendingCount);
        when(bookdropFileRepository.countByOwnerUserIdIsNull()).thenReturn(totalCount);
        when(bookdropFileRepository.findDistinctOwnerUserIds()).thenReturn(List.of());
        when(userRepository.findNonAdminBookdropUsers()).thenReturn(List.of());

        bookdropNotificationService.sendBookdropFileSummaryNotification();

        ArgumentCaptor<BookdropFileNotification> captor = ArgumentCaptor.forClass(BookdropFileNotification.class);
        verify(notificationService).sendMessageToPermissions(
                eq(Topic.BOOKDROP_FILE), captor.capture(), eq(Set.of(PermissionType.ADMIN)));

        BookdropFileNotification sentNotification = captor.getValue();

        assertThat(sentNotification.getPendingCount()).isEqualTo((int) pendingCount);
        assertThat(sentNotification.getTotalCount()).isEqualTo((int) totalCount);
        assertThat(Instant.parse(sentNotification.getLastUpdatedAt())).isBeforeOrEqualTo(Instant.now());
    }

    @Test
    void sendBookdropFileSummaryNotification_shouldSendEvenIfCountsAreZero() {
        when(bookdropFileRepository.countByStatusAndOwnerUserIdIsNull(BookdropFileEntity.Status.PENDING_REVIEW))
                .thenReturn(0L);
        when(bookdropFileRepository.countByOwnerUserIdIsNull()).thenReturn(0L);
        when(bookdropFileRepository.findDistinctOwnerUserIds()).thenReturn(List.of());
        when(userRepository.findNonAdminBookdropUsers()).thenReturn(List.of());

        bookdropNotificationService.sendBookdropFileSummaryNotification();

        verify(notificationService).sendMessageToPermissions(
                eq(Topic.BOOKDROP_FILE), any(BookdropFileNotification.class), eq(Set.of(PermissionType.ADMIN)));
    }
}
