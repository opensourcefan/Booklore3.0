package org.booklore.service.event;

import org.booklore.model.dto.Book;
import org.booklore.model.websocket.LogNotification;
import org.booklore.model.websocket.Topic;
import org.booklore.service.user.UserService;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Slf4j
@AllArgsConstructor
@Service
public class BookEventBroadcaster {

    private final SimpMessagingTemplate messagingTemplate;
    private final UserService userService;

    public void broadcastBookAddEvent(Book book) {
        Long libraryId = book.getLibraryId();
        userService.getBookLoreUsers().stream()
                .filter(u -> u.getPermissions().isAdmin() || u.getAssignedLibraries().stream()
                        .anyMatch(lib -> lib.getId().equals(libraryId)))
                .forEach(u -> {
                    String username = u.getUsername();
                    messagingTemplate.convertAndSendToUser(username, Topic.BOOK_ADD.getPath(), book);
                    messagingTemplate.convertAndSendToUser(username, Topic.LOG.getPath(), LogNotification.info("Book added: " + (book.getPrimaryFile() != null ? book.getPrimaryFile().getFileName() : "unknown")));
                });
    }

    public void broadcastBookUpdateEvent(Book book) {
        Long libraryId = book.getLibraryId();
        userService.getBookLoreUsers().stream()
                .filter(u -> u.getPermissions().isAdmin() || u.getAssignedLibraries().stream()
                        .anyMatch(lib -> lib.getId().equals(libraryId)))
                .forEach(u -> {
                    String username = u.getUsername();
                    messagingTemplate.convertAndSendToUser(username, Topic.BOOK_UPDATE.getPath(), book);
                });
    }

    public void broadcastBookBatchUpdateEvent(java.util.Collection<Book> books) {
        if (books == null || books.isEmpty()) return;
        // Group by libraryId or just send to users who have access to ANY of the libraries in the batch
        java.util.Set<Long> libraryIds = books.stream()
                .map(Book::getLibraryId)
                .collect(java.util.stream.Collectors.toSet());
        
        userService.getBookLoreUsers().stream()
                .filter(u -> u.getPermissions().isAdmin() || u.getAssignedLibraries().stream()
                        .anyMatch(lib -> libraryIds.contains(lib.getId())))
                .forEach(u -> {
                    String username = u.getUsername();
                    messagingTemplate.convertAndSendToUser(username, Topic.BOOK_METADATA_BATCH_UPDATE.getPath(), books);
                });
    }
}
