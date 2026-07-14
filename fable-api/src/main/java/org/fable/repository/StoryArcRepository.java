package org.fable.repository;

import org.fable.model.entity.StoryArcEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface StoryArcRepository extends JpaRepository<StoryArcEntity, Long> {

    Optional<StoryArcEntity> findByName(String name);

    boolean existsByName(String name);

    /**
     * Story arc summaries scoped to accessible libraries (working-catalog lane).
     * Counts, read progress, and cover pick only consider mapped books in
     * {@code libraryIds}. Arcs with zero accessible books are omitted.
     */
    @Query("SELECT a, COUNT(b.id), " +
           "SUM(CASE WHEN p.readStatus = org.fable.model.enums.ReadStatus.READ THEN 1 ELSE 0 END), " +
           "COALESCE(MAX(CASE WHEN coverBook.library.id IN :libraryIds THEN a.coverBookId ELSE NULL END), MIN(b.id)) " +
           "FROM StoryArcEntity a " +
           "LEFT JOIN StoryArcBookMappingEntity m ON m.storyArcId = a.id " +
           "LEFT JOIN BookEntity b ON b.id = m.bookId AND b.library.id IN :libraryIds " +
           "LEFT JOIN BookEntity coverBook ON coverBook.id = a.coverBookId " +
           "LEFT JOIN UserBookProgressEntity p ON b.id = p.book.id AND p.user.id = :userId " +
           "GROUP BY a.id, a.name, a.externalUrl, a.description, a.coverBookId " +
           "HAVING COUNT(b.id) > 0 " +
           "ORDER BY a.name")
    List<Object[]> findStoryArcSummariesWithUserProgress(
            @Param("userId") Long userId,
            @Param("libraryIds") Collection<Long> libraryIds);

    void deleteByName(String name);
}
