package org.booklore.mapper.custom;

import org.booklore.mapper.LibraryMapper;
import org.booklore.model.dto.BookLoreUser;
import org.booklore.model.entity.BookLoreUserEntity;
import org.booklore.model.entity.UserPermissionsEntity;
import org.booklore.model.entity.UserSettingEntity;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.Mockito.mock;

class BookLoreUserTransformerTest {

    @Test
    void mapsDuplicateResolutionPlanSettingIntoUserSettings() {
        BookLoreUserEntity userEntity = new BookLoreUserEntity();
        userEntity.setId(7L);
        userEntity.setUsername("reader");
        userEntity.setName("Reader");
        userEntity.setEmail("reader@example.com");
        userEntity.setPermissions(new UserPermissionsEntity());
        userEntity.setSettings(Set.of(UserSettingEntity.builder()
                .settingKey("duplicateResolutionPlan")
                .settingValue("""
                        {
                          \"savedAt\": \"2026-04-06T18:30:00Z\",
                          \"scope\": \"ALL_LIBRARIES\",
                          \"scopeLabel\": \"All libraries\",
                          \"scopeDescription\": \"Scan the whole collection\",
                          \"matchingSignals\": [\"ISBN\", \"External ID\"],
                          \"matchingConfig\": {
                            \"matchByIsbn\": true,
                            \"matchByExternalId\": true,
                            \"matchByTitleAuthor\": false,
                            \"matchByDirectory\": false,
                            \"matchByFilename\": false
                          },
                          \"queuedGroupCount\": 1,
                          \"entries\": [
                            {
                              \"groupIndex\": 1,
                              \"matchReason\": \"ISBN\",
                              \"keepBookId\": 10,
                              \"keepTitle\": \"Saga Vol. 1\",
                              \"candidateBookIds\": [11],
                              \"books\": [
                                {
                                  \"id\": 10,
                                  \"title\": \"Saga Vol. 1\",
                                  \"authors\": \"Brian K. Vaughan\",
                                  \"library\": \"Comics\",
                                  \"formats\": \"CBX\",
                                  \"path\": \"Saga/Saga 001.cbz\",
                                  \"isPreferredKeep\": true,
                                  \"isSuggestedKeep\": true
                                }
                              ]
                            }
                          ]
                        }
                        """)
                .build()));

        BookLoreUserTransformer transformer = new BookLoreUserTransformer(new ObjectMapper(), mock(LibraryMapper.class));

        BookLoreUser dto = transformer.toDTO(userEntity);

        assertNotNull(dto.getUserSettings().getDuplicateResolutionPlan());
        assertEquals("ALL_LIBRARIES", dto.getUserSettings().getDuplicateResolutionPlan().getScope());
        assertEquals(1, dto.getUserSettings().getDuplicateResolutionPlan().getQueuedGroupCount());
        assertEquals(10L, dto.getUserSettings().getDuplicateResolutionPlan().getEntries().getFirst().getKeepBookId());
    }
}