package org.fable.repository;

import org.fable.model.entity.LibraryEntity;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface LibraryRepository extends JpaRepository<LibraryEntity, Long>, JpaSpecificationExecutor<LibraryEntity> {

    @EntityGraph(attributePaths = {"libraryPaths"})
    List<LibraryEntity> findByIdIn(List<Long> ids);
}
