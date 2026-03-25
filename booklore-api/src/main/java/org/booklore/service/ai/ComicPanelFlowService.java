package org.booklore.service.ai;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.booklore.config.security.service.AuthenticationService;
import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookLoreUserEntity;
import org.booklore.model.entity.ComicPanelFlowEntity;
import org.booklore.repository.BookRepository;
import org.booklore.repository.ComicPanelFlowRepository;
import org.booklore.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class ComicPanelFlowService {

    private final ComicPanelFlowRepository comicPanelFlowRepository;
    private final BookRepository bookRepository;
    private final UserRepository userRepository;
    private final AuthenticationService authenticationService;
    private final AiPanelDetectionService aiPanelDetectionService;
    private final PlatformTransactionManager transactionManager;

    @Transactional(readOnly = true)
    public Optional<String> getPanelFlow(Long bookId) {
        Long userId = getCurrentUserId();
        return comicPanelFlowRepository.findByBookIdAndUserId(bookId, userId)
                .map(ComicPanelFlowEntity::getFlowData);
    }

    @Transactional
    public void savePanelFlow(Long bookId, String flowData) {
        savePanelFlowInternal(bookId, flowData);
    }

    private void savePanelFlowInternal(Long bookId, String flowData) {
        Long userId = getCurrentUserId();
        Optional<ComicPanelFlowEntity> existing = comicPanelFlowRepository.findByBookIdAndUserId(bookId, userId);

        if (existing.isPresent()) {
            ComicPanelFlowEntity entity = existing.get();
            entity.setFlowData(flowData);
            comicPanelFlowRepository.save(entity);
            log.info("Updated comic panel flow for book {} by user {}", bookId, userId);
        } else {
            ComicPanelFlowEntity entity = ComicPanelFlowEntity.builder()
                    .book(findBook(bookId))
                    .user(findUser(userId))
                    .flowData(flowData)
                    .build();
            comicPanelFlowRepository.save(entity);
            log.info("Created comic panel flow for book {} by user {}", bookId, userId);
        }
    }

    @Transactional
    public void deletePanelFlow(Long bookId) {
        Long userId = getCurrentUserId();
        comicPanelFlowRepository.deleteByBookIdAndUserId(bookId, userId);
        log.info("Deleted comic panel flow for book {} by user {}", bookId, userId);
    }

    @Transactional
    public long deleteAllPanelFlowForCurrentUser() {
        Long userId = getCurrentUserId();
        long deleted = comicPanelFlowRepository.deleteByUserId(userId);
        log.info("Deleted {} comic panel flow records for user {}", deleted, userId);
        return deleted;
    }

    public String scanAndSavePanelFlow(Long bookId, String bookType) {
        String flowData = aiPanelDetectionService.detectPanelFlow(bookId, bookType);
        TransactionTemplate transactionTemplate = new TransactionTemplate(transactionManager);
        transactionTemplate.executeWithoutResult(status -> savePanelFlowInternal(bookId, flowData));
        return flowData;
    }

    private Long getCurrentUserId() {
        return authenticationService.getAuthenticatedUser().getId();
    }

    private BookEntity findBook(Long bookId) {
        return bookRepository.findById(bookId)
                .orElseThrow(() -> new EntityNotFoundException("Book not found: " + bookId));
    }

    private BookLoreUserEntity findUser(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new EntityNotFoundException("User not found: " + userId));
    }
}
