package com.adityachandel.booklore.service;

import com.adityachandel.booklore.model.dto.request.MetadataRefreshOptions;
import com.adityachandel.booklore.model.dto.settings.AppSettings;
import com.adityachandel.booklore.model.entity.AppSettingEntity;
import com.adityachandel.booklore.repository.AppSettingsRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.transaction.Transactional;
import lombok.AllArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Service
@AllArgsConstructor
public class AppSettingService {

    private final AppSettingsRepository appSettingsRepository;
    private final ObjectMapper objectMapper;

    public AppSettings getAppSettings() {
        List<AppSettingEntity> settings = appSettingsRepository.findAll();
        Map<String, Map<String, Object>> settingsMap = settings.stream()
                .collect(Collectors.groupingBy(AppSettingEntity::getCategory,
                        Collectors.toMap(AppSettingEntity::getName, AppSettingEntity::getVal)));

        AppSettings.AppSettingsBuilder appSettingsBuilder = AppSettings.builder();

        if (settingsMap.containsKey("epub")) {
            Map<String, Object> epubSettings = settingsMap.get("epub");
            appSettingsBuilder.epub(AppSettings.EpubSettings.builder()
                    .theme((String) epubSettings.get("theme"))
                    .fontSize((String) epubSettings.get("fontSize"))
                    .font((String) epubSettings.get("font"))
                    .build());
        }

        if (settingsMap.containsKey("pdf")) {
            Map<String, Object> pdfSettings = settingsMap.get("pdf");
            appSettingsBuilder.pdf(AppSettings.PdfSettings.builder()
                    .spread((String) pdfSettings.get("spread"))
                    .zoom((String) pdfSettings.get("zoom"))
                    .build());
        }

        if (settingsMap.containsKey("reader_setting")) {
            Map<String, Object> readerSetting = settingsMap.get("reader_setting");
            appSettingsBuilder.readerSettings(AppSettings.ReaderSettings.builder()
                    .pdfScope(AppSettings.SettingScope.valueOf((String) readerSetting.get("pdf")))
                    .epubScope(AppSettings.SettingScope.valueOf((String) readerSetting.get("epub")))
                    .build());
        }

        if (settingsMap.containsKey("quick_book_match")) {
            Map<String, Object> quickBookMatch = settingsMap.get("quick_book_match");
            String quickBookMatchValue = (String) quickBookMatch.get("all_books");
            if (quickBookMatchValue != null) {
                try {
                    MetadataRefreshOptions metadataRefreshOptions = objectMapper.readValue(quickBookMatchValue, MetadataRefreshOptions.class);
                    appSettingsBuilder.metadataRefreshOptions(metadataRefreshOptions);
                } catch (JsonProcessingException e) {
                    throw new RuntimeException("Failed to parse quick_book_match settings", e);
                }
            }
        }

        return appSettingsBuilder.build();
    }

    @Transactional
    public void updateSetting(String category, String name, Object val) {
        AppSettingEntity setting = appSettingsRepository.findByCategoryAndName(category, name);
        if (setting != null) {
            if (category.equals("quick_book_match")) {
                try {
                    String jsonString = objectMapper.writeValueAsString(val);
                    setting.setVal(jsonString);
                } catch (Exception e) {
                    throw new IllegalArgumentException("Failed to serialize value: " + e.getMessage(), e);
                }
            } else {
                setting.setVal(val.toString());
            }
            appSettingsRepository.save(setting);
        } else {
            throw new IllegalArgumentException("Setting not found for category: " + category + " and key: " + name);
        }
    }
}
