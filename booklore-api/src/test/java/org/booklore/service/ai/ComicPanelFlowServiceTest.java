package org.booklore.service.ai;

import org.booklore.config.security.service.AuthenticationService;
import org.booklore.model.dto.BookLoreUser;
import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookMetadataEntity;
import org.booklore.model.entity.ComicPanelFlowEntity;
import org.booklore.repository.BookRepository;
import org.booklore.repository.ComicPanelFlowRepository;
import org.booklore.repository.UserRepository;
import org.booklore.service.NotificationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ComicPanelFlowServiceTest {

    @Mock
    private ComicPanelFlowRepository comicPanelFlowRepository;

    @Mock
    private BookRepository bookRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private AuthenticationService authenticationService;

    @Mock
    private AiPanelDetectionService aiPanelDetectionService;

    @Mock
    private PlatformTransactionManager transactionManager;

    @Mock
    private NotificationService notificationService;

    @Mock
    private TransactionStatus transactionStatus;

    private ComicPanelFlowService service;

    @BeforeEach
    void setUp() {
        service = new ComicPanelFlowService(
                comicPanelFlowRepository,
                bookRepository,
                userRepository,
                authenticationService,
                aiPanelDetectionService,
                transactionManager,
                notificationService
        );

        when(transactionManager.getTransaction(any(TransactionDefinition.class))).thenReturn(transactionStatus);
    }

    @Test
    void scanAndSavePanelFlowUsesBookQueryWithMetadataLoaded() {
        BookLoreUser currentUser = BookLoreUser.builder()
                .id(7L)
                .username("michael")
                .build();

        BookEntity book = BookEntity.builder()
                .id(1L)
                .metadata(BookMetadataEntity.builder().bookId(1L).title("My Comic").build())
                .build();

        ComicPanelFlowEntity existingFlow = ComicPanelFlowEntity.builder()
                .id(12L)
                .flowData("old")
                .build();

        when(authenticationService.getAuthenticatedUser()).thenReturn(currentUser);
        when(bookRepository.findByIdWithBookFiles(1L)).thenReturn(Optional.of(book));
        when(aiPanelDetectionService.detectPanelFlow(eq(1L), eq("CBX"), any())).thenReturn("new-flow");
        when(comicPanelFlowRepository.findByBookIdAndUserId(1L, 7L)).thenReturn(Optional.of(existingFlow));
        when(comicPanelFlowRepository.save(any(ComicPanelFlowEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        String result = service.scanAndSavePanelFlow(1L, "CBX");

        assertThat(result).isEqualTo("new-flow");
        verify(bookRepository).findByIdWithBookFiles(1L);
        verify(bookRepository, never()).findById(anyLong());
    }
}