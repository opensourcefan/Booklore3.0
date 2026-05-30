package org.booklore.repository;

import org.booklore.model.entity.ComicPanelFlowEntity;
import org.springframework.data.jpa.repository.EntityGraph;
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

    @EntityGraph(attributePaths = {"book", "book.metadata", "book.bookFiles"})
    List<ComicPanelFlowEntity> findAllByUserId(Long userId);

    @EntityGraph(attributePaths = {"book", "book.metadata", "book.bookFiles"})
    List<ComicPanelFlowEntity> findAllByUserIdAndBookLibraryId(Long userId, Long libraryId);

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

    @Query("""
        SELECT COUNT(DISTINCT cpf.book.id) as scannedComicCount,
             COALESCE(SUM(LENGTH(cpf.flowData)), 0) as storedBytes
        FROM ComicPanelFlowEntity cpf
        WHERE cpf.user.id = :userId
            AND cpf.book.library.id = :libraryId
        """)
    AiPanelFlowStatsProjection findStatsByUserIdAndLibraryId(@Param("userId") Long userId,
                                                             @Param("libraryId") Long libraryId);

    @Query("""
        SELECT cpf.book.libraryPath.id as libraryPathId,
               COUNT(DISTINCT cpf.book.id) as scannedComicCount
        FROM ComicPanelFlowEntity cpf
        WHERE cpf.user.id = :userId
            AND cpf.book.library.id = :libraryId
        GROUP BY cpf.book.libraryPath.id
        """)
    List<Object[]> findScannedCountsByLibraryPath(@Param("userId") Long userId,
                                                  @Param("libraryId") Long libraryId);
}
