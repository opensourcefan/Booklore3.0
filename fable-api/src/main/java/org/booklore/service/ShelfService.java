package org.booklore.service;

import org.booklore.config.security.service.AuthenticationService;
import org.booklore.exception.ApiError;
import org.booklore.mapper.BookMapper;
import org.booklore.mapper.ShelfMapper;
import org.booklore.model.dto.Book;
import org.booklore.model.dto.BookLoreUser;
import org.booklore.model.dto.Shelf;
import org.booklore.model.dto.request.ShelfCreateRequest;
import org.booklore.model.entity.BookLoreUserEntity;
import org.booklore.model.entity.ShelfEntity;
import org.booklore.model.enums.ShelfType;
import org.booklore.repository.BookRepository;
import org.booklore.repository.BookShelfMappingRepository;
import org.booklore.repository.ShelfRepository;
import org.booklore.repository.UserRepository;
import lombok.AllArgsConstructor;
import org.booklore.model.enums.AuditAction;
import org.booklore.service.audit.AuditService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@AllArgsConstructor
@Service
public class ShelfService {

    private final ShelfRepository shelfRepository;
    private final BookRepository bookRepository;
    private final BookShelfMappingRepository bookShelfMappingRepository;
    private final ShelfMapper shelfMapper;
    private final BookMapper bookMapper;
    private final AuthenticationService authenticationService;
    private final UserRepository userRepository;
    private final AuditService auditService;

    public Shelf createShelf(ShelfCreateRequest request) {
        Long userId = getAuthenticatedUserId();
        if (shelfRepository.existsByUserIdAndName(userId, request.getName())) {
            throw ApiError.SHELF_ALREADY_EXISTS.createException(request.getName());
        }
        if (request.isPublicShelf() && !authenticationService.getAuthenticatedUser().getPermissions().isAdmin()) {
            throw new org.springframework.security.access.AccessDeniedException("Only admins can create public shelves");
        }
        ShelfEntity shelfEntity = ShelfEntity.builder()
                .icon(request.getIcon())
                .name(request.getName())
                .iconType(request.getIconType())
                .isPublic(request.isPublicShelf())
                .user(fetchUserEntityById(userId))
                .build();
        Shelf result = shelfMapper.toShelf(shelfRepository.save(shelfEntity));
        result.setBookCount(0); // Newly created shelf always has 0 books
        auditService.log(AuditAction.SHELF_CREATED, "Shelf", shelfEntity.getId(), "Created shelf: " + request.getName());
        return result;
    }

    public Shelf updateShelf(Long id, ShelfCreateRequest request) {
        ShelfEntity shelfEntity = findShelfByIdOrThrow(id);
        if (request.isPublicShelf() && !authenticationService.getAuthenticatedUser().getPermissions().isAdmin()) {
            throw new org.springframework.security.access.AccessDeniedException("Only admins can create public shelves");
        }
        shelfEntity.setName(request.getName());
        shelfEntity.setIcon(request.getIcon());
        shelfEntity.setIconType(request.getIconType());
        shelfEntity.setPublic(request.isPublicShelf());
        Shelf result = shelfMapper.toShelf(shelfRepository.save(shelfEntity));
        result.setBookCount((int) bookShelfMappingRepository.countByShelfId(shelfEntity.getId()));
        auditService.log(AuditAction.SHELF_UPDATED, "Shelf", id, "Updated shelf: " + request.getName());
        return result;
    }

    public List<Shelf> getShelves() {
        Long userId = getAuthenticatedUserId();
        List<ShelfEntity> shelfEntities = shelfRepository.findByUserIdOrPublicShelfTrue(userId);

        List<Long> shelfIds = shelfEntities.stream()
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

        return shelfEntities.stream()
                .map(shelfEntity -> {
                    Shelf shelf = shelfMapper.toShelf(shelfEntity);
                    shelf.setBookCount(finalCountMap.getOrDefault(shelfEntity.getId(), 0L).intValue());
                    return shelf;
                })
                .toList();
    }

    public Shelf getShelf(Long shelfId) {
        ShelfEntity shelfEntity = findShelfByIdOrThrow(shelfId);
        Shelf shelf = shelfMapper.toShelf(shelfEntity);
        shelf.setBookCount((int) bookShelfMappingRepository.countByShelfId(shelfEntity.getId()));
        return shelf;
    }

    public void deleteShelf(Long shelfId) {
        shelfRepository.deleteById(shelfId);
        auditService.log(AuditAction.SHELF_DELETED, "Shelf", shelfId, "Deleted shelf: " + shelfId);
    }

    public Shelf getUserKoboShelf() {
        Long userId = getAuthenticatedUserId();
        Optional<ShelfEntity> koboShelf = shelfRepository.findByUserIdAndName(userId, ShelfType.KOBO.getName());
        return koboShelf.map(shelfEntity -> {
            Shelf shelf = shelfMapper.toShelf(shelfEntity);
            shelf.setBookCount((int) bookShelfMappingRepository.countByShelfId(shelfEntity.getId()));
            return shelf;
        }).orElse(null);
    }

    public List<Book> getShelfBooks(Long shelfId) {
        findShelfByIdOrThrow(shelfId);
        return bookRepository.findAllWithMetadataByShelfId(shelfId).stream()
                .map(bookMapper::toBook)
                .toList();
    }

    private Long getAuthenticatedUserId() {
        BookLoreUser user = authenticationService.getAuthenticatedUser();
        return user.getId();
    }

    private BookLoreUserEntity fetchUserEntityById(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new UsernameNotFoundException("User not found with ID " + userId));
    }

    private ShelfEntity findShelfByIdOrThrow(Long shelfId) {
        return shelfRepository.findById(shelfId)
                .orElseThrow(() -> ApiError.SHELF_NOT_FOUND.createException(shelfId));
    }

    public Optional<ShelfEntity> getShelf(Long id, String name) {
        return shelfRepository.findByUserIdAndName(id, name);
    }
}