package org.fable.repository;

import org.fable.model.entity.UserSettingEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserSettingRepository extends JpaRepository<UserSettingEntity, Long> {
    long countBySettingKeyAndSettingValue(String settingKey, String settingValue);
}
