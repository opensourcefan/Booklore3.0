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
import org.fable.model.entity.StoryArcEntity;
import org.fable.repository.StoryArcBookMappingRepository;
import org.fable.repository.StoryArcRepository;
import org.fable.service.book.BookService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class StoryArcService {

    private final StoryArcRepository storyArcRepository;
    private final StoryArcBookMappingRepository repository;
    private final BookService bookService;
    private final AuthenticationService authenticationService;

    @Transactional(readOnly = true)
    public List<StoryArcSummary> getStoryArcs() {
        FableUser user = authenticationService.getAuthenticatedUser();
        List<Object[]> rows = storyArcRepository.findStoryArcSummariesWithUserProgress(user.getId());
        List<StoryArcSummary> summaries = new ArrayList<>();
        for (Object[] row : rows) {
            StoryArcEntity arc = (StoryArcEntity) row[0];
            String name = arc.getName();
            if (name == null || name.isBlank()) {
                continue;
            }
            int totalCount = row[1] != null ? ((Number) row[1]).intValue() : 0;
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
        StoryArcEntity arc = storyArcRepository.findByName(name).orElse(null);
        if (arc == null) {
            return Collections.emptyList();
        }

        List<StoryArcBookMappingEntity> mappings = repository.findAllByStoryArcNameOrderByRowIndexAscColIndexAsc(name);

        // If there are no mappings, return a sentinel DTO carrying arc metadata
        // so the frontend can still display the summary/guide.
        if (mappings.isEmpty()) {
            StoryArcBookMappingDto sentinel = StoryArcBookMappingDto.builder()
                    .storyArcName(arc.getName())
                    .externalUrl(arc.getExternalUrl())
                    .description(arc.getDescription())
                    .build();
            return Collections.singletonList(sentinel);
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
                        .externalUrl(mapping.getExternalUrl() != null ? mapping.getExternalUrl() : arc.getExternalUrl())
                        .description(mapping.getDescription() != null ? mapping.getDescription() : arc.getDescription())
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

        // Ensure the story arc entity exists
        StoryArcEntity arc = storyArcRepository.findByName(name).orElse(null);
        if (arc == null) {
            arc = StoryArcEntity.builder()
                    .name(name)
                    .build();
            arc = storyArcRepository.save(arc);
        }

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
                    .storyArcId(arc.getId())
                    .bookId(bookId)
                    .rowIndex(lastRowIndex)
                    .colIndex(lastColIndex)
                    .sequenceOrder(lastSeq)
                    .isCore(true)
                    .build();

            repository.save(mapping);
        }
    }

    @Transactional
    public void saveLayout(String name, StoryArcLayoutUpdateRequest request) {
        String cleanName = name.trim();

        // Ensure the story arc entity exists and update its metadata
        StoryArcEntity arc = storyArcRepository.findByName(cleanName).orElse(null);
        if (arc == null) {
            arc = StoryArcEntity.builder()
                    .name(cleanName)
                    .externalUrl(request.getExternalUrl())
                    .description(request.getDescription())
                    .build();
            arc = storyArcRepository.save(arc);
        } else {
            arc.setExternalUrl(request.getExternalUrl());
            arc.setDescription(request.getDescription());
            storyArcRepository.save(arc);
        }

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
                        .storyArcId(arc.getId())
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

    public org.fable.model.dto.StoryArcMetadataDto fetchWebMetadata(String url) {
        if (url == null || url.isBlank()) {
            return org.fable.model.dto.StoryArcMetadataDto.builder().build();
        }
        try {
            org.jsoup.nodes.Document doc = org.jsoup.Jsoup.connect(url.trim())
                    .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
                    .timeout(10000)
                    .get();

            String title = doc.select("meta[property=og:title]").attr("content");
            if (title.isBlank()) {
                title = doc.title();
            }

            StringBuilder sb = new StringBuilder();

            // Target body content paragraphs (.entry-content, .cs-content, article, main)
            org.jsoup.select.Elements contentParagraphs = doc.select(".entry-content .x-text.x-content, .entry-content p, article p, main p, .post-content p");
            for (org.jsoup.nodes.Element elem : contentParagraphs) {
                // Preserve <br> tags as line breaks
                elem.select("br").append("\n");
                String text = elem.text().trim();

                // Exclude generic site welcome messages or tab navigation headers
                String lower = text.toLowerCase();
                if (lower.startsWith("welcome to our") && lower.contains("reading order")) {
                    continue;
                }
                if (lower.contains("cookie") || lower.contains("copyright") || lower.equals("single issues") || lower.equals("ongoing series") || lower.equals("comments")) {
                    continue;
                }
                if (text.length() > 15 && !sb.toString().contains(text)) {
                    if (!sb.isEmpty()) {
                        sb.append("\n\n");
                    }
                    sb.append(text);
                    if (sb.length() > 700) break;
                }
            }

            String description = sb.toString().trim();

            // Fallback to meta description if content body yielded nothing
            if (description.isBlank()) {
                description = doc.select("meta[property=og:description]").attr("content");
                if (description.isBlank()) {
                    description = doc.select("meta[name=description]").attr("content");
                }
            }

            return org.fable.model.dto.StoryArcMetadataDto.builder()
                    .externalUrl(url)
                    .scrapedTitle(title)
                    .scrapedDescription(description)
                    .build();
        } catch (Exception e) {
            return org.fable.model.dto.StoryArcMetadataDto.builder()
                    .externalUrl(url)
                    .scrapedTitle("")
                    .scrapedDescription("")
                    .build();
        }
    }

    @Transactional
    public void deleteStoryArc(String name) {
        storyArcRepository.deleteByName(name.trim());
    }

    @Transactional
    public void removeBooksFromStoryArc(String name, List<Long> bookIds) {
        repository.deleteAllByStoryArcNameAndBookIdIn(name.trim(), bookIds);
    }
}
