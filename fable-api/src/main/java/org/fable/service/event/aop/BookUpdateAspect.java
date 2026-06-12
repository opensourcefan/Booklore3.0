package org.fable.service.event.aop;

import org.aspectj.lang.annotation.AfterReturning;
import org.aspectj.lang.annotation.Aspect;
import org.fable.model.dto.Book;
import org.fable.model.websocket.Topic;
import org.fable.service.event.BookEventBroadcaster;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Collection;

@Slf4j
@Aspect
@Component
@AllArgsConstructor
public class BookUpdateAspect {

    private final BookEventBroadcaster bookEventBroadcaster;

    @AfterReturning(pointcut = "@annotation(org.fable.service.event.aop.BroadcastBookUpdate)", returning = "result")
    public void broadcastBookUpdate(Object result) {
        if (result == null) {
            return;
        }

        try {
            if (result instanceof Book book) {
                log.debug("AOP Intercepted Book update: {}, broadcasting to {}", book.getId(), Topic.BOOK_UPDATE);
                bookEventBroadcaster.broadcastBookUpdateEvent(book);
            } else if (result instanceof Collection<?> collection) {
                if (!collection.isEmpty() && collection.iterator().next() instanceof Book) {
                    log.debug("AOP Intercepted Book collection update of size {}, broadcasting to {}", collection.size(), Topic.BOOK_METADATA_BATCH_UPDATE);
                    bookEventBroadcaster.broadcastBookBatchUpdateEvent((Collection<Book>) collection);
                }
            } else {
                log.warn("@BroadcastBookUpdate applied to a method returning an unsupported type: {}", result.getClass().getName());
            }
        } catch (Exception e) {
            log.error("Failed to broadcast book update via AOP", e);
        }
    }
}
