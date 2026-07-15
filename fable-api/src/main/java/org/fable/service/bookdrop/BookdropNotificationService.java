package org.fable.service.bookdrop;

import org.fable.model.dto.BookdropFileNotification;
import org.fable.model.entity.BookdropFileEntity;
import org.fable.model.entity.FableUserEntity;
import org.fable.model.enums.PermissionType;
import org.fable.model.websocket.Topic;
import org.fable.repository.BookdropFileRepository;
import org.fable.repository.UserRepository;
import org.fable.service.NotificationService;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashSet;
import java.util.Set;

@Service
@AllArgsConstructor
public class BookdropNotificationService {

    private final BookdropFileRepository bookdropFileRepository;
    private final NotificationService notificationService;
    private final UserRepository userRepository;

    /**
     * Pushes scoped summaries: admins get global-inbox counts; non-admin BookDrop
     * users get their personal-inbox counts.
     */
    @Transactional(readOnly = true)
    public void sendBookdropFileSummaryNotification() {
        BookdropFileNotification globalSummary = buildSummary(
                bookdropFileRepository.countByStatusAndOwnerUserIdIsNull(BookdropFileEntity.Status.PENDING_REVIEW),
                bookdropFileRepository.countByOwnerUserIdIsNull()
        );
        notificationService.sendMessageToPermissions(
                Topic.BOOKDROP_FILE,
                globalSummary,
                Set.of(PermissionType.ADMIN)
        );

        Set<Long> personalOwnerIds = new HashSet<>(bookdropFileRepository.findDistinctOwnerUserIds());
        for (FableUserEntity user : userRepository.findNonAdminBookdropUsers()) {
            personalOwnerIds.add(user.getId());
        }

        for (Long ownerId : personalOwnerIds) {
            if (ownerId == null) {
                continue;
            }
            userRepository.findById(ownerId).ifPresent(user -> {
                if (user.getPermissions() != null && user.getPermissions().isPermissionAdmin()) {
                    return;
                }
                BookdropFileNotification personal = buildSummary(
                        bookdropFileRepository.countByStatusAndOwnerUserId(
                                BookdropFileEntity.Status.PENDING_REVIEW, ownerId),
                        bookdropFileRepository.countByOwnerUserId(ownerId)
                );
                notificationService.sendMessageToUser(user.getUsername(), Topic.BOOKDROP_FILE, personal);
            });
        }
    }

    private static BookdropFileNotification buildSummary(long pendingCount, long totalCount) {
        return new BookdropFileNotification(
                (int) pendingCount,
                (int) totalCount,
                Instant.now().toString()
        );
    }
}
