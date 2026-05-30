package org.booklore.repository;

import org.booklore.model.entity.TagEntity;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface TagRepository extends JpaRepository<TagEntity, Long> {

    Optional<TagEntity> findByName(String tagName);

    Optional<TagEntity> findByNameIgnoreCase(String tagName);

    @Query("SELECT t FROM TagEntity t WHERE LOWER(t.name) IN :names")
    List<TagEntity> findAllByNormalizedNames(@Param("names") Collection<String> names);
}
