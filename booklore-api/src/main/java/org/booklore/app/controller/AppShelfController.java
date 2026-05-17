package org.booklore.app.controller;

import org.booklore.config.security.service.AuthenticationService;
import org.booklore.app.dto.AppBookSummary;
import org.booklore.app.dto.AppMagicShelfSummary;
import org.booklore.app.dto.AppPageResponse;
import org.booklore.app.dto.AppShelfSummary;
import org.booklore.app.mapper.AppBookMapper;
import org.booklore.app.service.AppBookService;
import org.booklore.model.dto.BookLoreUser;
import org.booklore.model.entity.MagicShelfEntity;
import org.booklore.model.entity.ShelfEntity;
import org.booklore.repository.BookShelfMappingRepository;
import org.booklore.repository.MagicShelfRepository;
import org.booklore.repository.ShelfRepository;
import lombok.AllArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@AllArgsConstructor
@RestController
@RequestMapping("/api/v1/app/shelves")
public class AppShelfController {

    private final AuthenticationService authenticationService;
    private final ShelfRepository shelfRepository;
    private final MagicShelfRepository magicShelfRepository;
    private final BookShelfMappingRepository bookShelfMappingRepository;
    private final AppBookMapper mobileBookMapper;
    private final AppBookService mobileBookService;

    @GetMapping
    public ResponseEntity<List<AppShelfSummary>> getShelves() {
        BookLoreUser user = authenticationService.getAuthenticatedUser();
        Long userId = user.getId();

        List<ShelfEntity> shelves = shelfRepository.findByUserIdOrPublicShelfTrue(userId);

        List<Long> shelfIds = shelves.stream()
                .map(ShelfEntity::getId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());

        Map<Long, Long> countMap = Collections.emptyMap();
        if (!shelfIds.isEmpty()) {
            List<Object[]> results = bookShelfMappingRepository.countByShelfIdIn(shelfIds);
            countMap = new HashMap<>();
            for (Object[] row : results) {
                countMap.put((Long) row[0], (Long) row[1]);
            }
        }
        final Map<Long, Long> finalCountMap = countMap;

        List<AppShelfSummary> summaries = shelves.stream()
                .map(shelf -> {
                    long count = finalCountMap.getOrDefault(shelf.getId(), 0L);
                    return mobileBookMapper.toShelfSummaryFromEntity(shelf, count);
                })
                .collect(Collectors.toList());

        return ResponseEntity.ok(summaries);
    }

    @GetMapping("/magic")
    public ResponseEntity<List<AppMagicShelfSummary>> getMagicShelves() {
        BookLoreUser user = authenticationService.getAuthenticatedUser();
        Long userId = user.getId();

        // Get user's own magic shelves
        List<MagicShelfEntity> userShelves = magicShelfRepository.findAllByUserId(userId);

        // Get public magic shelves
        List<MagicShelfEntity> publicShelves = magicShelfRepository.findAllByIsPublicIsTrue();

        // Combine and deduplicate (user's shelves that are also public shouldn't appear twice)
        Set<Long> seenIds = new HashSet<>();
        List<MagicShelfEntity> allShelves = new ArrayList<>();

        for (MagicShelfEntity shelf : userShelves) {
            if (seenIds.add(shelf.getId())) {
                allShelves.add(shelf);
            }
        }
        for (MagicShelfEntity shelf : publicShelves) {
            if (seenIds.add(shelf.getId())) {
                allShelves.add(shelf);
            }
        }

        List<AppMagicShelfSummary> summaries = allShelves.stream()
                .map(mobileBookMapper::toMagicShelfSummary)
                .collect(Collectors.toList());

        return ResponseEntity.ok(summaries);
    }

    @GetMapping("/magic/{magicShelfId}/books")
    public ResponseEntity<AppPageResponse<AppBookSummary>> getBooksByMagicShelf(
            @PathVariable Long magicShelfId,
            @RequestParam(required = false, defaultValue = "0") Integer page,
            @RequestParam(required = false, defaultValue = "20") Integer size) {

        return ResponseEntity.ok(mobileBookService.getBooksByMagicShelf(magicShelfId, page, size));
    }
}
