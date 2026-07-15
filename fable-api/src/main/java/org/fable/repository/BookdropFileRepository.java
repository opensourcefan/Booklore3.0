package org.fable.repository;


import org.fable.model.entity.BookdropFileEntity;
import org.fable.model.entity.BookdropFileEntity.Status;
import jakarta.transaction.Transactional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface BookdropFileRepository extends JpaRepository<BookdropFileEntity, Long> {

    Optional<BookdropFileEntity> findByFilePath(String filePath);

    Page<BookdropFileEntity> findAllByStatus(Status status, Pageable pageable);

    Page<BookdropFileEntity> findAllByStatusAndOwnerUserIdIsNull(Status status, Pageable pageable);

    Page<BookdropFileEntity> findAllByStatusAndOwnerUserId(Status status, Long ownerUserId, Pageable pageable);

    Page<BookdropFileEntity> findAllByOwnerUserIdIsNull(Pageable pageable);

    Page<BookdropFileEntity> findAllByOwnerUserId(Long ownerUserId, Pageable pageable);

    long countByStatus(Status status);

    long countByStatusAndOwnerUserIdIsNull(Status status);

    long countByStatusAndOwnerUserId(Status status, Long ownerUserId);

    long countByOwnerUserIdIsNull();

    long countByOwnerUserId(Long ownerUserId);

    List<BookdropFileEntity> findAllByOwnerUserIdIsNull();

    List<BookdropFileEntity> findAllByOwnerUserId(Long ownerUserId);

    @Transactional
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM BookdropFileEntity f WHERE f.filePath LIKE CONCAT(:prefix, '%')")
    int deleteAllByFilePathStartingWith(@Param("prefix") String prefix);

    @Query("SELECT f.id FROM BookdropFileEntity f WHERE f.id NOT IN :excludedIds")
    List<Long> findAllExcludingIdsFlat(@Param("excludedIds") List<Long> excludedIds);

    @Query("SELECT f.id FROM BookdropFileEntity f WHERE f.ownerUserId IS NULL AND f.id NOT IN :excludedIds")
    List<Long> findAllGlobalExcludingIdsFlat(@Param("excludedIds") List<Long> excludedIds);

    @Query("SELECT f.id FROM BookdropFileEntity f WHERE f.ownerUserId = :ownerUserId AND f.id NOT IN :excludedIds")
    List<Long> findAllByOwnerExcludingIdsFlat(@Param("ownerUserId") Long ownerUserId,
                                              @Param("excludedIds") List<Long> excludedIds);

    @Query("SELECT f.id FROM BookdropFileEntity f")
    List<Long> findAllIds();

    @Query("SELECT f.id FROM BookdropFileEntity f WHERE f.ownerUserId IS NULL")
    List<Long> findAllGlobalIds();

    @Query("SELECT f.id FROM BookdropFileEntity f WHERE f.ownerUserId = :ownerUserId")
    List<Long> findAllIdsByOwnerUserId(@Param("ownerUserId") Long ownerUserId);

    @Query("SELECT f.filePath FROM BookdropFileEntity f WHERE f.filePath IN :filePaths")
    List<String> findAllFilePathsIn(@Param("filePaths") List<String> filePaths);

    @Query("SELECT DISTINCT f.ownerUserId FROM BookdropFileEntity f WHERE f.ownerUserId IS NOT NULL")
    List<Long> findDistinctOwnerUserIds();
}
