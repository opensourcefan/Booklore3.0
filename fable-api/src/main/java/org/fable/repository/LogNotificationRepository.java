package org.fable.repository;

import org.fable.model.entity.LogNotificationEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface LogNotificationRepository extends JpaRepository<LogNotificationEntity, Long> {

    List<LogNotificationEntity> findByCreatedAtAfterOrderByCreatedAtDesc(Instant since, Pageable pageable);

    List<LogNotificationEntity> findAllByOrderByCreatedAtDesc(Pageable pageable);
}
