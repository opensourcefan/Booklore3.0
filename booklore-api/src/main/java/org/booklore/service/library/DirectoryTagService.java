package org.booklore.service.library;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookFileEntity;
import org.booklore.repository.BookMetadataRepository;
import org.booklore.repository.BookRepository;
import org.booklore.service.book.BookCreatorService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.file.Path;
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
     * Ensures every non-root book in the library has its parent-directory tag.
     * Books whose primary file is directly at the library root (empty subPath)
     * are intentionally skipped — there is no directory segment to use as a tag.
     */
    @Transactional
    public void applyMissingDirectoryTags(Long libraryId) {
        List<BookEntity> books = bookRepository.findAllByLibraryIdWithFiles(libraryId);
        int applied = 0;
        for (BookEntity book : books) {
            BookFileEntity primary = book.getPrimaryBookFile();
            if (primary == null) continue;
            String subPath = primary.getFileSubPath();
            if (subPath == null || subPath.isEmpty()) continue;
            Path lastSegment = Path.of(subPath).getFileName();
            if (lastSegment == null) continue;
            String expectedTag = lastSegment.toString();
            if (expectedTag.isEmpty()) continue;
            bookCreatorService.addTagsToBook(Set.of(expectedTag), book);
            bookMetadataRepository.save(book.getMetadata());
            applied++;
        }
        log.info("Applied/verified directory tags for {}/{} books in library {}", applied, books.size(), libraryId);
    }
}
