package org.fable.repository;

import org.fable.model.entity.ComicCharacterEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;

public interface ComicCharacterRepository extends JpaRepository<ComicCharacterEntity, Long> {

    Optional<ComicCharacterEntity> findByName(String name);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "DELETE FROM comic_character WHERE id NOT IN (SELECT DISTINCT character_id FROM comic_metadata_character_mapping)", nativeQuery = true)
    void deleteOrphaned();
}
