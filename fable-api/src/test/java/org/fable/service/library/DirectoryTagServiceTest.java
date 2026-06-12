package org.fable.service.library;

import org.fable.model.enums.DirectoryTagDepth;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class DirectoryTagServiceTest {

    // -----------------------------------------------------------------------
    // LAST_ONLY
    // -----------------------------------------------------------------------

    @Test
    void lastOnly_singleSegment_returnsThatSegment() {
        Set<String> tags = DirectoryTagService.extractDirectoryTags("Comics", DirectoryTagDepth.LAST_ONLY);
        assertThat(tags).containsExactly("Comics");
    }

    @Test
    void lastOnly_multipleSegments_returnsOnlyLastSegment() {
        Set<String> tags = DirectoryTagService.extractDirectoryTags("Comics/Marvel/Spider-Man", DirectoryTagDepth.LAST_ONLY);
        assertThat(tags).containsExactly("Spider-Man");
    }

    @Test
    void lastOnly_emptyPath_returnsEmptySet() {
        Set<String> tags = DirectoryTagService.extractDirectoryTags("", DirectoryTagDepth.LAST_ONLY);
        assertThat(tags).isEmpty();
    }

    // -----------------------------------------------------------------------
    // ALL_SEGMENTS
    // -----------------------------------------------------------------------

    @Test
    void allSegments_singleSegment_returnsThatSegment() {
        Set<String> tags = DirectoryTagService.extractDirectoryTags("Comics", DirectoryTagDepth.ALL_SEGMENTS);
        assertThat(tags).containsExactlyInAnyOrder("Comics");
    }

    @Test
    void allSegments_multipleSegments_returnsEveryLevel() {
        Set<String> tags = DirectoryTagService.extractDirectoryTags("Comics/Marvel/Spider-Man", DirectoryTagDepth.ALL_SEGMENTS);
        assertThat(tags).containsExactlyInAnyOrder("Comics", "Marvel", "Spider-Man");
    }

    @Test
    void allSegments_twoSegments_returnsBoth() {
        Set<String> tags = DirectoryTagService.extractDirectoryTags("Novels/Sci-Fi", DirectoryTagDepth.ALL_SEGMENTS);
        assertThat(tags).containsExactlyInAnyOrder("Novels", "Sci-Fi");
    }

    @Test
    void allSegments_emptyPath_returnsEmptySet() {
        Set<String> tags = DirectoryTagService.extractDirectoryTags("", DirectoryTagDepth.ALL_SEGMENTS);
        assertThat(tags).isEmpty();
    }

    @Test
    void allSegments_deduplicatesSegments() {
        // Unusual but valid: same folder name appearing at different levels
        Set<String> tags = DirectoryTagService.extractDirectoryTags("A/B/A", DirectoryTagDepth.ALL_SEGMENTS);
        // Set deduplication — "A" appears only once
        assertThat(tags).containsExactlyInAnyOrder("A", "B");
    }

    // -----------------------------------------------------------------------
    // null depth falls back to LAST_ONLY behaviour via the callers (not tested
    // here — callers guard null before calling extractDirectoryTags)
    //
    // NOTE: extractDirectoryTags operates on the subPath RELATIVE to the library
    // root.  The library root folder name itself is added by applyMissingDirectoryTags
    // directly (not by extractDirectoryTags), so it is intentionally absent from
    // the results of this static helper.
    // -----------------------------------------------------------------------
}
