package org.booklore.service.metadata.sidecar;

import lombok.extern.slf4j.Slf4j;
import org.booklore.model.dto.sidecar.SidecarMetadata;
import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookMetadataEntity;
import org.booklore.model.enums.SidecarSyncStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;

@Slf4j
@Service
public class SidecarMetadataReader {

    private final SidecarPathResolver sidecarPathResolver;
    private final ObjectMapper objectMapper;

    public SidecarMetadataReader(SidecarPathResolver sidecarPathResolver) {
        this.sidecarPathResolver = sidecarPathResolver;
        this.objectMapper = JsonMapper.builder()
                .findAndAddModules()
                .build();
    }

    public Optional<SidecarMetadata> readSidecarMetadata(BookEntity book) {
        if (book == null) {
            return Optional.empty();
        }

        Path sidecarPath = sidecarPathResolver.resolveSidecarPath(book);
        return readSidecarMetadataFromFile(sidecarPath);
    }

    public Optional<SidecarMetadata> readSidecarMetadata(Path bookPath) {
        if (bookPath == null) {
            return Optional.empty();
        }

        Path sidecarPath = sidecarPathResolver.resolveStandardSidecarPath(bookPath);
        return readSidecarMetadataFromFile(sidecarPath);
    }

    public Optional<SidecarMetadata> readSidecarMetadataFromFile(Path sidecarPath) {
        if (sidecarPath == null) {
            return Optional.empty();
        }

        if (!Files.exists(sidecarPath)) {
            log.debug("No sidecar file found at: {}", sidecarPath);
            return Optional.empty();
        }

        try {
            String json = Files.readString(sidecarPath);
            SidecarMetadata metadata = objectMapper.readValue(json, SidecarMetadata.class);
            log.debug("Read sidecar metadata from: {}", sidecarPath);
            return Optional.of(metadata);
        } catch (IOException e) {
            log.warn("Failed to read sidecar metadata from {}: {}", sidecarPath, e.getMessage());
            return Optional.empty();
        }
    }

    public byte[] readSidecarCover(Path bookPath) {
        if (bookPath == null) {
            return null;
        }

        Path coverPath = sidecarPathResolver.resolveStandardCoverPath(bookPath);
        return readSidecarCoverFromFile(coverPath);
    }

    public byte[] readSidecarCover(BookEntity book) {
        if (book == null) {
            return null;
        }

        Path coverPath = sidecarPathResolver.resolveCoverPath(book);
        return readSidecarCoverFromFile(coverPath);
    }

    public byte[] readSidecarCoverFromFile(Path coverPath) {
        if (coverPath == null) {
            return null;
        }

        if (!Files.exists(coverPath)) {
            log.debug("No sidecar cover file found at: {}", coverPath);
            return null;
        }

        try {
            return Files.readAllBytes(coverPath);
        } catch (IOException e) {
            log.warn("Failed to read sidecar cover from {}: {}", coverPath, e.getMessage());
            return null;
        }
    }

    public SidecarSyncStatus getSyncStatus(BookEntity book) {
        if (book == null) {
            return SidecarSyncStatus.NOT_APPLICABLE;
        }

        Path sidecarPath = sidecarPathResolver.resolveSidecarPath(book);
        if (sidecarPath == null) {
            return SidecarSyncStatus.NOT_APPLICABLE;
        }

        if (!Files.exists(sidecarPath)) {
            return SidecarSyncStatus.MISSING;
        }

        Optional<SidecarMetadata> sidecarOpt = readSidecarMetadataFromFile(sidecarPath);
        if (sidecarOpt.isEmpty()) {
            return SidecarSyncStatus.MISSING;
        }

        SidecarMetadata sidecar = sidecarOpt.get();
        BookMetadataEntity dbMetadata = book.getMetadata();

        if (dbMetadata == null) {
            return SidecarSyncStatus.CONFLICT;
        }

        // Check content first - if metadata matches, it's in sync regardless of timestamps
        if (!isMetadataDifferent(sidecar, dbMetadata)) {
            return SidecarSyncStatus.IN_SYNC;
        }

        // Content differs - use timestamps to determine which is newer
        if (sidecar.getGeneratedAt() != null && book.getMetadataUpdatedAt() != null) {
            if (book.getMetadataUpdatedAt().isAfter(sidecar.getGeneratedAt())) {
                return SidecarSyncStatus.OUTDATED;  // DB is newer, sidecar needs update
            }
        }

        return SidecarSyncStatus.CONFLICT;  // Sidecar is newer or timestamps unavailable
    }

    public boolean sidecarExists(Path bookPath) {
        if (bookPath == null) {
            return false;
        }
        Path sidecarPath = sidecarPathResolver.resolveStandardSidecarPath(bookPath);
        return Files.exists(sidecarPath);
    }

    private boolean isMetadataDifferent(SidecarMetadata sidecar, BookMetadataEntity db) {
        if (sidecar.getMetadata() == null) {
            return true;
        }

        var sm = sidecar.getMetadata();

        if (!nullSafeEquals(sm.getTitle(), db.getTitle())) return true;
        if (!nullSafeEquals(sm.getSubtitle(), db.getSubtitle())) return true;
        if (!nullSafeEquals(sm.getPublisher(), db.getPublisher())) return true;
        if (!nullSafeEquals(sm.getDescription(), db.getDescription())) return true;
        if (!nullSafeEquals(sm.getIsbn10(), db.getIsbn10())) return true;
        if (!nullSafeEquals(sm.getIsbn13(), db.getIsbn13())) return true;
        if (!nullSafeEquals(sm.getLanguage(), db.getLanguage())) return true;
        if (!nullSafeEquals(sm.getPageCount(), db.getPageCount())) return true;

        if (sm.getSeries() != null) {
            if (!nullSafeEquals(sm.getSeries().getName(), db.getSeriesName())) return true;
            if (!nullSafeEquals(sm.getSeries().getNumber(), db.getSeriesNumber())) return true;
            if (!nullSafeEquals(sm.getSeries().getTotal(), db.getSeriesTotal())) return true;
        } else if (db.getSeriesName() != null || db.getSeriesNumber() != null || db.getSeriesTotal() != null) {
            return true;
        }

        return false;
    }

    private boolean nullSafeEquals(Object a, Object b) {
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;
        return a.equals(b);
    }
}
