package org.fable.model.enums;

import lombok.Getter;

public enum TaskType {
    REFRESH_LIBRARY_METADATA(
            false,
            true,
            false,
            false,
            "Refresh Metadata",
            "Re-reads book information (title, author, cover, etc.) from your files and updates the Fable database."
    ),
    UPDATE_BOOK_RECOMMENDATIONS(
            false,
            true,
            true,
            false,
            "Update Book Recommendations",
            "Analyzes your library to generate personalized book recommendations based on the books you own."
    ),
    CLEANUP_DELETED_BOOKS(
            false,
            false,
            true,
            false,
            "Cleanup Deleted Books",
            "Permanently removes database entries for books you previously deleted from your libraries."
    ),
    SYNC_LIBRARY_FILES(
            false,
            false,
            true,
            false,
            "Sync Library Files",
            "Scans your library folders to detect new books and removes entries for files that no longer exist."
    ),
    DIRECTORY_TAGGING(
            false,
            true,
            false,
            false,
            "Directory Tagging",
            "Applies and backfills directory-based tags for imported books so folder tags can finish in the background after imports complete."
    ),
    BOOKDROP_PERIODIC_SCANNING(
            false,
            false,
            true,
            false,
            "Bookdrop Periodic Scanning",
            "Scans the bookdrop ingest folder for newly added files and queues them for bookdrop processing."
    ),
    CLEANUP_TEMP_METADATA(
            false,
            false,
            true,
            false,
            "Cleanup Temporary Metadata",
            "Removes temporary metadata files created during the bookdrop and manual metadata review processes."
    ),
    REFRESH_METADATA_MANUAL(
            false,
            true,
            false,
            true,
            "Refresh Metadata",
            "Updates metadata information for your selected books."
    ),
    FLUSH_METADATA_TO_FILES(
            false,
            true,
            false,
            false,
        "Push Metadata to Files",
        "Writes the current database metadata back to the original book files for all books where the file has not yet been updated. Only available in LOCAL storage mode."
    ),
    AI_SEARCH_EMBED_MARKED(
        false,
        true,
        true,
        false,
        "Scan Marked AI Search Embeddings",
        "Extracts text and generates embeddings for books that have been marked for AI Search embedding."
    );

    @Getter
    private final boolean parallel;

    @Getter
    private final boolean async;

    @Getter
    private final boolean cronSupported;

    @Getter
    private final boolean hiddenFromUI;

    @Getter
    private final String name;

    @Getter
    private final String description;

    TaskType(boolean parallel, boolean async, boolean cronSupported, boolean hiddenFromUI, String name, String description) {
        this.parallel = parallel;
        this.async = async;
        this.cronSupported = cronSupported;
        this.hiddenFromUI = hiddenFromUI;
        this.name = name;
        this.description = description;
    }
}
