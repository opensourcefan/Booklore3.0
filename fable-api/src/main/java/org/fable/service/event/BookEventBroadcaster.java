package org.fable.service.event;

import org.fable.model.dto.Book;
import org.fable.model.websocket.LogNotification;
import org.fable.model.websocket.Topic;
import org.fable.service.book.BookService;
import org.fable.service.library.LibraryVisibilityService;
import org.fable.service.user.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class BookEventBroadcaster {

    private final SimpMessagingTemplate messagingTemplate;
    private final UserService userService;
    private final BookService bookService;
    private final LibraryVisibilityService libraryVisibilityService;

    public BookEventBroadcaster(
            SimpMessagingTemplate messagingTemplate,
            UserService userService,
            @Lazy BookService bookService,
            LibraryVisibilityService libraryVisibilityService) {
        this.messagingTemplate = messagingTemplate;
        this.userService = userService;
        this.bookService = bookService;
        this.libraryVisibilityService = libraryVisibilityService;
    }

    public void broadcastBookAddEvent(Book book) {
        Long libraryId = book.getLibraryId();
        userService.getFableUsers().stream()
                .filter(u -> libraryVisibilityService.isLibraryAccessible(u, libraryId))
                .forEach(u -> {
                    String username = u.getUsername();
                    Book enrichedBook = book.toBuilder().build();
                    bookService.enrichBooksWithAiFlags(java.util.List.of(enrichedBook), u.getId());
                    messagingTemplate.convertAndSendToUser(username, Topic.BOOK_ADD.getPath(), enrichedBook);
                    messagingTemplate.convertAndSendToUser(username, Topic.LOG.getPath(), LogNotification.info("Book added: " + (enrichedBook.getPrimaryFile() != null ? enrichedBook.getPrimaryFile().getFileName() : "unknown")));
                });
    }

    public void broadcastBookUpdateEvent(Book book) {
        Long libraryId = book.getLibraryId();
        userService.getFableUsers().stream()
                .filter(u -> libraryVisibilityService.isLibraryAccessible(u, libraryId))
                .forEach(u -> {
                    String username = u.getUsername();
                    Book enrichedBook = book.toBuilder().build();
                    bookService.enrichBooksWithAiFlags(java.util.List.of(enrichedBook), u.getId());
                    messagingTemplate.convertAndSendToUser(username, Topic.BOOK_UPDATE.getPath(), enrichedBook);
                });
    }

    public void broadcastBookBatchUpdateEvent(java.util.Collection<Book> books) {
        if (books == null || books.isEmpty()) return;
        java.util.Set<Long> libraryIds = books.stream()
                .map(Book::getLibraryId)
                .collect(java.util.stream.Collectors.toSet());

        userService.getFableUsers().stream()
                .filter(u -> {
                    java.util.Set<Long> accessible = libraryVisibilityService.getAccessibleLibraryIds(u);
                    return libraryIds.stream().anyMatch(accessible::contains);
                })
                .forEach(u -> {
                    String username = u.getUsername();
                    java.util.List<Book> enrichedBooks = books.stream()
                            .map(b -> b.toBuilder().build())
                            .collect(java.util.stream.Collectors.toList());
                    bookService.enrichBooksWithAiFlags(enrichedBooks, u.getId());
                    messagingTemplate.convertAndSendToUser(username, Topic.BOOK_METADATA_BATCH_UPDATE.getPath(), enrichedBooks);
                });
    }
}
