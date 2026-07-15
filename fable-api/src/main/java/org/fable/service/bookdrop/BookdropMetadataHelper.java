package org.fable.service.bookdrop;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.fable.config.security.service.AuthenticationService;
import org.fable.model.dto.BookMetadata;
import org.fable.model.dto.FableUser;
import org.fable.model.entity.BookdropFileEntity;
import org.fable.repository.BookdropFileRepository;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.util.Collections;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class BookdropMetadataHelper {

    private final BookdropFileRepository bookdropFileRepository;
    private final ObjectMapper objectMapper;
    private final AuthenticationService authenticationService;
    private final BookdropInboxService bookdropInboxService;

    public List<Long> resolveFileIds(boolean selectAll, List<Long> excludedIds, List<Long> selectedIds) {
        FableUser user = authenticationService.getAuthenticatedUser();
        boolean admin = bookdropInboxService.isAdminUser(user);
        Long ownerId = user != null ? user.getId() : null;

        if (selectAll) {
            List<Long> excluded = excludedIds != null ? excludedIds : Collections.emptyList();
            if (admin) {
                return excluded.isEmpty()
                        ? bookdropFileRepository.findAllGlobalIds()
                        : bookdropFileRepository.findAllGlobalExcludingIdsFlat(excluded);
            }
            if (ownerId == null) {
                return Collections.emptyList();
            }
            return excluded.isEmpty()
                    ? bookdropFileRepository.findAllIdsByOwnerUserId(ownerId)
                    : bookdropFileRepository.findAllByOwnerExcludingIdsFlat(ownerId, excluded);
        }

        List<Long> requested = selectedIds != null ? selectedIds : Collections.emptyList();
        if (requested.isEmpty()) {
            return Collections.emptyList();
        }
        return bookdropFileRepository.findAllById(requested).stream()
                .filter(file -> canAccess(file, user, admin))
                .map(BookdropFileEntity::getId)
                .toList();
    }

    private boolean canAccess(BookdropFileEntity file, FableUser user, boolean admin) {
        if (admin) {
            return file.getOwnerUserId() == null;
        }
        return user != null && user.getId() != null && user.getId().equals(file.getOwnerUserId());
    }

    public BookMetadata getCurrentMetadata(BookdropFileEntity file) {
        try {
            String fetchedMetadataJson = file.getFetchedMetadata();
            if (fetchedMetadataJson != null && !fetchedMetadataJson.isBlank()) {
                return objectMapper.readValue(fetchedMetadataJson, BookMetadata.class);
            }
        } catch (Exception e) {
            log.error("Error parsing existing metadata for file {}: {}", file.getId(), e.getMessage());
        }
        return new BookMetadata();
    }

    public void updateFetchedMetadata(BookdropFileEntity file, BookMetadata metadata) {
        try {
            String updatedMetadataJson = objectMapper.writeValueAsString(metadata);
            file.setFetchedMetadata(updatedMetadataJson);
        } catch (Exception e) {
            log.error("Error serializing metadata for file {}: {}", file.getId(), e.getMessage());
            throw new RuntimeException("Failed to update metadata", e);
        }
    }

    public void mergeMetadata(BookMetadata target, BookMetadata source) {
        if (source.getSeriesName() != null) target.setSeriesName(source.getSeriesName());
        if (source.getTitle() != null) target.setTitle(source.getTitle());
        if (source.getSubtitle() != null) target.setSubtitle(source.getSubtitle());
        if (source.getAuthors() != null && !source.getAuthors().isEmpty()) target.setAuthors(source.getAuthors());
        if (source.getSeriesNumber() != null) target.setSeriesNumber(source.getSeriesNumber());
        if (source.getPublishedDate() != null) target.setPublishedDate(source.getPublishedDate());
        if (source.getPublisher() != null) target.setPublisher(source.getPublisher());
        if (source.getLanguage() != null) target.setLanguage(source.getLanguage());
        if (source.getSeriesTotal() != null) target.setSeriesTotal(source.getSeriesTotal());
        if (source.getIsbn10() != null) target.setIsbn10(source.getIsbn10());
        if (source.getIsbn13() != null) target.setIsbn13(source.getIsbn13());
        if (source.getAsin() != null) target.setAsin(source.getAsin());
    }
}
