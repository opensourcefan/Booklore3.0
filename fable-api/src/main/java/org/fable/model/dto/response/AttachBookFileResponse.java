package org.fable.model.dto.response;

import org.fable.model.dto.Book;

import java.util.List;

public record AttachBookFileResponse(Book updatedBook, List<Long> deletedSourceBookIds) {}
