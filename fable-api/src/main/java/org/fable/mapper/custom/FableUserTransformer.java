package org.fable.mapper.custom;

import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.fable.mapper.LibraryMapper;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.settings.SidebarSortOption;
import org.fable.model.dto.settings.UserSettingKey;
import org.fable.model.entity.FableUserEntity;
import org.fable.model.entity.UserSettingEntity;
import org.fable.model.enums.UserPermission;
import org.springframework.stereotype.Component;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.util.Collections;
import java.util.stream.Collectors;

@Slf4j
@Component
@AllArgsConstructor
public class FableUserTransformer {

    private final ObjectMapper objectMapper;
    private final LibraryMapper libraryMapper;

    public FableUser toDTO(FableUserEntity userEntity) {
        FableUser.UserPermissions permissions = new FableUser.UserPermissions();
        UserPermission.copyFromEntityToDto(userEntity.getPermissions(), permissions);

        FableUser fableUser = new FableUser();
        fableUser.setId(userEntity.getId());
        fableUser.setUsername(userEntity.getUsername());
        fableUser.setName(userEntity.getName());
        fableUser.setEmail(userEntity.getEmail());
        fableUser.setDefaultPassword(userEntity.isDefaultPassword());
        fableUser.setPermissions(permissions);

        FableUser.UserSettings userSettings = new FableUser.UserSettings();

        for (UserSettingEntity settingEntity : userEntity.getSettings()) {
            String key = settingEntity.getSettingKey();
            String value = settingEntity.getSettingValue();

            try {
                UserSettingKey settingKey = UserSettingKey.fromDbKey(key);
                if (settingKey.isJson()) {
                    switch (settingKey) {
                        case PER_BOOK_SETTING -> userSettings.setPerBookSetting(objectMapper.readValue(value, FableUser.UserSettings.PerBookSetting.class));
                        case PDF_READER_SETTING -> userSettings.setPdfReaderSetting(objectMapper.readValue(value, FableUser.UserSettings.PdfReaderSetting.class));
                        case EPUB_READER_SETTING -> userSettings.setEpubReaderSetting(objectMapper.readValue(value, FableUser.UserSettings.EpubReaderSetting.class));
                        case EBOOK_READER_SETTING -> userSettings.setEbookReaderSetting(objectMapper.readValue(value, FableUser.UserSettings.EbookReaderSetting.class));
                        case CBX_READER_SETTING -> userSettings.setCbxReaderSetting(objectMapper.readValue(value, FableUser.UserSettings.CbxReaderSetting.class));
                        case NEW_PDF_READER_SETTING -> userSettings.setNewPdfReaderSetting(objectMapper.readValue(value, FableUser.UserSettings.NewPdfReaderSetting.class));
                        case SIDEBAR_LIBRARY_SORTING -> userSettings.setSidebarLibrarySorting(objectMapper.readValue(value, SidebarSortOption.class));
                        case SIDEBAR_SHELF_SORTING -> userSettings.setSidebarShelfSorting(objectMapper.readValue(value, SidebarSortOption.class));
                        case SIDEBAR_MAGIC_SHELF_SORTING -> userSettings.setSidebarMagicShelfSorting(objectMapper.readValue(value, SidebarSortOption.class));
                        case SIDEBAR_SECTION_VISIBILITY -> userSettings.setSidebarSectionVisibility(objectMapper.readValue(value, new TypeReference<>() {
                        }));
                        case MEDIA_TYPE_SETTINGS -> userSettings.setMediaTypeSettings(objectMapper.readValue(value, FableUser.UserSettings.MediaTypeSettings.class));
                        case ENTITY_VIEW_PREFERENCES -> userSettings.setEntityViewPreferences(objectMapper.readValue(value, FableUser.UserSettings.EntityViewPreferences.class));
                        case THEME_SETTINGS -> userSettings.setThemeSettings(objectMapper.readValue(value, FableUser.UserSettings.ThemeSettings.class));
                        case TABLE_COLUMN_PREFERENCE -> userSettings.setTableColumnPreference(objectMapper.readValue(value, new TypeReference<>() {
                        }));
                        case TOOLBAR_CONFIG -> userSettings.setToolbarConfig(objectMapper.readValue(value, new TypeReference<>() {
                        }));
                        case DASHBOARD_CONFIG -> userSettings.setDashboardConfig(objectMapper.readValue(value, FableUser.UserSettings.DashboardConfig.class));
                        case DUPLICATE_RESOLUTION_PLAN -> userSettings.setDuplicateResolutionPlan(objectMapper.readValue(value, FableUser.UserSettings.DuplicateResolutionPlan.class));
                        case VISIBLE_FILTERS -> userSettings.setVisibleFilters(objectMapper.readValue(value, new TypeReference<>() {
                        }));
                        case VISIBLE_SORT_FIELDS -> userSettings.setVisibleSortFields(objectMapper.readValue(value, new TypeReference<>() {
                        }));
                        case FILTER_EXPANDED_PANELS -> userSettings.setFilterExpandedPanels(objectMapper.readValue(value, new TypeReference<>() {
                        }));
                        default -> {
                        }
                    }
                } else {
                    switch (settingKey) {
                        case FILTER_MODE -> userSettings.setFilterMode(value);
                        case FILTER_SORTING_MODE -> userSettings.setFilterSortingMode(value);
                        case METADATA_CENTER_VIEW_MODE -> userSettings.setMetadataCenterViewMode(value);
                        case SHOW_SIDEBAR_FILTER -> userSettings.setShowSidebarFilter(Boolean.parseBoolean(value));
                        case ENABLE_SERIES_VIEW -> userSettings.setEnableSeriesView(Boolean.parseBoolean(value));
                        case AUTO_SAVE_METADATA -> userSettings.setAutoSaveMetadata(Boolean.parseBoolean(value));
                        case USE_DISTRACTION_LOADING_SCREEN -> userSettings.setUseDistractionLoadingScreen(Boolean.parseBoolean(value));
                        default -> {
                        }
                    }
                }
            } catch (IllegalArgumentException e) {
                log.debug("Unknown setting key encountered: {}", key);
            } catch (Exception e) {
                log.error("Failed to deserialize setting '{}': {}", key, e.getMessage(), e);
            }
        }

        fableUser.setUserSettings(userSettings);
        if (userEntity.getLibraries() != null) {
            fableUser.setAssignedLibraries(
                    userEntity.getLibraries().stream()
                            .map(libraryMapper::toLibrary)
                            .collect(Collectors.toList())
            );
        } else {
            fableUser.setAssignedLibraries(Collections.emptyList());
        }
        fableUser.setProvisioningMethod(userEntity.getProvisioningMethod());
        return fableUser;
    }
}