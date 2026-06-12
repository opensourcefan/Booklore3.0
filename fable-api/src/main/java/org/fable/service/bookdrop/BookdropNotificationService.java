package org.fable.service.bookdrop;

import org.fable.model.dto.BookdropFileNotification;
import org.fable.model.entity.BookdropFileEntity;
import org.fable.model.enums.PermissionType;
import org.fable.model.websocket.Topic;
import org.fable.repository.BookdropFileRepository;
import org.fable.service.NotificationService;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Set;

@Service
@AllArgsConstructor
public class BookdropNotificationService {

    private final BookdropFileRepository bookdropFileRepository;
    private final NotificationService notificationService;

    public void sendBookdropFileSummaryNotification() {
        long pendingCount = bookdropFileRepository.countByStatus(BookdropFileEntity.Status.PENDING_REVIEW);
        long totalCount = bookdropFileRepository.count();

        BookdropFileNotification summaryNotification = new BookdropFileNotification(
                (int) pendingCount,
                (int) totalCount,
                Instant.now().toString()
        );

        notificationService.sendMessageToPermissions(Topic.BOOKDROP_FILE, summaryNotification, Set.of(PermissionType.ADMIN, PermissionType.MANAGE_LIBRARY));
    }
}
