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
import org.fable.service.library.LibraryVisibilityService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * Story arcs are part of the working-catalog isolation lane: list/detail/mutates
 * only consider books in {@link LibraryVisibilityService#getAccessibleLibraryIds}.
 */
@Service
@RequiredArgsConstructor
public class StoryArcService {

    private final StoryArcRepository storyArcRepository;
    private final StoryArcBookMappingRepository repository;
    private final BookService bookService;
    private final AuthenticationService authenticationService;
    private final LibraryVisibilityService libraryVisibilityService;

    @Transactional(readOnly = true)
    public List<StoryArcSummary> getStoryArcs() {
        FableUser user = authenticationService.getAuthenticatedUser();
        Set<Long> libraryIds = libraryVisibilityService.getAccessibleLibraryIds(user);
        if (libraryIds.isEmpty()) {
            return List.of();
        }

        List<Object[]> rows = storyArcRepository.findStoryArcSummariesWithUserProgress(user.getId(), libraryIds);
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
        FableUser user = authenticationService.getAuthenticatedUser();
        Set<Long> libraryIds = libraryVisibilityService.getAccessibleLibraryIds(user);
        if (libraryIds.isEmpty()) {
            return Collections.emptyList();
        }

        StoryArcEntity arc = storyArcRepository.findByName(name).orElse(null);
        if (arc == null) {
            return Collections.emptyList();
        }

        List<StoryArcBookMappingEntity> mappings = repository.findAllByStoryArcNameOrderByRowIndexAscColIndexAsc(name);
        // Empty drafts (name-only arcs) return chapter/metadata sentinels so the editor can open.
        if (mappings.isEmpty()) {
            return buildEmptyArcSentinels(arc);
        }

        Set<Long> bookIds = mappings.stream()
                .map(StoryArcBookMappingEntity::getBookId)
                .collect(Collectors.toSet());

        List<Book> books = bookService.getBooksByIds(bookIds, false);
        Map<Long, Book> bookMap = books.stream()
                .collect(Collectors.toMap(Book::getId, Function.identity()));

        List<StoryArcBookMappingEntity> accessibleMappings = mappings.stream()
                .filter(mapping -> bookMap.containsKey(mapping.getBookId()))
                .toList();
        if (accessibleMappings.isEmpty()) {
            return Collections.emptyList();
        }

        Long visibleCoverId = resolveVisibleCoverBookId(arc.getCoverBookId(), bookMap, accessibleMappings);

        return accessibleMappings.stream()
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
                        .coverBookId(visibleCoverId)
                        .book(bookMap.get(mapping.getBookId()))
                        .build())
                .collect(Collectors.toCollection(ArrayList::new));
    }

    private List<StoryArcBookMappingDto> buildEmptyArcSentinels(StoryArcEntity arc) {
        List<String> titles = new ArrayList<>();
        if (arc.getRowTitles() != null && !arc.getRowTitles().isBlank()) {
            for (String line : arc.getRowTitles().split("\n", -1)) {
                titles.add(line);
            }
        }
        if (titles.isEmpty()) {
            titles.add("Chapter 1");
        }

        List<StoryArcBookMappingDto> sentinels = new ArrayList<>(titles.size());
        for (int i = 0; i < titles.size(); i++) {
            String title = titles.get(i);
            if (title == null || title.isBlank()) {
                title = "Chapter " + (i + 1);
            }
            sentinels.add(StoryArcBookMappingDto.builder()
                    .storyArcName(arc.getName())
                    .bookId(null)
                    .rowIndex(i)
                    .colIndex(0)
                    .sequenceOrder(0)
                    .isCore(true)
                    .rowTitle(title)
                    .externalUrl(arc.getExternalUrl())
                    .description(arc.getDescription())
                    .coverBookId(null)
                    .build());
        }
        return sentinels;
    }

    @Transactional
    public void bulkAdd(StoryArcBulkAddRequest request) {
        String name = request.getStoryArcName();
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("Story Arc name cannot be empty");
        }
        name = name.trim();

        StoryArcEntity arc = storyArcRepository.findByName(name).orElse(null);
        if (arc == null) {
            arc = StoryArcEntity.builder()
                    .name(name)
                    .build();
            arc = storyArcRepository.save(arc);
        }

        List<StoryArcBookMappingEntity> existing = repository.findAllByStoryArcNameOrderByRowIndexAscColIndexAsc(name);
        Set<Long> alreadyMappedIds = existing.stream()
                .map(StoryArcBookMappingEntity::getBookId)
                .collect(Collectors.toSet());

        List<Long> requestedNewIds = request.getBookIds().stream()
                .filter(id -> !alreadyMappedIds.contains(id))
                .toList();
        List<Long> newBookIds = retainAccessibleBookIds(requestedNewIds);

        if (newBookIds.isEmpty()) {
            return;
        }

        int maxExistingRowIndex = existing.stream()
                .mapToInt(StoryArcBookMappingEntity::getRowIndex)
                .max()
                .orElse(-1);

        if (Boolean.TRUE.equals(request.isGroupBySeries())) {
            List<Book> books = bookService.getBooksByIds(new HashSet<>(newBookIds), false);
            Map<Long, String> bookSeriesMap = new LinkedHashMap<>();
            for (Book b : books) {
                String series = (b.getMetadata() != null && b.getMetadata().getSeriesName() != null)
                        ? b.getMetadata().getSeriesName().trim()
                        : "Unsorted";
                bookSeriesMap.put(b.getId(), series);
            }

            Map<String, List<Long>> groupedBySeries = new LinkedHashMap<>();
            for (Long bookId : newBookIds) {
                String series = bookSeriesMap.getOrDefault(bookId, "Unsorted");
                groupedBySeries.computeIfAbsent(series, k -> new ArrayList<>()).add(bookId);
            }

            List<String> sortedSeries = new ArrayList<>(groupedBySeries.keySet());
            sortedSeries.sort((a, b) -> {
                if ("Unsorted".equals(a)) return 1;
                if ("Unsorted".equals(b)) return -1;
                return a.compareToIgnoreCase(b);
            });

            int rowIdx = maxExistingRowIndex + 1;
            double seq = existing.isEmpty() ? 0.0
                    : existing.get(existing.size() - 1).getSequenceOrder();

            for (String series : sortedSeries) {
                List<Long> seriesBookIds = groupedBySeries.get(series);
                int colIdx = 0;
                for (Long bookId : seriesBookIds) {
                    seq += 1.0;
                    StoryArcBookMappingEntity mapping = StoryArcBookMappingEntity.builder()
                            .storyArcName(name)
                            .storyArcId(arc.getId())
                            .bookId(bookId)
                            .rowIndex(rowIdx)
                            .colIndex(colIdx)
                            .sequenceOrder(seq)
                            .isCore(true)
                            .rowTitle(series)
                            .build();
                    repository.save(mapping);
                    colIdx++;
                }
                rowIdx++;
            }
        } else {
            int targetRowIndex;
            String targetRowTitle = null;
            int targetColIndex;
            double targetSeq;

            if (request.getTargetRowIndex() != null) {
                if (request.getTargetRowIndex() == -1) {
                    targetRowIndex = maxExistingRowIndex + 1;
                    targetRowTitle = request.getRowTitle();
                    targetColIndex = 0;
                    targetSeq = existing.isEmpty() ? 0.0
                            : existing.get(existing.size() - 1).getSequenceOrder();
                } else if ("above".equals(request.getPosition()) || "below".equals(request.getPosition())) {
                    int insertAt = request.getTargetRowIndex();
                    if ("below".equals(request.getPosition())) {
                        insertAt = request.getTargetRowIndex() + 1;
                    }
                    for (StoryArcBookMappingEntity m : existing) {
                        if (m.getRowIndex() >= insertAt) {
                            m.setRowIndex(m.getRowIndex() + 1);
                            repository.save(m);
                        }
                    }
                    targetRowIndex = insertAt;
                    targetRowTitle = request.getRowTitle();
                    targetColIndex = 0;
                    double maxSeqBefore = 0.0;
                    for (StoryArcBookMappingEntity m : existing) {
                        if (m.getRowIndex() < insertAt && m.getSequenceOrder() > maxSeqBefore) {
                            maxSeqBefore = m.getSequenceOrder();
                        }
                    }
                    targetSeq = existing.isEmpty() ? 0.0 : maxSeqBefore;
                } else {
                    targetRowIndex = request.getTargetRowIndex();
                    targetRowTitle = request.getRowTitle();
                    int maxCol = -1;
                    double maxSeq = 0.0;
                    for (StoryArcBookMappingEntity m : existing) {
                        if (m.getRowIndex() == targetRowIndex) {
                            if (m.getColIndex() > maxCol) maxCol = m.getColIndex();
                            if (m.getSequenceOrder() > maxSeq) maxSeq = m.getSequenceOrder();
                        }
                    }
                    targetColIndex = maxCol + 1;
                    targetSeq = maxSeq > 0 ? maxSeq : (existing.isEmpty() ? 0.0
                            : existing.get(existing.size() - 1).getSequenceOrder());
                }
            } else {
                if (!existing.isEmpty()) {
                    StoryArcBookMappingEntity lastItem = existing.get(existing.size() - 1);
                    targetRowIndex = lastItem.getRowIndex();
                    targetColIndex = lastItem.getColIndex();
                    targetSeq = lastItem.getSequenceOrder();
                } else {
                    targetRowIndex = 0;
                    targetColIndex = -1;
                    targetSeq = 0.0;
                }
            }

            for (Long bookId : newBookIds) {
                targetColIndex++;
                targetSeq += 1.0;

                StoryArcBookMappingEntity mapping = StoryArcBookMappingEntity.builder()
                        .storyArcName(name)
                        .storyArcId(arc.getId())
                        .bookId(bookId)
                        .rowIndex(targetRowIndex)
                        .colIndex(targetColIndex)
                        .sequenceOrder(targetSeq)
                        .isCore(true)
                        .rowTitle(targetRowTitle)
                        .build();

                repository.save(mapping);
            }
        }
    }

    @Transactional
    public void saveLayout(String name, StoryArcLayoutUpdateRequest request) {
        String cleanName = name.trim();

        StoryArcEntity arc = storyArcRepository.findByName(cleanName).orElse(null);
        if (arc == null) {
            arc = StoryArcEntity.builder()
                    .name(cleanName)
                    .externalUrl(request.getExternalUrl())
                    .description(request.getDescription())
                    .build();
        } else {
            arc.setExternalUrl(request.getExternalUrl());
            arc.setDescription(request.getDescription());
        }

        if (request.getRowTitles() != null && !request.getRowTitles().isEmpty()) {
            arc.setRowTitles(String.join("\n", request.getRowTitles()));
        } else {
            arc.setRowTitles(null);
        }
        storyArcRepository.save(arc);

        List<StoryArcBookMappingEntity> existingMappings = repository.findAllByStoryArcNameOrderByRowIndexAscColIndexAsc(cleanName);
        Map<Long, StoryArcBookMappingEntity> existingMap = existingMappings.stream()
                .collect(Collectors.toMap(StoryArcBookMappingEntity::getBookId, Function.identity()));

        Set<Long> requestBookIds = request.getItems().stream()
                .map(StoryArcLayoutUpdateRequest.LayoutItem::getBookId)
                .collect(Collectors.toSet());
        Set<Long> accessibleRequestBookIds = new HashSet<>(retainAccessibleBookIds(new ArrayList<>(requestBookIds)));

        Set<Long> existingBookIds = existingMappings.stream()
                .map(StoryArcBookMappingEntity::getBookId)
                .collect(Collectors.toSet());
        Set<Long> accessibleExistingBookIds = new HashSet<>(retainAccessibleBookIds(new ArrayList<>(existingBookIds)));

        // Only remove mappings the caller can see — never wipe another catalog's books from a shared arc.
        List<StoryArcBookMappingEntity> toDelete = existingMappings.stream()
                .filter(m -> accessibleExistingBookIds.contains(m.getBookId()))
                .filter(m -> !requestBookIds.contains(m.getBookId()))
                .toList();
        repository.deleteAll(toDelete);

        for (StoryArcLayoutUpdateRequest.LayoutItem item : request.getItems()) {
            if (!accessibleRequestBookIds.contains(item.getBookId())) {
                continue;
            }
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

            org.jsoup.select.Elements contentParagraphs = doc.select(".entry-content .x-text.x-content, .entry-content p, article p, main p, .post-content p");
            for (org.jsoup.nodes.Element elem : contentParagraphs) {
                elem.select("br").append("\n");
                String text = elem.text().trim();

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
    public void setCoverBook(String name, Long coverBookId) {
        StoryArcEntity arc = storyArcRepository.findByName(name.trim()).orElse(null);
        if (arc == null) {
            return;
        }
        if (coverBookId != null && retainAccessibleBookIds(List.of(coverBookId)).isEmpty()) {
            return;
        }
        arc.setCoverBookId(coverBookId);
        storyArcRepository.save(arc);
    }

    @Transactional
    public void deleteStoryArc(String name) {
        storyArcRepository.deleteByName(name.trim());
    }

    @Transactional
    public void removeBooksFromStoryArc(String name, List<Long> bookIds) {
        List<Long> accessible = retainAccessibleBookIds(bookIds);
        if (accessible.isEmpty()) {
            return;
        }
        repository.deleteAllByStoryArcNameAndBookIdIn(name.trim(), accessible);
    }

    private List<Long> retainAccessibleBookIds(List<Long> bookIds) {
        if (bookIds == null || bookIds.isEmpty()) {
            return List.of();
        }
        return bookService.getBooksByIds(new HashSet<>(bookIds), false).stream()
                .map(Book::getId)
                .toList();
    }

    private Long resolveVisibleCoverBookId(
            Long preferredCoverId,
            Map<Long, Book> bookMap,
            List<StoryArcBookMappingEntity> accessibleMappings) {
        if (preferredCoverId != null && bookMap.containsKey(preferredCoverId)) {
            return preferredCoverId;
        }
        return accessibleMappings.stream()
                .map(StoryArcBookMappingEntity::getBookId)
                .filter(bookMap::containsKey)
                .findFirst()
                .orElse(null);
    }
}
