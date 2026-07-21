package org.fable.service.metadata;

import lombok.RequiredArgsConstructor;
import org.fable.mapper.BookMapper;
import org.fable.model.dto.Book;
import org.fable.model.entity.BookEntity;
import org.fable.model.enums.IsbnDiscoveryStatus;
import org.fable.repository.BookRepository;
import org.fable.service.event.aop.BroadcastBookUpdate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
@RequiredArgsConstructor
public class IsbnDiscoveryStatusService {

    private static final int MAX_DETAIL_LENGTH = 1000;

    private final BookRepository bookRepository;
    private final BookMapper bookMapper;

    @Transactional
    @BroadcastBookUpdate
    public Book recordNotFound(BookEntity book, String detail) {
        return record(book, IsbnDiscoveryStatus.NOT_FOUND, detail);
    }

    @Transactional
    @BroadcastBookUpdate
    public Book recordError(BookEntity book, String detail) {
        return record(book, IsbnDiscoveryStatus.ERROR, detail);
    }

    @Transactional
    @BroadcastBookUpdate
    public Book clearRecordedProblem(BookEntity book) {
        if (book.getIsbnDiscoveryStatus() == null
                && book.getIsbnDiscoveryCheckedAt() == null
                && book.getIsbnDiscoveryDetail() == null) {
            return null;
        }
        book.setIsbnDiscoveryStatus(null);
        book.setIsbnDiscoveryCheckedAt(null);
        book.setIsbnDiscoveryDetail(null);
        bookRepository.save(book);
        return bookMapper.toBookWithDescription(book, true);
    }

    private Book record(BookEntity book, IsbnDiscoveryStatus status, String detail) {
        book.setIsbnDiscoveryStatus(status);
        book.setIsbnDiscoveryCheckedAt(Instant.now());
        book.setIsbnDiscoveryDetail(sanitizeDetail(detail));
        bookRepository.save(book);
        return bookMapper.toBookWithDescription(book, true);
    }

    private String sanitizeDetail(String detail) {
        if (detail == null || detail.isBlank()) {
            return null;
        }
        String sanitized = detail.replaceAll("[\\r\\n\\t]+", " ").trim();
        return sanitized.length() <= MAX_DETAIL_LENGTH
                ? sanitized
                : sanitized.substring(0, MAX_DETAIL_LENGTH);
    }
}
