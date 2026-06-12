package org.fable.repository;

import org.fable.model.entity.PdfAnnotationEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PdfAnnotationRepository extends JpaRepository<PdfAnnotationEntity, Long> {

    Optional<PdfAnnotationEntity> findByBookIdAndUserId(Long bookId, Long userId);

    void deleteByBookIdAndUserId(Long bookId, Long userId);
}
