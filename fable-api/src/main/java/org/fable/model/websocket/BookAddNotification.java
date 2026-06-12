package org.fable.model.websocket;

import org.fable.model.dto.Book;
import lombok.Data;

@Data
public class BookAddNotification {
    private Book addedBook;
}
