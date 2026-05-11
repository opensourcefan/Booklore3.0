package org.booklore.app.service;

import jakarta.persistence.EntityManager;
import org.booklore.app.dto.AppBookSummary;
import org.booklore.app.dto.AppPageResponse;
import org.booklore.app.mapper.AppBookMapper;
import org.booklore.config.security.service.AuthenticationService;
import org.booklore.model.dto.Book;
import org.booklore.model.dto.BookLoreUser;
import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookMetadataEntity;
import org.booklore.repository.BookRepository;
import org.booklore.repository.ShelfRepository;
import org.booklore.repository.UserBookFileProgressRepository;
import org.booklore.repository.UserBookProgressRepository;
import org.booklore.service.opds.MagicShelfBookService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anySet;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AppBookServiceTest {

    @Mock private BookRepository bookRepository;
    @Mock private UserBookProgressRepository userBookProgressRepository;
    @Mock private UserBookFileProgressRepository userBookFileProgressRepository;
    @Mock private ShelfRepository shelfRepository;
    @Mock private AuthenticationService authenticationService;
    @Mock private AppBookMapper mobileBookMapper;
    @Mock private MagicShelfBookService magicShelfBookService;
    @Mock private EntityManager entityManager;

    private AppBookService service;

    private final Long userId = 1L;

    @BeforeEach
    void setUp() {
        service = new AppBookService(
                bookRepository, userBookProgressRepository, userBookFileProgressRepository,
                shelfRepository, authenticationService, mobileBookMapper,
                magicShelfBookService, entityManager
        );
    }

    @Test
    void getBooksByMagicShelf_includesPhysicalBooksWithoutFiles() {
        mockAdminUser();

        Book book = Book.builder().id(10L).build();
        when(magicShelfBookService.getBooksByMagicShelfId(userId, 7L, 0, 20))
                .thenReturn(new PageImpl<>(List.of(book), PageRequest.of(0, 20), 1));

        BookEntity physicalBook = BookEntity.builder()
                .id(10L)
                .isPhysical(true)
                .metadata(BookMetadataEntity.builder().title("Physical Book").build())
                .bookFiles(new ArrayList<>())
                .build();
        when(bookRepository.findAllById(Set.of(10L))).thenReturn(List.of(physicalBook));
        when(userBookProgressRepository.findByUserIdAndBookIdIn(eq(userId), anySet())).thenReturn(Collections.emptyList());
        when(mobileBookMapper.toSummary(eq(physicalBook), eq(null)))
                .thenReturn(AppBookSummary.builder().id(10L).title("Physical Book").build());

        AppPageResponse<AppBookSummary> result = service.getBooksByMagicShelf(7L, 0, 20);

        assertEquals(1, result.getContent().size());
        assertEquals(10L, result.getContent().getFirst().getId());
        verify(mobileBookMapper).toSummary(eq(physicalBook), eq(null));
    }

    @Test
    void getBooksByMagicShelf_skipsNonPhysicalBooksWithoutFiles() {
        mockAdminUser();

        Book book = Book.builder().id(11L).build();
        when(magicShelfBookService.getBooksByMagicShelfId(userId, 7L, 0, 20))
                .thenReturn(new PageImpl<>(List.of(book), PageRequest.of(0, 20), 1));

        BookEntity filelessShell = BookEntity.builder()
                .id(11L)
                .isPhysical(false)
                .metadata(BookMetadataEntity.builder().title("Shell Book").build())
                .bookFiles(new ArrayList<>())
                .build();
        when(bookRepository.findAllById(Set.of(11L))).thenReturn(List.of(filelessShell));
        when(userBookProgressRepository.findByUserIdAndBookIdIn(eq(userId), anySet())).thenReturn(Collections.emptyList());

        AppPageResponse<AppBookSummary> result = service.getBooksByMagicShelf(7L, 0, 20);

        assertEquals(0, result.getContent().size());
    }

    private void mockAdminUser() {
        var permissions = new BookLoreUser.UserPermissions();
        permissions.setAdmin(true);
        BookLoreUser user = BookLoreUser.builder()
                .id(userId)
                .permissions(permissions)
                .build();
        when(authenticationService.getAuthenticatedUser()).thenReturn(user);
    }
}