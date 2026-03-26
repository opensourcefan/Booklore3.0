package org.booklore.repository;

import org.booklore.model.entity.ComicPanelFlowEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ComicPanelFlowRepository extends JpaRepository<ComicPanelFlowEntity, Long> {

    interface AiPanelFlowStatsProjection {
        long getScannedComicCount();
        Long getStoredBytes();
    }

    Optional<ComicPanelFlowEntity> findByBookIdAndUserId(Long bookId, Long userId);

    long deleteByBookIdAndUserId(Long bookId, Long userId);

    long deleteByUserId(Long userId);

    @Query("SELECT cpf.book.id FROM ComicPanelFlowEntity cpf WHERE cpf.user.id = :userId AND cpf.book.id IN :bookIds")
    List<Long> findScannedBookIdsByUserIdAndBookIdIn(@Param("userId") Long userId,
                                                     @Param("bookIds") Collection<Long> bookIds);

        @Query("""
            SELECT COUNT(DISTINCT cpf.book.id) as scannedComicCount,
               COALESCE(SUM(LENGTH(cpf.flowData)), 0) as storedBytes
            FROM ComicPanelFlowEntity cpf
            WHERE cpf.user.id = :userId
            """)
        AiPanelFlowStatsProjection findStatsByUserId(@Param("userId") Long userId);
}
