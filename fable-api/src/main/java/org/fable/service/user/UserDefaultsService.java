package org.fable.service.user;

import tools.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.fable.model.dto.settings.UserSettingKey;
import org.fable.model.entity.FableUserEntity;
import org.fable.model.entity.ShelfEntity;
import org.fable.model.entity.UserSettingEntity;
import org.fable.model.enums.IconType;
import org.fable.repository.ShelfRepository;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserDefaultsService {

    private final ShelfRepository shelfRepository;
    private final ObjectMapper objectMapper;
    private final DefaultUserSettingsProvider defaultSettingsProvider;

    public void addDefaultShelves(FableUserEntity user) {
        ShelfEntity shelf = ShelfEntity.builder()
                .user(user)
                .name("Favorites")
                .icon("heart")
                .iconType(IconType.PRIME_NG)
                .build();
        shelfRepository.save(shelf);
    }

    public void addDefaultSettings(FableUserEntity user) {
        for (UserSettingKey key : defaultSettingsProvider.getAllKeys()) {
            Object defaultValue = defaultSettingsProvider.getDefaultValue(key);
            add(user, key, defaultValue);
        }
    }

    private void add(FableUserEntity user, UserSettingKey key, Object value) {
        try {
            String storedValue = key.isJson()
                    ? objectMapper.writeValueAsString(value)
                    : value.toString();

            user.getSettings().add(UserSettingEntity.builder()
                    .user(user)
                    .settingKey(key.getDbKey())
                    .settingValue(storedValue)
                    .build());
        } catch (Exception e) {
            log.error("Error serializing setting {} for user {}", key, user.getUsername(), e);
        }
    }
}