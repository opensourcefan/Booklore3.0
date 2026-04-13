package org.booklore.service.library;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookFileEntity;
import org.booklore.model.entity.LibraryEntity;
import org.booklore.model.entity.TagEntity;
import org.booklore.model.enums.DirectoryTagDepth;
import org.booklore.repository.BookMetadataRepository;
import org.booklore.repository.BookRepository;
import org.booklore.repository.TagRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import java.util.Set;

/**
 * Applies and verifies directory-based tags for all books in a library.
 * <p>
 * When a library has {@code tagByDirectory} enabled, every book whose primary
 * file lives inside a subdirectory should carry the name of that directory as a
 * tag. This service provides a reliable post-import pass that ensures no book is
 * left untagged, using the already-persisted {@code fileSubPath} data on each
 * {@link BookFileEntity}.
 * </p>
 * <p>
 * The operation is idempotent — books that already carry the expected tag are
 * left unchanged.
 * </p>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class DirectoryTagService {

    private static final int CHUNK_SIZE = 100;
    private static final int ETA_MIN_BOOKS = 25;
    private static final long ETA_MIN_ELAPSED_MS = 3_000L;

    private final BookRepository bookRepository;
    private final BookMetadataRepository bookMetadataRepository;
    private final TagRepository tagRepository;

    /**
         * Ensures every book in the library has its directory tag(s) applied.
     * Which folder levels produce tags is controlled by {@code library.getDirectoryTagDepth()}:
     * <ul>
     *   <li>{@code LAST_ONLY} – tags the immediate parent folder only (default).</li>
     *   <li>{@code ALL_SEGMENTS} – tags every folder level in the path.</li>
     * </ul>
         * Books at the library root still receive the root folder name as a tag.
     */
    @Transactional
    public void applyMissingDirectoryTags(LibraryEntity library) {
        applyMissingDirectoryTags(library, null, null, null);
        }

        @Transactional
        public DirectoryTagRunResult applyMissingDirectoryTags(
            LibraryEntity library,
            Set<Long> bookIds,
            Consumer<DirectoryTagProgressSnapshot> progressCallback,
            BooleanSupplier cancellationCheck
        ) {
        List<BookEntity> books = loadBooksForTagging(library.getId(), bookIds);
        DirectoryTagDepth depth = library.getDirectoryTagDepth() != null
                ? library.getDirectoryTagDepth()
                : DirectoryTagDepth.LAST_ONLY;

        // Build map: libraryPathId → root folder name (the selected library folder itself).
        // fileSubPath is relative to this root, so the root name is never included in
        // extractDirectoryTags — we must add it explicitly here.
        Map<Long, String> rootFolderNames = new HashMap<>();
        for (var lp : library.getLibraryPaths()) {
            Path rootFolderName = Path.of(lp.getPath()).getFileName();
            if (rootFolderName != null && !rootFolderName.toString().isEmpty()) {
                rootFolderNames.put(lp.getId(), rootFolderName.toString());
            }
        }

        int updatedBooks = 0;
        int processedBooks = 0;
        long startedAt = System.currentTimeMillis();

        for (int start = 0; start < books.size(); start += CHUNK_SIZE) {
            if (cancellationCheck != null && cancellationCheck.getAsBoolean()) {
                log.info("Cancelled directory tagging for library {} after processing {}/{} books", library.getId(), processedBooks, books.size());
                return new DirectoryTagRunResult(processedBooks, books.size(), updatedBooks, true);
            }

            List<BookEntity> chunk = books.subList(start, Math.min(start + CHUNK_SIZE, books.size()));
            updatedBooks += applyChunk(chunk, rootFolderNames, depth);
            processedBooks += chunk.size();

            if (progressCallback != null) {
                progressCallback.accept(new DirectoryTagProgressSnapshot(
                        library.getId(),
                        library.getName(),
                        processedBooks,
                        books.size(),
                        updatedBooks,
                        estimateRemainingMs(processedBooks, books.size(), startedAt)
                ));
            }
        }

        log.info("Applied/verified directory tags for {}/{} books in library {}", updatedBooks, books.size(), library.getId());
        return new DirectoryTagRunResult(books.size(), books.size(), updatedBooks, false);
    }

    @Transactional
    public DirectoryTagRunResult applyMissingDirectoryTags(
            LibraryEntity library,
            Consumer<DirectoryTagProgressSnapshot> progressCallback,
            BooleanSupplier cancellationCheck
    ) {
        return applyMissingDirectoryTags(library, null, progressCallback, cancellationCheck);
    }

    /**
     * Extracts the set of tag strings from a {@code fileSubPath} according to the given depth setting.
     */
    public static Set<String> extractDirectoryTags(String subPath, DirectoryTagDepth depth) {
        Set<String> tags = new HashSet<>();
        if (depth == DirectoryTagDepth.ALL_SEGMENTS) {
            Path p = Path.of(subPath);
            for (int i = 0; i < p.getNameCount(); i++) {
                String seg = p.getName(i).toString();
                if (!seg.isEmpty()) tags.add(seg);
            }
        } else {
            Path lastSegment = Path.of(subPath).getFileName();
            if (lastSegment != null && !lastSegment.toString().isEmpty()) {
                tags.add(lastSegment.toString());
            }
        }
        return tags;
    }

    private List<BookEntity> loadBooksForTagging(Long libraryId, Set<Long> bookIds) {
        if (bookIds == null || bookIds.isEmpty()) {
            return bookRepository.findAllByLibraryIdWithFiles(libraryId);
        }
        return bookRepository.findAllWithMetadataByLibraryIdAndIds(libraryId, bookIds);
    }

    private int applyChunk(List<BookEntity> chunk, Map<Long, String> rootFolderNames, DirectoryTagDepth depth) {
        Map<Long, Set<String>> expectedTagsByBookId = new HashMap<>();
        Map<String, String> normalizedToName = new HashMap<>();

        for (BookEntity book : chunk) {
            Set<String> expectedTags = expectedTagsForBook(book, rootFolderNames, depth);
            expectedTagsByBookId.put(book.getId(), expectedTags);
            expectedTags.forEach(tag -> normalizedToName.putIfAbsent(normalizeTagName(tag), tag));
        }

        if (normalizedToName.isEmpty()) {
            return 0;
        }

        Map<String, TagEntity> resolvedTags = resolveTags(normalizedToName);
        List<org.booklore.model.entity.BookMetadataEntity> modifiedMetadata = new ArrayList<>();

        for (BookEntity book : chunk) {
            Set<String> expectedTags = expectedTagsByBookId.getOrDefault(book.getId(), Collections.emptySet());
            if (expectedTags.isEmpty() || book.getMetadata() == null) {
                continue;
            }

            if (book.getMetadata().getTags() == null) {
                book.getMetadata().setTags(new HashSet<>());
            }

            Set<String> existingNormalized = book.getMetadata().getTags().stream()
                    .map(TagEntity::getName)
                    .map(this::normalizeTagName)
                    .collect(java.util.stream.Collectors.toSet());

            boolean modified = false;
            for (String expectedTag : expectedTags) {
                String normalized = normalizeTagName(expectedTag);
                TagEntity tagEntity = resolvedTags.get(normalized);
                if (tagEntity != null && existingNormalized.add(normalized)) {
                    book.getMetadata().getTags().add(tagEntity);
                    modified = true;
                }
            }

            if (modified) {
                modifiedMetadata.add(book.getMetadata());
            }
        }

        if (!modifiedMetadata.isEmpty()) {
            bookMetadataRepository.saveAll(modifiedMetadata);
        }
        return modifiedMetadata.size();
    }

    private Set<String> expectedTagsForBook(BookEntity book, Map<Long, String> rootFolderNames, DirectoryTagDepth depth) {
        BookFileEntity primary = book.getPrimaryBookFile();
        if (primary == null || book.getLibraryPath() == null) {
            return Collections.emptySet();
        }

        Set<String> tags = new HashSet<>();
        String rootName = rootFolderNames.get(book.getLibraryPath().getId());
        if (rootName != null) {
            tags.add(rootName);
        }

        String subPath = primary.getFileSubPath();
        if (subPath != null && !subPath.isEmpty()) {
            tags.addAll(extractDirectoryTags(subPath, depth));
        }

        return tags;
    }

    private Map<String, TagEntity> resolveTags(Map<String, String> normalizedToName) {
        Map<String, TagEntity> resolved = new HashMap<>();
        List<TagEntity> existingTags = tagRepository.findAllByNormalizedNames(normalizedToName.keySet());
        for (TagEntity tag : existingTags) {
            resolved.put(normalizeTagName(tag.getName()), tag);
        }

        List<TagEntity> missingTags = normalizedToName.entrySet().stream()
                .filter(entry -> !resolved.containsKey(entry.getKey()))
                .map(entry -> TagEntity.builder().name(entry.getValue()).build())
                .toList();

        if (!missingTags.isEmpty()) {
            List<TagEntity> savedTags = tagRepository.saveAll(missingTags);
            for (TagEntity tag : savedTags) {
                resolved.put(normalizeTagName(tag.getName()), tag);
            }
        }

        return resolved;
    }

    private Long estimateRemainingMs(int processedBooks, int totalBooks, long startedAt) {
        if (processedBooks <= 0 || processedBooks >= totalBooks) {
            return null;
        }
        long elapsedMs = System.currentTimeMillis() - startedAt;
        if (processedBooks < ETA_MIN_BOOKS || elapsedMs < ETA_MIN_ELAPSED_MS) {
            return null;
        }
        long remainingBooks = totalBooks - processedBooks;
        return Math.max(1L, Math.round((elapsedMs / (double) processedBooks) * remainingBooks));
    }

    private String normalizeTagName(String tagName) {
        return Optional.ofNullable(tagName)
                .map(name -> name.trim().toLowerCase(Locale.ROOT))
                .orElse("");
    }

    public record DirectoryTagProgressSnapshot(
            Long libraryId,
            String libraryName,
            int processedBooks,
            int totalBooks,
            int updatedBooks,
            Long estimatedRemainingMs
    ) {
    }

    public record DirectoryTagRunResult(int processedBooks, int totalBooks, int updatedBooks, boolean cancelled) {
    }
}

