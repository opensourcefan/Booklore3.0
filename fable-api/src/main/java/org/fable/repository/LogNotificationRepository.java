package org.fable.repository;

import org.fable.model.entity.LogNotificationEntity;
import org.fable.model.websocket.Severity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;

@Repository
public interface LogNotificationRepository extends JpaRepository<LogNotificationEntity, Long> {

    List<LogNotificationEntity> findByCreatedAtAfterOrderByCreatedAtDesc(Instant since, Pageable pageable);

    List<LogNotificationEntity> findAllByOrderByCreatedAtDesc(Pageable pageable);

    @Query("""
            SELECT n FROM LogNotificationEntity n
            WHERE n.createdAt > :since
              AND n.severity IN :severities
              AND (n.triggeredByUserId = :userId OR (:includeSystem = true AND n.triggeredByUserId IS NULL))
            ORDER BY n.createdAt DESC
            """)
    List<LogNotificationEntity> findVisibleFailures(
            @Param("since") Instant since,
            @Param("userId") Long userId,
            @Param("includeSystem") boolean includeSystem,
            @Param("severities") Collection<Severity> severities,
            Pageable pageable);

    void deleteByTriggeredByUserId(Long triggeredByUserId);

    void deleteAll();
}
