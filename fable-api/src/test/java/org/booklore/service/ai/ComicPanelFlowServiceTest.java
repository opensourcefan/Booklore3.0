package org.booklore.service.ai;

import org.booklore.config.security.service.AuthenticationService;
import org.booklore.model.dto.BookLoreUser;
import org.booklore.model.dto.ai.AiPanelFlowBookHighlightResponse;
import org.booklore.model.dto.ai.AiPanelFlowStatsResponse;
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
import tools.jackson.databind.ObjectMapper;

import java.util.List;
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
                notificationService,
                new ObjectMapper()
        );
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
        when(transactionManager.getTransaction(any(TransactionDefinition.class))).thenReturn(transactionStatus);
        when(bookRepository.findByIdWithBookFiles(1L)).thenReturn(Optional.of(book));
        when(aiPanelDetectionService.detectPanelFlow(eq(1L), eq("CBX"), any())).thenReturn("new-flow");
        when(comicPanelFlowRepository.findByBookIdAndUserId(1L, 7L)).thenReturn(Optional.of(existingFlow));
        when(comicPanelFlowRepository.save(any(ComicPanelFlowEntity.class))).thenAnswer(invocation -> invocation.getArgument(0));

        String result = service.scanAndSavePanelFlow(1L, "CBX");

        assertThat(result).isEqualTo("new-flow");
        verify(bookRepository).findByIdWithBookFiles(1L);
        verify(bookRepository, never()).findById(anyLong());
    }

    @Test
    void getPanelFlowStatsForCurrentUserReturnsStoredBytesAndScannedComics() {
        BookLoreUser currentUser = BookLoreUser.builder()
                .id(7L)
                .username("michael")
                .build();

        ComicPanelFlowRepository.AiPanelFlowStatsProjection stats = new ComicPanelFlowRepository.AiPanelFlowStatsProjection() {
            @Override
            public long getScannedComicCount() {
                return 12;
            }

            @Override
            public Long getStoredBytes() {
                return 4096L;
            }
        };

        when(authenticationService.getAuthenticatedUser()).thenReturn(currentUser);
        when(comicPanelFlowRepository.findStatsByUserId(7L)).thenReturn(stats);
        when(comicPanelFlowRepository.findAllByUserId(7L)).thenReturn(List.of(
            ComicPanelFlowEntity.builder()
                .bookId(101L)
                .book(BookEntity.builder()
                    .id(101L)
                    .metadata(BookMetadataEntity.builder().bookId(101L).title("Long Runner").build())
                    .build())
                .flowData("""
                    {"pages":[
                      {"pageNumber":1,"panels":[{"x":0.1},{"x":0.2}]},
                      {"pageNumber":2,"panels":[{"x":0.1}]},
                      {"pageNumber":3,"panels":[{"x":0.1},{"x":0.2},{"x":0.3}]}
                    ]}
                    """)
                .build(),
            ComicPanelFlowEntity.builder()
                .bookId(202L)
                .book(BookEntity.builder()
                    .id(202L)
                    .metadata(BookMetadataEntity.builder().bookId(202L).title("Dense Layout").build())
                    .build())
                .flowData("""
                    {"pages":[
                      {"pageNumber":1,"panels":[{"x":0.1},{"x":0.2},{"x":0.3},{"x":0.4}]},
                      {"pageNumber":2,"panels":[{"x":0.1},{"x":0.2},{"x":0.3},{"x":0.4},{"x":0.5}]}
                    ]}
                    """)
                .build()
        ));

        AiPanelFlowStatsResponse result = service.getPanelFlowStatsForCurrentUser();

        assertThat(result.getScannedComicCount()).isEqualTo(12);
        assertThat(result.getTotalPagesScanned()).isEqualTo(5);
        assertThat(result.getTotalPanelsMapped()).isEqualTo(15);
        assertThat(result.getStoredBytes()).isEqualTo(4096L);
        assertThat(result.getComicWithMostPagesScanned())
            .extracting(AiPanelFlowBookHighlightResponse::getBookId, AiPanelFlowBookHighlightResponse::getPageCount)
            .containsExactly(101L, 3L);
        assertThat(result.getComicWithMostPanelsMapped())
            .extracting(AiPanelFlowBookHighlightResponse::getBookId, AiPanelFlowBookHighlightResponse::getPanelCount)
            .containsExactly(202L, 9L);
        assertThat(result.getComicWithHighestPanelsPerPage())
            .extracting(AiPanelFlowBookHighlightResponse::getBookId, AiPanelFlowBookHighlightResponse::getPanelsPerPage)
            .containsExactly(202L, 4.5d);
        verify(comicPanelFlowRepository).findStatsByUserId(7L);
        verify(comicPanelFlowRepository).findAllByUserId(7L);
    }

    @Test
    void getPanelFlowStatsForCurrentUserFiltersByLibraryWhenRequested() {
        BookLoreUser currentUser = BookLoreUser.builder()
                .id(7L)
                .username("michael")
                .build();

        ComicPanelFlowRepository.AiPanelFlowStatsProjection stats = new ComicPanelFlowRepository.AiPanelFlowStatsProjection() {
            @Override
            public long getScannedComicCount() {
                return 3;
            }

            @Override
            public Long getStoredBytes() {
                return 1024L;
            }
        };

        when(authenticationService.getAuthenticatedUser()).thenReturn(currentUser);
        when(comicPanelFlowRepository.findStatsByUserIdAndLibraryId(7L, 99L)).thenReturn(stats);
        when(comicPanelFlowRepository.findAllByUserIdAndBookLibraryId(7L, 99L)).thenReturn(List.of(
            ComicPanelFlowEntity.builder()
                .bookId(303L)
                .book(BookEntity.builder()
                    .id(303L)
                    .metadata(BookMetadataEntity.builder().bookId(303L).title("Library Filtered Comic").build())
                    .build())
                .flowData("""
                    {"pages":[
                      {"pageNumber":1,"panels":[{"x":0.1},{"x":0.2}]}
                    ]}
                    """)
                .build()
        ));

        AiPanelFlowStatsResponse result = service.getPanelFlowStatsForCurrentUser(99L);

        assertThat(result.getScannedComicCount()).isEqualTo(3);
        assertThat(result.getTotalPagesScanned()).isEqualTo(1);
        assertThat(result.getTotalPanelsMapped()).isEqualTo(2);
        assertThat(result.getStoredBytes()).isEqualTo(1024L);
        verify(comicPanelFlowRepository).findStatsByUserIdAndLibraryId(7L, 99L);
        verify(comicPanelFlowRepository).findAllByUserIdAndBookLibraryId(7L, 99L);
    }
}