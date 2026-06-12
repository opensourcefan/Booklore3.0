package org.fable.repository;

import org.fable.model.entity.BookShelfKey;
import org.fable.model.entity.BookShelfMapping;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface BookShelfMappingRepository extends JpaRepository<BookShelfMapping, BookShelfKey> {

    long countByShelfId(Long shelfId);

    @Query("SELECT bsm.shelfId, COUNT(bsm.bookId) FROM BookShelfMapping bsm " +
           "WHERE bsm.shelfId IN :shelfIds GROUP BY bsm.shelfId")
    List<Object[]> countByShelfIdIn(@Param("shelfIds") List<Long> shelfIds);
}
