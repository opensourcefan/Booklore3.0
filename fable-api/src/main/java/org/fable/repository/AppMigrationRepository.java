package org.fable.repository;

import org.fable.model.entity.AppMigrationEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppMigrationRepository extends JpaRepository<AppMigrationEntity, String> {
}
