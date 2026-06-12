package org.fable.repository;

import org.fable.model.entity.KoboDeletedBookProgressEntity;
import jakarta.transaction.Transactional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface KoboDeletedBookProgressRepository extends JpaRepository<KoboDeletedBookProgressEntity, Long> {

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Transactional
    @Query("DELETE FROM KoboDeletedBookProgressEntity p WHERE p.snapshotId = :snapshotId AND p.userId = :userId")
    void deleteBySnapshotIdAndUserId(@Param("snapshotId") String snapshotId, @Param("userId") Long userId);
}
