package org.fable.app.controller;

import org.fable.config.security.service.AuthenticationService;
import org.fable.app.dto.AppBookSummary;
import org.fable.app.dto.AppMagicShelfSummary;
import org.fable.app.dto.AppPageResponse;
import org.fable.app.dto.AppShelfSummary;
import org.fable.app.mapper.AppBookMapper;
import org.fable.app.service.AppBookService;
import org.fable.model.dto.FableUser;
import org.fable.model.entity.MagicShelfEntity;
import org.fable.model.entity.ShelfEntity;
import org.fable.repository.BookShelfMappingRepository;
import org.fable.repository.MagicShelfRepository;
import org.fable.repository.ShelfRepository;
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
        FableUser user = authenticationService.getAuthenticatedUser();
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
        FableUser user = authenticationService.getAuthenticatedUser();
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
