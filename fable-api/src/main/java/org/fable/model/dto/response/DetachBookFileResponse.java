package org.fable.model.dto.response;

import org.fable.model.dto.Book;

public record DetachBookFileResponse(Book sourceBook, Book newBook) {}
