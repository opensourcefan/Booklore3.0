package org.fable.repository;

import org.fable.model.entity.StoryArcEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface StoryArcRepository extends JpaRepository<StoryArcEntity, Long> {

    Optional<StoryArcEntity> findByName(String name);

    boolean existsByName(String name);

    @Query("SELECT a, COUNT(m.bookId), " +
           "SUM(CASE WHEN p.readStatus = org.fable.model.enums.ReadStatus.READ THEN 1 ELSE 0 END), " +
           "MIN(m.bookId) " +
           "FROM StoryArcEntity a " +
           "LEFT JOIN StoryArcBookMappingEntity m ON m.storyArcId = a.id " +
           "LEFT JOIN UserBookProgressEntity p ON m.bookId = p.book.id AND p.user.id = :userId " +
           "GROUP BY a.id, a.name, a.externalUrl, a.description " +
           "ORDER BY a.name")
    List<Object[]> findStoryArcSummariesWithUserProgress(@Param("userId") Long userId);

    void deleteByName(String name);
}
