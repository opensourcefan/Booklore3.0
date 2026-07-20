package org.fable.model.dto;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MetadataBatchProgressNotificationTest {

    @Test
    void sixArgConstructor_defaultsPhaseToNull() {
        MetadataBatchProgressNotification n = new MetadataBatchProgressNotification(
                "task-1", 0, 2, "Starting", "IN_PROGRESS", false);

        assertThat(n.getPhase()).isNull();
        assertThat(n.isResumable()).isFalse();
        assertThat(n.getPendingCount()).isNull();
    }

    @Test
    void eightArgConstructor_defaultsPhaseToNull() {
        MetadataBatchProgressNotification n = new MetadataBatchProgressNotification(
                "task-1", 1, 3, "Done", "COMPLETED", true, true, 2);

        assertThat(n.getPhase()).isNull();
        assertThat(n.isResumable()).isTrue();
        assertThat(n.getPendingCount()).isEqualTo(2);
    }

    @Test
    void nineArgConstructor_preservesIsbnPhases() {
        MetadataBatchProgressNotification discovery = new MetadataBatchProgressNotification(
                "task-1", 0, 1, "ISBN fetch", "IN_PROGRESS", false, false, null,
                MetadataBatchProgressNotification.PHASE_ISBN_DISCOVERY);
        MetadataBatchProgressNotification metadata = new MetadataBatchProgressNotification(
                "task-1", 0, 1, "Metadata fetch", "IN_PROGRESS", false, false, null,
                MetadataBatchProgressNotification.PHASE_METADATA_FETCH);
        MetadataBatchProgressNotification failed = new MetadataBatchProgressNotification(
                "task-1", 0, 1, "No ISBN", "IN_PROGRESS", false, false, null,
                MetadataBatchProgressNotification.PHASE_ISBN_FAILED);

        assertThat(discovery.getPhase()).isEqualTo("ISBN_DISCOVERY");
        assertThat(metadata.getPhase()).isEqualTo("METADATA_FETCH");
        assertThat(failed.getPhase()).isEqualTo("ISBN_FAILED");
    }
}
