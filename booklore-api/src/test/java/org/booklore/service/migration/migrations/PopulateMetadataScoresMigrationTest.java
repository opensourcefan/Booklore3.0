package org.booklore.service.migration.migrations;

import org.booklore.service.metadata.MetadataMatchService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PopulateMetadataScoresMigrationTest {

    @Mock
    private MetadataMatchService metadataMatchService;

    @InjectMocks
    private PopulateMetadataScoresMigration migration;

    @Test
    void execute_recalculatesMetadataScoresInBatches() {
        when(metadataMatchService.recalculateAllMatchScores()).thenReturn(42);

        migration.execute();

        verify(metadataMatchService).recalculateAllMatchScores();
    }
}