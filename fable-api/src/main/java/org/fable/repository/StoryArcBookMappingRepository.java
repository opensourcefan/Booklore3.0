package org.fable.repository;

import org.fable.model.entity.StoryArcBookMappingEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

@Repository
public interface StoryArcBookMappingRepository extends JpaRepository<StoryArcBookMappingEntity, Long> {

    @Query("SELECT s.storyArcName, COUNT(s.bookId), " +
           "SUM(CASE WHEN p.readStatus = org.fable.model.enums.ReadStatus.READ THEN 1 ELSE 0 END), " +
           "MIN(s.bookId) " +
           "FROM StoryArcBookMappingEntity s " +
           "LEFT JOIN UserBookProgressEntity p ON s.bookId = p.book.id AND p.user.id = :userId " +
           "GROUP BY s.storyArcName")
    List<Object[]> findStoryArcSummaries(@Param("userId") Long userId);

    List<StoryArcBookMappingEntity> findAllByStoryArcNameOrderByRowIndexAscColIndexAsc(String storyArcName);

    @Query("SELECT s.storyArcName, COUNT(s.bookId) FROM StoryArcBookMappingEntity s GROUP BY s.storyArcName")
    List<Object[]> findDistinctStoryArcsAndBookCounts();

    void deleteAllByStoryArcName(String storyArcName);

    void deleteAllByStoryArcNameAndBookIdIn(String storyArcName, Collection<Long> bookIds);

    boolean existsByStoryArcNameAndBookId(String storyArcName, Long bookId);

    List<StoryArcBookMappingEntity> findAllByBookIdIn(Collection<Long> bookIds);

    Optional<StoryArcBookMappingEntity> findByStoryArcNameAndBookId(String storyArcName, Long bookId);
}
