package org.booklore.service.migration.migrations;

import org.booklore.service.metadata.MetadataMatchService;
import org.booklore.service.migration.Migration;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class PopulateMetadataScoresMigration implements Migration {

    private final MetadataMatchService metadataMatchService;

    @Override
    public String getKey() {
        return "populateMetadataScores_v2";
    }

    @Override
    public String getDescription() {
        return "Calculate and store metadata match score for all books";
    }

    @Override
    public void execute() {
        log.info("Starting migration: {}", getKey());

        int updatedBooks = metadataMatchService.recalculateAllMatchScores();

        log.info("Migration '{}' applied to {} books.", getKey(), updatedBooks);
    }
}
