package org.booklore.service.metadata.sidecar;

import lombok.extern.slf4j.Slf4j;
import org.booklore.config.AppProperties;
import org.booklore.model.dto.settings.MetadataPersistenceSettings;
import org.booklore.model.dto.settings.SidecarSettings;
import org.booklore.model.dto.sidecar.SidecarMetadata;
import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookMetadataEntity;
import org.booklore.service.appsettings.AppSettingService;
import org.booklore.util.FileService;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

@Slf4j
@Service
public class SidecarMetadataWriter {

    private final AppProperties appProperties;
    private final SidecarMetadataMapper mapper;
    private final SidecarPathResolver sidecarPathResolver;
    private final FileService fileService;
    private final AppSettingService appSettingService;
    private final ObjectMapper objectMapper;

    public SidecarMetadataWriter(AppProperties appProperties, SidecarMetadataMapper mapper, SidecarPathResolver sidecarPathResolver, FileService fileService, AppSettingService appSettingService) {
        this.appProperties = appProperties;
        this.mapper = mapper;
        this.sidecarPathResolver = sidecarPathResolver;
        this.fileService = fileService;
        this.appSettingService = appSettingService;
        this.objectMapper = JsonMapper.builder()
                .findAndAddModules()
                .configure(SerializationFeature.INDENT_OUTPUT, true)
                .build();
    }

    public void writeSidecarMetadata(BookEntity book) {
        writeSidecarMetadata(book, false);
    }

    public boolean writeSidecarMetadata(BookEntity book, boolean forceWrite) {
        if (!appProperties.isLocalStorage()) {
            return false;
        }
        if (book == null || book.getMetadata() == null) {
            log.warn("Cannot write sidecar metadata: book or metadata is null");
            return false;
        }

        boolean physicalDirectorySidecar = sidecarPathResolver.isPhysicalDirectorySidecar(book);
        SidecarSettings settings = getSidecarSettings();
        if (!forceWrite && !physicalDirectorySidecar && (settings == null || !settings.isEnabled())) {
            log.debug("Sidecar metadata is disabled");
            return false;
        }

        try {
            Path sidecarPath = sidecarPathResolver.resolveSidecarPath(book);
            if (sidecarPath == null) {
                log.warn("Cannot write sidecar metadata: no sidecar target path available");
                return false;
            }

            if (!physicalDirectorySidecar) {
                Path bookPath = book.getFullFilePath();
                if (bookPath == null || !Files.exists(bookPath)) {
                    log.warn("Cannot write sidecar metadata: book file does not exist");
                    return false;
                }
            }

            Files.createDirectories(sidecarPath.getParent());
            BookMetadataEntity metadata = book.getMetadata();

            String coverFileName = null;
            if (physicalDirectorySidecar || (settings != null && settings.isIncludeCoverFile())) {
                Path coverPath = sidecarPathResolver.resolveCoverPath(book);
                if (coverPath != null) {
                    coverFileName = coverPath.getFileName().toString();
                    writeCoverFile(book, coverPath);
                }
            }

            SidecarMetadata sidecarMetadata = mapper.toSidecarMetadata(metadata, coverFileName);
            String json = objectMapper.writeValueAsString(sidecarMetadata);
            json = json.replace(" : ", ": ").replace("[ ]", "[]");
            Files.writeString(sidecarPath, json);

            log.info("Wrote sidecar metadata to: {}", sidecarPath);
            return true;
        } catch (IOException e) {
            log.error("Failed to write sidecar metadata for book ID {}: {}", book.getId(), e.getMessage());
            return false;
        }
    }

    public void deleteSidecarFiles(Path bookPath) {
        if (bookPath == null) {
            return;
        }

        try {
            Path sidecarPath = sidecarPathResolver.resolveStandardSidecarPath(bookPath);
            if (Files.exists(sidecarPath)) {
                Files.delete(sidecarPath);
                log.info("Deleted sidecar file: {}", sidecarPath);
            }

            Path coverPath = sidecarPathResolver.resolveStandardCoverPath(bookPath);
            if (Files.exists(coverPath)) {
                Files.delete(coverPath);
                log.info("Deleted sidecar cover file: {}", coverPath);
            }
        } catch (IOException e) {
            log.warn("Failed to delete sidecar files for {}: {}", bookPath, e.getMessage());
        }
    }

    public void deleteSidecarFiles(BookEntity book) {
        if (book == null) {
            return;
        }

        Path sidecarPath = sidecarPathResolver.resolveSidecarPath(book);
        Path coverPath = sidecarPathResolver.resolveCoverPath(book);
        deleteResolvedSidecarFiles(sidecarPath, coverPath);
    }

    public void moveSidecarFiles(Path oldBookPath, Path newBookPath) {
        if (oldBookPath == null || newBookPath == null) {
            return;
        }

        try {
            Path oldSidecarPath = sidecarPathResolver.resolveStandardSidecarPath(oldBookPath);
            if (Files.exists(oldSidecarPath)) {
                Path newSidecarPath = sidecarPathResolver.resolveStandardSidecarPath(newBookPath);
                Files.createDirectories(newSidecarPath.getParent());
                Files.move(oldSidecarPath, newSidecarPath, StandardCopyOption.REPLACE_EXISTING);
                log.info("Moved sidecar file from {} to {}", oldSidecarPath, newSidecarPath);
            }

            Path oldCoverPath = sidecarPathResolver.resolveStandardCoverPath(oldBookPath);
            if (Files.exists(oldCoverPath)) {
                Path newCoverPath = sidecarPathResolver.resolveStandardCoverPath(newBookPath);
                Files.move(oldCoverPath, newCoverPath, StandardCopyOption.REPLACE_EXISTING);
                log.info("Moved sidecar cover from {} to {}", oldCoverPath, newCoverPath);
            }
        } catch (IOException e) {
            log.warn("Failed to move sidecar files from {} to {}: {}", oldBookPath, newBookPath, e.getMessage());
        }
    }

    private void writeCoverFile(BookEntity book, Path coverPath) {
        if (coverPath == null) {
            return;
        }

        try {
            String coverFile = fileService.getCoverFile(book.getId());
            Path sourceCoverPath = Path.of(coverFile);
            if (Files.exists(sourceCoverPath)) {
                Files.createDirectories(coverPath.getParent());
                Files.copy(sourceCoverPath, coverPath, StandardCopyOption.REPLACE_EXISTING);
                log.info("Wrote cover file to: {}", coverPath);
            }
        } catch (IOException e) {
            log.warn("Failed to write cover file for book ID {}: {}", book.getId(), e.getMessage());
        }
    }

    private void deleteResolvedSidecarFiles(Path sidecarPath, Path coverPath) {
        try {
            if (sidecarPath != null && Files.exists(sidecarPath)) {
                Files.delete(sidecarPath);
                log.info("Deleted sidecar file: {}", sidecarPath);
            }

            if (coverPath != null && Files.exists(coverPath)) {
                Files.delete(coverPath);
                log.info("Deleted sidecar cover file: {}", coverPath);
            }
        } catch (IOException e) {
            log.warn("Failed to delete resolved sidecar files: {}", e.getMessage());
        }
    }

    private SidecarSettings getSidecarSettings() {
        MetadataPersistenceSettings settings = appSettingService.getAppSettings().getMetadataPersistenceSettings();
        return settings != null ? settings.getSidecarSettings() : null;
    }

    public boolean isWriteOnUpdateEnabled() {
        SidecarSettings settings = getSidecarSettings();
        return settings != null && settings.isEnabled() && settings.isWriteOnUpdate();
    }

    public boolean isWriteOnScanEnabled() {
        SidecarSettings settings = getSidecarSettings();
        return settings != null && settings.isEnabled() && settings.isWriteOnScan();
    }
}
