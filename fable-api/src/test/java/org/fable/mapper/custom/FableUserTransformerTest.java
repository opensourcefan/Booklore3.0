package org.fable.mapper.custom;

import org.fable.mapper.LibraryMapper;
import org.fable.model.dto.FableUser;
import org.fable.model.entity.FableUserEntity;
import org.fable.model.entity.UserPermissionsEntity;
import org.fable.model.entity.UserSettingEntity;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

class FableUserTransformerTest {

    @Test
    void mapsDashboardConfigSettingIntoUserSettings() {
        FableUserEntity userEntity = new FableUserEntity();
        userEntity.setId(8L);
        userEntity.setUsername("dashboard-user");
        userEntity.setName("Dashboard User");
        userEntity.setEmail("dashboard@example.com");
        userEntity.setPermissions(new UserPermissionsEntity());
        userEntity.setSettings(Set.of(UserSettingEntity.builder()
                .settingKey("dashboardConfig")
                .settingValue("""
                        {
                          \"layoutLocked\": true,
                          \"scrollers\": [
                            {
                              \"id\": \"scroller-1\",
                              \"type\": \"random\",
                              \"title\": \"dashboard.scroller.discoverNew\",
                              \"enabled\": true,
                              \"order\": 1,
                              \"maxItems\": 10,
                              \"libraryId\": 3,
                              \"columnSpan\": 4
                            }
                          ]
                        }
                        """)
                .build()));

        FableUserTransformer transformer = new FableUserTransformer(new ObjectMapper(), mock(LibraryMapper.class));

        FableUser dto = transformer.toDTO(userEntity);

        assertNotNull(dto.getUserSettings().getDashboardConfig());
        assertTrue(Boolean.TRUE.equals(dto.getUserSettings().getDashboardConfig().getLayoutLocked()));
        assertEquals(1, dto.getUserSettings().getDashboardConfig().getScrollers().size());
        assertEquals(3L, dto.getUserSettings().getDashboardConfig().getScrollers().getFirst().getLibraryId());
        assertEquals(4, dto.getUserSettings().getDashboardConfig().getScrollers().getFirst().getColumnSpan());
    }

    @Test
    void mapsDuplicateResolutionPlanSettingIntoUserSettings() {
        FableUserEntity userEntity = new FableUserEntity();
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

        FableUserTransformer transformer = new FableUserTransformer(new ObjectMapper(), mock(LibraryMapper.class));

        FableUser dto = transformer.toDTO(userEntity);

        assertNotNull(dto.getUserSettings().getDuplicateResolutionPlan());
        assertEquals("ALL_LIBRARIES", dto.getUserSettings().getDuplicateResolutionPlan().getScope());
        assertEquals(1, dto.getUserSettings().getDuplicateResolutionPlan().getQueuedGroupCount());
        assertEquals(10L, dto.getUserSettings().getDuplicateResolutionPlan().getEntries().getFirst().getKeepBookId());
    }
}