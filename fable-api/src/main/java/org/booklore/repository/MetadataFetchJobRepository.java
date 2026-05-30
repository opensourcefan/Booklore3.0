package org.booklore.repository;

import org.booklore.model.entity.MetadataFetchJobEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface MetadataFetchJobRepository extends JpaRepository<MetadataFetchJobEntity, String> {

    int deleteAllByCompletedAtBefore(Instant cutoff);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("DELETE FROM MetadataFetchJobEntity")
    int deleteAllRecords();

    @Query("SELECT COUNT(m) FROM MetadataFetchJobEntity m")
    long countAll();

    @Query("SELECT DISTINCT t FROM MetadataFetchJobEntity t LEFT JOIN FETCH t.proposals")
    List<MetadataFetchJobEntity> findAllWithProposals();

    @Query("SELECT DISTINCT t FROM MetadataFetchJobEntity t LEFT JOIN FETCH t.proposals WHERE t.userId = :userId ORDER BY t.startedAt DESC")
    List<MetadataFetchJobEntity> findAllWithProposalsByUserIdOrderByStartedAtDesc(Long userId);

    @Query("SELECT DISTINCT t FROM MetadataFetchJobEntity t LEFT JOIN FETCH t.proposals WHERE t.taskId = :taskId")
    Optional<MetadataFetchJobEntity> findByTaskIdWithProposals(String taskId);
}
