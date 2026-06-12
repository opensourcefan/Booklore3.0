package org.fable.model.dto.response;

import org.fable.model.dto.Book;

import java.util.List;

public record DuplicateGroup(
        Long suggestedTargetBookId,
        String matchReason,
        List<Book> books
) {}
