package org.fable.service.metadata.sidecar;

import org.fable.model.entity.AuthorEntity;
import org.fable.model.entity.BookEntity;
import org.fable.model.entity.BookMetadataEntity;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.nio.file.Path;
import java.nio.file.Paths;
import java.text.Normalizer;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

@Component
public class SidecarPathResolver {

    public static final String STANDARD_SIDECAR_SUFFIX = ".metadata.json";
    public static final String STANDARD_COVER_SUFFIX = ".cover.jpg";
    public static final String PHYSICAL_SIDECAR_SUFFIX = ".physical.metadata.json";
    public static final String PHYSICAL_COVER_SUFFIX = ".physical.cover.jpg";

    public Path resolveSidecarPath(BookEntity book) {
        if (book == null) {
            return null;
        }

        if (isPhysicalDirectorySidecar(book)) {
            Path libraryDirectory = resolveLibraryDirectory(book);
            if (libraryDirectory == null) {
                return null;
            }
            return libraryDirectory.resolve(buildPhysicalBaseName(book) + PHYSICAL_SIDECAR_SUFFIX);
        }

        Path bookPath = book.getFullFilePath();
        return bookPath == null ? null : resolveStandardSidecarPath(bookPath);
    }

    public Path resolveCoverPath(BookEntity book) {
        if (book == null) {
            return null;
        }

        if (isPhysicalDirectorySidecar(book)) {
            Path libraryDirectory = resolveLibraryDirectory(book);
            if (libraryDirectory == null) {
                return null;
            }
            return libraryDirectory.resolve(buildPhysicalBaseName(book) + PHYSICAL_COVER_SUFFIX);
        }

        Path bookPath = book.getFullFilePath();
        return bookPath == null ? null : resolveStandardCoverPath(bookPath);
    }

    public Path resolveStandardSidecarPath(Path bookPath) {
        String baseName = extractBaseName(bookPath);
        return bookPath.getParent().resolve(baseName + STANDARD_SIDECAR_SUFFIX);
    }

    public Path resolveStandardCoverPath(Path bookPath) {
        String baseName = extractBaseName(bookPath);
        return bookPath.getParent().resolve(baseName + STANDARD_COVER_SUFFIX);
    }

    public Path resolveCoverPathForSidecar(Path sidecarPath) {
        if (sidecarPath == null) {
            return null;
        }

        String fileName = sidecarPath.getFileName().toString();
        if (fileName.endsWith(PHYSICAL_SIDECAR_SUFFIX)) {
            String baseName = fileName.substring(0, fileName.length() - PHYSICAL_SIDECAR_SUFFIX.length());
            return sidecarPath.getParent().resolve(baseName + PHYSICAL_COVER_SUFFIX);
        }
        if (fileName.endsWith(STANDARD_SIDECAR_SUFFIX)) {
            String baseName = fileName.substring(0, fileName.length() - STANDARD_SIDECAR_SUFFIX.length());
            return sidecarPath.getParent().resolve(baseName + STANDARD_COVER_SUFFIX);
        }
        return null;
    }

    public boolean isPhysicalSidecarFile(Path sidecarPath) {
        return sidecarPath != null && sidecarPath.getFileName().toString().endsWith(PHYSICAL_SIDECAR_SUFFIX);
    }

    public boolean isPhysicalDirectorySidecar(BookEntity book) {
        return book != null
                && Boolean.TRUE.equals(book.getIsPhysical())
                && !book.hasFiles()
                && resolveLibraryDirectory(book) != null;
    }

    private Path resolveLibraryDirectory(BookEntity book) {
        if (book.getLibraryPath() == null || !StringUtils.hasText(book.getLibraryPath().getPath())) {
            return null;
        }
        return Paths.get(book.getLibraryPath().getPath());
    }

    private String buildPhysicalBaseName(BookEntity book) {
        BookMetadataEntity metadata = book.getMetadata();
        String title = sanitizeSegment(metadata != null ? metadata.getTitle() : null);
        String isbn = sanitizeSegment(firstNonBlank(metadata != null ? metadata.getIsbn13() : null, metadata != null ? metadata.getIsbn10() : null));
        String authors = sanitizeSegment(buildAuthorSegment(metadata));

        StringBuilder baseName = new StringBuilder();
        baseName.append(StringUtils.hasText(title) ? title : "physical-book");
        if (StringUtils.hasText(isbn)) {
            baseName.append("--").append(isbn);
        } else if (StringUtils.hasText(authors)) {
            baseName.append("--").append(authors);
        }
        return truncate(baseName.toString(), 140);
    }

    private String buildAuthorSegment(BookMetadataEntity metadata) {
        if (metadata == null || metadata.getAuthors() == null || metadata.getAuthors().isEmpty()) {
            return null;
        }

        List<String> authorNames = metadata.getAuthors().stream()
                .map(AuthorEntity::getName)
                .filter(StringUtils::hasText)
                .sorted(Comparator.naturalOrder())
                .toList();
        return authorNames.isEmpty() ? null : authorNames.getFirst();
    }

    private String extractBaseName(Path bookPath) {
        String fileName = bookPath.getFileName().toString();
        int dotIndex = fileName.lastIndexOf('.');
        return (dotIndex > 0) ? fileName.substring(0, dotIndex) : fileName;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value;
            }
        }
        return null;
    }

    private String sanitizeSegment(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }

        String normalized = Normalizer.normalize(value, Normalizer.Form.NFKD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("-{2,}", "-")
                .replaceAll("^-|-$", "");

        if (!StringUtils.hasText(normalized)) {
            return null;
        }

        return truncate(normalized, 80);
    }

    private String truncate(String value, int maxLength) {
        if (value == null) {
            return null;
        }
        return value.length() <= maxLength ? value : value.substring(0, maxLength);
    }
}
