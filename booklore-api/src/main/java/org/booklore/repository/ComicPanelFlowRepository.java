package org.booklore.repository;

import org.booklore.model.entity.ComicPanelFlowEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ComicPanelFlowRepository extends JpaRepository<ComicPanelFlowEntity, Long> {

    Optional<ComicPanelFlowEntity> findByBookIdAndUserId(Long bookId, Long userId);

    long deleteByBookIdAndUserId(Long bookId, Long userId);

    long deleteByUserId(Long userId);
}
