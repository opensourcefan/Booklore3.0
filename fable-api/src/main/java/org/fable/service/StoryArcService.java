package org.fable.service;

import lombok.RequiredArgsConstructor;
import org.fable.config.security.service.AuthenticationService;
import org.fable.model.dto.Book;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.StoryArcBookMappingDto;
import org.fable.model.dto.StoryArcSummary;
import org.fable.model.dto.request.StoryArcBulkAddRequest;
import org.fable.model.dto.request.StoryArcLayoutUpdateRequest;
import org.fable.model.entity.StoryArcBookMappingEntity;
import org.fable.repository.StoryArcBookMappingRepository;
import org.fable.service.book.BookService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class StoryArcService {

    private final StoryArcBookMappingRepository repository;
    private final BookService bookService;
    private final AuthenticationService authenticationService;

    @Transactional(readOnly = true)
    public List<StoryArcSummary> getStoryArcs() {
        FableUser user = authenticationService.getAuthenticatedUser();
        List<Object[]> rows = repository.findStoryArcSummaries(user.getId());
        List<StoryArcSummary> summaries = new ArrayList<>();
        for (Object[] row : rows) {
            String name = (String) row[0];
            if (name == null || name.isBlank()) {
                continue;
            }
            int totalCount = ((Number) row[1]).intValue();
            int readCount = row[2] != null ? ((Number) row[2]).intValue() : 0;
            Long coverBookId = row[3] != null ? ((Number) row[3]).longValue() : null;

            int percent = totalCount > 0 ? (readCount * 100) / totalCount : 0;

            summaries.add(StoryArcSummary.builder()
                    .storyArcName(name)
                    .bookCount(totalCount)
                    .readBookCount(readCount)
                    .completionPercent(percent)
                    .coverBookId(coverBookId)
                    .build());
        }
        summaries.sort(Comparator.comparing(StoryArcSummary::getStoryArcName, String.CASE_INSENSITIVE_ORDER));
        return summaries;
    }

    @Transactional(readOnly = true)
    public List<StoryArcBookMappingDto> getStoryArc(String name) {
        List<StoryArcBookMappingEntity> mappings = repository.findAllByStoryArcNameOrderByRowIndexAscColIndexAsc(name);
        if (mappings.isEmpty()) {
            return Collections.emptyList();
        }

        Set<Long> bookIds = mappings.stream()
                .map(StoryArcBookMappingEntity::getBookId)
                .collect(Collectors.toSet());

        List<Book> books = bookService.getBooksByIds(bookIds, false);
        Map<Long, Book> bookMap = books.stream()
                .collect(Collectors.toMap(Book::getId, Function.identity()));

        return mappings.stream()
                .map(mapping -> StoryArcBookMappingDto.builder()
                        .id(mapping.getId())
                        .storyArcName(mapping.getStoryArcName())
                        .bookId(mapping.getBookId())
                        .rowIndex(mapping.getRowIndex())
                        .colIndex(mapping.getColIndex())
                        .sequenceOrder(mapping.getSequenceOrder())
                        .isCore(mapping.isCore())
                        .rowTitle(mapping.getRowTitle())
                        .book(bookMap.get(mapping.getBookId()))
                        .build())
                .toList();
    }

    @Transactional
    public void bulkAdd(StoryArcBulkAddRequest request) {
        String name = request.getStoryArcName();
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Story Arc name cannot be empty");
        }
        name = name.trim();

        List<StoryArcBookMappingEntity> existing = repository.findAllByStoryArcNameOrderByRowIndexAscColIndexAsc(name);
        int lastRowIndex = 0;
        int lastColIndex = -1;
        double lastSeq = 0.0;

        if (!existing.isEmpty()) {
            StoryArcBookMappingEntity lastItem = existing.get(existing.size() - 1);
            lastRowIndex = lastItem.getRowIndex();
            lastColIndex = lastItem.getColIndex();
            lastSeq = lastItem.getSequenceOrder();
        }

        Set<Long> alreadyMappedIds = existing.stream()
                .map(StoryArcBookMappingEntity::getBookId)
                .collect(Collectors.toSet());

        for (Long bookId : request.getBookIds()) {
            if (alreadyMappedIds.contains(bookId)) {
                continue;
            }

            lastColIndex++;
            lastSeq += 1.0;

            StoryArcBookMappingEntity mapping = StoryArcBookMappingEntity.builder()
                    .storyArcName(name)
                    .bookId(bookId)
                    .rowIndex(lastRowIndex)
                    .colIndex(lastColIndex)
                    .sequenceOrder(lastSeq)
                    .isCore(true) // Defaults to core issue when added
                    .build();

            repository.save(mapping);
        }
    }

    @Transactional
    public void saveLayout(String name, StoryArcLayoutUpdateRequest request) {
        String cleanName = name.trim();
        List<StoryArcBookMappingEntity> existingMappings = repository.findAllByStoryArcNameOrderByRowIndexAscColIndexAsc(cleanName);
        Map<Long, StoryArcBookMappingEntity> existingMap = existingMappings.stream()
                .collect(Collectors.toMap(StoryArcBookMappingEntity::getBookId, Function.identity()));

        Set<Long> requestBookIds = request.getItems().stream()
                .map(StoryArcLayoutUpdateRequest.LayoutItem::getBookId)
                .collect(Collectors.toSet());

        // 1. Delete items not in request (removed from arc)
        List<StoryArcBookMappingEntity> toDelete = existingMappings.stream()
                .filter(m -> !requestBookIds.contains(m.getBookId()))
                .toList();
        repository.deleteAll(toDelete);

        // 2. Update or insert layout coordinates
        for (StoryArcLayoutUpdateRequest.LayoutItem item : request.getItems()) {
            StoryArcBookMappingEntity entity = existingMap.get(item.getBookId());
            if (entity == null) {
                entity = StoryArcBookMappingEntity.builder()
                        .storyArcName(cleanName)
                        .bookId(item.getBookId())
                        .build();
            }
            entity.setRowIndex(item.getRowIndex());
            entity.setColIndex(item.getColIndex());
            entity.setSequenceOrder(item.getSequenceOrder());
            entity.setCore(item.isCore());
            entity.setRowTitle(item.getRowTitle());

            repository.save(entity);
        }
    }

    @Transactional
    public void deleteStoryArc(String name) {
        repository.deleteAllByStoryArcName(name.trim());
    }

    @Transactional
    public void removeBooksFromStoryArc(String name, List<Long> bookIds) {
        repository.deleteAllByStoryArcNameAndBookIdIn(name.trim(), bookIds);
    }
}
