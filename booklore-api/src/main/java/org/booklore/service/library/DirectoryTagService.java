package org.booklore.service.library;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookFileEntity;
import org.booklore.model.entity.LibraryEntity;
import org.booklore.model.enums.DirectoryTagDepth;
import org.booklore.repository.BookMetadataRepository;
import org.booklore.repository.BookRepository;
import org.booklore.service.book.BookCreatorService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
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

    private final BookRepository bookRepository;
    private final BookMetadataRepository bookMetadataRepository;
    private final BookCreatorService bookCreatorService;

    /**
     * Ensures every non-root book in the library has its directory tag(s) applied.
     * Which folder levels produce tags is controlled by {@code library.getDirectoryTagDepth()}:
     * <ul>
     *   <li>{@code LAST_ONLY} – tags the immediate parent folder only (default).</li>
     *   <li>{@code ALL_SEGMENTS} – tags every folder level in the path.</li>
     * </ul>
     * Books whose primary file is directly at the library root (empty subPath)
     * are intentionally skipped — there is no directory segment to use as a tag.
     */
    @Transactional
    public void applyMissingDirectoryTags(LibraryEntity library) {
        List<BookEntity> books = bookRepository.findAllByLibraryIdWithFiles(library.getId());
        DirectoryTagDepth depth = library.getDirectoryTagDepth() != null
                ? library.getDirectoryTagDepth()
                : DirectoryTagDepth.LAST_ONLY;
        int applied = 0;
        for (BookEntity book : books) {
            BookFileEntity primary = book.getPrimaryBookFile();
            if (primary == null) continue;
            String subPath = primary.getFileSubPath();
            if (subPath == null || subPath.isEmpty()) continue;
            Set<String> tags = extractDirectoryTags(subPath, depth);
            if (tags.isEmpty()) continue;
            bookCreatorService.addTagsToBook(tags, book);
            bookMetadataRepository.save(book.getMetadata());
            applied++;
        }
        log.info("Applied/verified directory tags for {}/{} books in library {}", applied, books.size(), library.getId());
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
}

