package org.fable.service.user;

import org.fable.model.dto.FableUser;
import org.fable.model.dto.settings.SidebarSortOption;
import org.fable.model.dto.settings.UserSettingKey;
import org.fable.model.enums.*;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;

@Component
@RequiredArgsConstructor
public class DefaultUserSettingsProvider {

    private final Map<UserSettingKey, Supplier<Object>> defaultSettings = new EnumMap<>(UserSettingKey.class);

    @PostConstruct
    public void init() {
        defaultSettings.put(UserSettingKey.PER_BOOK_SETTING, this::buildDefaultPerBookSetting);
        defaultSettings.put(UserSettingKey.PDF_READER_SETTING, this::buildDefaultPdfReaderSetting);
        defaultSettings.put(UserSettingKey.EPUB_READER_SETTING, this::buildDefaultEpubReaderSetting);
        defaultSettings.put(UserSettingKey.EBOOK_READER_SETTING, this::buildDefaultEbookReaderSetting);
        defaultSettings.put(UserSettingKey.CBX_READER_SETTING, this::buildDefaultCbxReaderSetting);
        defaultSettings.put(UserSettingKey.NEW_PDF_READER_SETTING, this::buildDefaultNewPdfReaderSetting);
        defaultSettings.put(UserSettingKey.SIDEBAR_LIBRARY_SORTING, this::buildDefaultSidebarLibrarySorting);
        defaultSettings.put(UserSettingKey.SIDEBAR_SHELF_SORTING, this::buildDefaultSidebarShelfSorting);
        defaultSettings.put(UserSettingKey.SIDEBAR_MAGIC_SHELF_SORTING, this::buildDefaultSidebarMagicShelfSorting);
        defaultSettings.put(UserSettingKey.ENTITY_VIEW_PREFERENCES, this::buildDefaultEntityViewPreferences);
        defaultSettings.put(UserSettingKey.THEME_SETTINGS, this::buildDefaultThemeSettings);
        defaultSettings.put(UserSettingKey.TABLE_COLUMN_PREFERENCE, () -> null);
        defaultSettings.put(UserSettingKey.TOOLBAR_CONFIG, this::buildDefaultToolbarConfig);
        defaultSettings.put(UserSettingKey.FILTER_MODE, () -> "and");
        defaultSettings.put(UserSettingKey.FILTER_SORTING_MODE, () -> "count");
        defaultSettings.put(UserSettingKey.METADATA_CENTER_VIEW_MODE, () -> "route");
    }

    public Set<UserSettingKey> getAllKeys() {
        return defaultSettings.keySet();
    }

    public Object getDefaultValue(UserSettingKey key) {
        Supplier<Object> supplier = defaultSettings.get(key);
        if (supplier == null) {
            throw new IllegalArgumentException("No default value defined for key: " + key);
        }
        return supplier.get();
    }

    private FableUser.UserSettings.PerBookSetting buildDefaultPerBookSetting() {
        return FableUser.UserSettings.PerBookSetting.builder()
                .epub(FableUser.UserSettings.PerBookSetting.GlobalOrIndividual.Individual)
                .pdf(FableUser.UserSettings.PerBookSetting.GlobalOrIndividual.Individual)
                .cbx(FableUser.UserSettings.PerBookSetting.GlobalOrIndividual.Individual)
                .newPdf(FableUser.UserSettings.PerBookSetting.GlobalOrIndividual.Individual)
                .build();
    }

    private FableUser.UserSettings.PdfReaderSetting buildDefaultPdfReaderSetting() {
        return FableUser.UserSettings.PdfReaderSetting.builder()
                .pageSpread("odd")
                .pageZoom("page-fit")
                .build();
    }

    private FableUser.UserSettings.EpubReaderSetting buildDefaultEpubReaderSetting() {
        return FableUser.UserSettings.EpubReaderSetting.builder()
                .theme("white")
                .font(null)
                .fontSize(100)
                .letterSpacing(null)
                .lineHeight(null)
                .flow("paginated")
                .spread("double")
                .build();
    }

    private FableUser.UserSettings.EbookReaderSetting buildDefaultEbookReaderSetting() {
        return FableUser.UserSettings.EbookReaderSetting.builder()
                .fontFamily("serif")
                .fontSize(16)
                .gap(0.05f)
                .hyphenate(false)
                .isDark(false)
                .justify(false)
                .lineHeight(1.5f)
                .maxBlockSize(1440)
                .maxColumnCount(2)
                .maxInlineSize(720)
                .theme("gray")
                .flow("paginated")
                .build();
    }

    private FableUser.UserSettings.CbxReaderSetting buildDefaultCbxReaderSetting() {
        return FableUser.UserSettings.CbxReaderSetting.builder()
                .pageViewMode(CbxPageViewMode.SINGLE_PAGE)
                .pageSpread(CbxPageSpread.ODD)
                .fitMode(CbxPageFitMode.FIT_HEIGHT)
                .scrollMode(CbxPageScrollMode.PAGINATED)
                .backgroundColor(CbxBackgroundColor.GRAY)
                .build();
    }

    private FableUser.UserSettings.NewPdfReaderSetting buildDefaultNewPdfReaderSetting() {
        return FableUser.UserSettings.NewPdfReaderSetting.builder()
                .pageViewMode(NewPdfPageViewMode.SINGLE_PAGE)
                .pageSpread(NewPdfPageSpread.ODD)
                .fitMode(NewPdfPageFitMode.FIT_HEIGHT)
                .scrollMode(NewPdfPageScrollMode.PAGINATED)
                .backgroundColor(NewPdfBackgroundColor.WHITE)
                .build();
    }

    private SidebarSortOption buildDefaultSidebarLibrarySorting() {
        return SidebarSortOption.builder().field("id").order("asc").build();
    }

    private SidebarSortOption buildDefaultSidebarShelfSorting() {
        return SidebarSortOption.builder().field("id").order("asc").build();
    }

    private SidebarSortOption buildDefaultSidebarMagicShelfSorting() {
        return SidebarSortOption.builder().field("id").order("asc").build();
    }

    private FableUser.UserSettings.EntityViewPreferences buildDefaultEntityViewPreferences() {
        return FableUser.UserSettings.EntityViewPreferences.builder()
                .global(FableUser.UserSettings.GlobalPreferences.builder()
                        .sortKey("title")
                        .sortDir("ASC")
                        .view("GRID")
                        .coverSize(1.0F)
                        .seriesCollapsed(false)
                        .overlayBookType(true)
                .overlayAiPanelData(true)
                .overlayIssueNumber(true)
                        .build())
                .overrides(null)
                .build();
    }

    private FableUser.UserSettings.ThemeSettings buildDefaultThemeSettings() {
        return FableUser.UserSettings.ThemeSettings.builder()
                .preset("Aura")
                .primary("green")
                .surface("ash")
                .build();
    }

    private List<FableUser.UserSettings.ToolbarConfigItem> buildDefaultToolbarConfig() {
        return List.of(
                FableUser.UserSettings.ToolbarConfigItem.builder().id("bookdrop").type("button").visible(true).label("Bookdrop").icon("pi pi-inbox").build(),
                FableUser.UserSettings.ToolbarConfigItem.builder().id("createLibrary").type("button").visible(true).label("Create New Library").icon("pi pi-plus-circle").build(),
                FableUser.UserSettings.ToolbarConfigItem.builder().id("upload").type("button").visible(true).label("Upload").icon("pi pi-upload").build(),
                FableUser.UserSettings.ToolbarConfigItem.builder().id("sep1").type("separator").visible(true).build(),
                FableUser.UserSettings.ToolbarConfigItem.builder().id("metadata").type("button").visible(true).label("Metadata").icon("pi pi-database").build(),
                FableUser.UserSettings.ToolbarConfigItem.builder().id("stats").type("button").visible(true).label("Stats").icon("pi pi-chart-bar").build(),
                FableUser.UserSettings.ToolbarConfigItem.builder().id("sep2").type("separator").visible(true).build(),
                FableUser.UserSettings.ToolbarConfigItem.builder().id("layoutPhone").type("button").visible(true).label("Phone Mode").icon("pi pi-mobile").build(),
                FableUser.UserSettings.ToolbarConfigItem.builder().id("layoutTablet").type("button").visible(true).label("Tablet Mode").icon("pi pi-tablet").build(),
                FableUser.UserSettings.ToolbarConfigItem.builder().id("layoutAuto").type("button").visible(true).label("Auto Mode").icon("pi pi-desktop").build(),
                FableUser.UserSettings.ToolbarConfigItem.builder().id("sep3").type("separator").visible(true).build(),
                FableUser.UserSettings.ToolbarConfigItem.builder().id("fullscreen").type("button").visible(true).label("Fullscreen").icon("pi pi-window-maximize").build(),
                FableUser.UserSettings.ToolbarConfigItem.builder().id("notifications").type("button").visible(true).label("Notifications").icon("pi pi-bell").build(),
                FableUser.UserSettings.ToolbarConfigItem.builder().id("theme").type("button").visible(true).label("Theme").icon("pi pi-palette").build(),
                FableUser.UserSettings.ToolbarConfigItem.builder().id("settings").type("button").visible(true).label("Settings").icon("pi pi-cog").build(),
                FableUser.UserSettings.ToolbarConfigItem.builder().id("user").type("button").visible(true).label("User").icon("pi pi-user").build(),
                FableUser.UserSettings.ToolbarConfigItem.builder().id("logout").type("button").visible(true).label("Logout").icon("pi pi-sign-out").build()
        );
    }
}