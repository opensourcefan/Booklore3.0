package org.fable.repository;

import org.fable.model.entity.PdfViewerPreferencesEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface PdfViewerPreferencesRepository extends JpaRepository<PdfViewerPreferencesEntity, Long> {

    Optional<PdfViewerPreferencesEntity> findByBookIdAndUserId(long bookId, Long id);
}
