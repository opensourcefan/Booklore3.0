package org.fable.service.book;

import org.fable.config.security.service.AuthenticationService;
import org.fable.model.entity.BookEntity;
import org.fable.model.entity.FableUserEntity;
import org.fable.model.entity.PdfAnnotationEntity;
import org.fable.repository.BookRepository;
import org.fable.repository.PdfAnnotationRepository;
import org.fable.repository.UserRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class PdfAnnotationService {

    private final PdfAnnotationRepository pdfAnnotationRepository;
    private final BookRepository bookRepository;
    private final UserRepository userRepository;
    private final AuthenticationService authenticationService;

    @Transactional(readOnly = true)
    public Optional<String> getAnnotations(Long bookId) {
        Long userId = getCurrentUserId();
        return pdfAnnotationRepository.findByBookIdAndUserId(bookId, userId)
                .map(PdfAnnotationEntity::getData);
    }

    @Transactional
    public void saveAnnotations(Long bookId, String data) {
        Long userId = getCurrentUserId();
        Optional<PdfAnnotationEntity> existing = pdfAnnotationRepository.findByBookIdAndUserId(bookId, userId);

        if (existing.isPresent()) {
            PdfAnnotationEntity entity = existing.get();
            entity.setData(data);
            pdfAnnotationRepository.save(entity);
            log.info("Updated PDF annotations for book {} by user {}", bookId, userId);
        } else {
            PdfAnnotationEntity entity = PdfAnnotationEntity.builder()
                    .book(findBook(bookId))
                    .user(findUser(userId))
                    .data(data)
                    .build();
            pdfAnnotationRepository.save(entity);
            log.info("Created PDF annotations for book {} by user {}", bookId, userId);
        }
    }

    @Transactional
    public void deleteAnnotations(Long bookId) {
        Long userId = getCurrentUserId();
        pdfAnnotationRepository.deleteByBookIdAndUserId(bookId, userId);
        log.info("Deleted PDF annotations for book {} by user {}", bookId, userId);
    }

    private Long getCurrentUserId() {
        return authenticationService.getAuthenticatedUser().getId();
    }

    private BookEntity findBook(Long bookId) {
        return bookRepository.findById(bookId)
                .orElseThrow(() -> new EntityNotFoundException("Book not found: " + bookId));
    }

    private FableUserEntity findUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + userId));
    }
}
