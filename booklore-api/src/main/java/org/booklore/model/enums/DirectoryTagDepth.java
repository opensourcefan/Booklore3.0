package org.booklore.model.enums;

public enum DirectoryTagDepth {
    /** Tag only the immediate parent folder (e.g. "Spider-Man" from "Comics/Marvel/Spider-Man"). */
    LAST_ONLY,
    /** Tag every folder level in the path (e.g. "Comics", "Marvel", and "Spider-Man"). */
    ALL_SEGMENTS
}
