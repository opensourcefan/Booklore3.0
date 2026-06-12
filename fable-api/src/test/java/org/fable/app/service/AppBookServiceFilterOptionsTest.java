package org.fable.app.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Tuple;
import jakarta.persistence.TypedQuery;
import org.fable.config.security.service.AuthenticationService;
import org.fable.exception.APIException;
import org.fable.app.dto.AppFilterOptions;
import org.fable.app.mapper.AppBookMapper;
import org.fable.model.dto.Book;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.Library;
import org.fable.model.entity.FableUserEntity;
import org.fable.model.entity.ShelfEntity;
import org.fable.model.enums.BookFileType;
import org.fable.repository.BookRepository;
import org.fable.repository.ShelfRepository;
import org.fable.repository.UserBookFileProgressRepository;
import org.fable.repository.UserBookProgressRepository;
import org.fable.service.opds.MagicShelfBookService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class AppBookServiceFilterOptionsTest {

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

    // -------------------------------------------------------------------------
    // Global (no scoping params)
    // -------------------------------------------------------------------------

    @Test
    void getFilterOptions_noParams_returnsGlobalOptions() {
        mockAdminUser();
        mockJpqlQueries();

        AppFilterOptions result = service.getFilterOptions(null, null, null);

        assertNotNull(result);
        assertNotNull(result.getAuthors());
        assertNotNull(result.getLanguages());
        assertNotNull(result.getFileTypes());
        assertFalse(result.getReadStatuses().isEmpty());
    }

    // -------------------------------------------------------------------------
    // Library scoping
    // -------------------------------------------------------------------------

    @Test
    void getFilterOptions_withLibraryId_admin_succeeds() {
        mockAdminUser();
        mockJpqlQueries();

        AppFilterOptions result = service.getFilterOptions(5L, null, null);

        assertNotNull(result);
        verify(entityManager, times(3)).createQuery(anyString(), any(Class.class));
    }

    @Test
    void getFilterOptions_withLibraryId_nonAdminWithAccess_succeeds() {
        mockNonAdminUser(Set.of(5L, 10L));
        mockJpqlQueries();

        AppFilterOptions result = service.getFilterOptions(5L, null, null);

        assertNotNull(result);
    }

    @Test
    void getFilterOptions_withLibraryId_nonAdminNoAccess_throwsForbidden() {
        mockNonAdminUser(Set.of(10L));

        assertThrows(APIException.class, () -> service.getFilterOptions(5L, null, null));
    }

    // -------------------------------------------------------------------------
    // Shelf scoping
    // -------------------------------------------------------------------------

    @Test
    void getFilterOptions_withShelfId_publicShelf_succeeds() {
        mockAdminUser();
        ShelfEntity shelf = ShelfEntity.builder().id(10L).isPublic(true)
                .user(FableUserEntity.builder().id(99L).build()).build();
        when(shelfRepository.findById(10L)).thenReturn(Optional.of(shelf));
        mockJpqlQueries();

        AppFilterOptions result = service.getFilterOptions(null, 10L, null);

        assertNotNull(result);
    }

    @Test
    void getFilterOptions_withShelfId_ownPrivateShelf_succeeds() {
        mockAdminUser();
        ShelfEntity shelf = ShelfEntity.builder().id(10L).isPublic(false)
                .user(FableUserEntity.builder().id(userId).build()).build();
        when(shelfRepository.findById(10L)).thenReturn(Optional.of(shelf));
        mockJpqlQueries();

        AppFilterOptions result = service.getFilterOptions(null, 10L, null);

        assertNotNull(result);
    }

    @Test
    void getFilterOptions_withShelfId_otherPrivateShelf_throwsForbidden() {
        mockAdminUser();
        ShelfEntity shelf = ShelfEntity.builder().id(10L).isPublic(false)
                .user(FableUserEntity.builder().id(99L).build()).build();
        when(shelfRepository.findById(10L)).thenReturn(Optional.of(shelf));

        assertThrows(APIException.class, () -> service.getFilterOptions(null, 10L, null));
    }

    @Test
    void getFilterOptions_withShelfId_notFound_throwsException() {
        mockAdminUser();
        when(shelfRepository.findById(10L)).thenReturn(Optional.empty());

        assertThrows(APIException.class, () -> service.getFilterOptions(null, 10L, null));
    }

    // -------------------------------------------------------------------------
    // Magic shelf scoping
    // -------------------------------------------------------------------------

    @Test
    void getFilterOptions_withMagicShelfId_emptyResult_returnsEmptyOptions() {
        mockAdminUser();
        mockMagicShelfBooks(7L, Collections.emptyList());

        AppFilterOptions result = service.getFilterOptions(null, null, 7L);

        assertNotNull(result);
        assertTrue(result.getAuthors().isEmpty());
        assertTrue(result.getLanguages().isEmpty());
        assertTrue(result.getFileTypes().isEmpty());
        assertFalse(result.getReadStatuses().isEmpty());
    }

    @Test
    void getFilterOptions_withMagicShelfId_withBooks_returnsFilteredOptions() {
        mockAdminUser();
        Book book1 = Book.builder().id(100L).build();
        Book book2 = Book.builder().id(200L).build();
        mockMagicShelfBooks(7L, List.of(book1, book2));
        mockJpqlQueries();

        AppFilterOptions result = service.getFilterOptions(null, null, 7L);

        assertNotNull(result);
        verify(magicShelfBookService).getBooksByMagicShelfId(eq(userId), eq(7L), eq(0), anyInt());
    }

    @Test
    void getFilterOptions_withMagicShelfId_serviceThrows_propagatesException() {
        mockAdminUser();
        when(magicShelfBookService.getBooksByMagicShelfId(eq(userId), eq(7L), eq(0), anyInt()))
                .thenThrow(new RuntimeException("Magic shelf not found"));

        assertThrows(RuntimeException.class, () -> service.getFilterOptions(null, null, 7L));
    }

    @Test
    void getFilterOptions_authorAndLanguageQueriesIncludePhysicalBooks() {
        mockAdminUser();
        mockJpqlQueries();

        service.getFilterOptions(null, null, null);

        ArgumentCaptor<String> tupleQueryCaptor = ArgumentCaptor.forClass(String.class);
        verify(entityManager, times(2)).createQuery(tupleQueryCaptor.capture(), eq(Tuple.class));

        List<String> queries = tupleQueryCaptor.getAllValues();
        assertTrue(queries.get(0).contains("(b.bookFiles IS NOT EMPTY OR b.isPhysical = true)"));
        assertTrue(queries.get(1).contains("(b.bookFiles IS NOT EMPTY OR b.isPhysical = true)"));
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private void mockAdminUser() {
        var permissions = new FableUser.UserPermissions();
        permissions.setAdmin(true);
        FableUser user = FableUser.builder()
                .id(userId)
                .permissions(permissions)
                .build();
        when(authenticationService.getAuthenticatedUser()).thenReturn(user);
    }

    private void mockNonAdminUser(Set<Long> libraryIds) {
        List<Library> assignedLibraries = libraryIds.stream()
                .map(id -> Library.builder().id(id).build())
                .toList();
        var permissions = new FableUser.UserPermissions();
        permissions.setAdmin(false);
        FableUser user = FableUser.builder()
                .id(userId)
                .permissions(permissions)
                .assignedLibraries(assignedLibraries)
                .build();
        when(authenticationService.getAuthenticatedUser()).thenReturn(user);
    }

    private void mockMagicShelfBooks(Long magicShelfId, List<Book> books) {
        var page = new PageImpl<>(books, PageRequest.of(0, Math.max(books.size(), 1)), books.size());
        when(magicShelfBookService.getBooksByMagicShelfId(eq(userId), eq(magicShelfId), eq(0), anyInt()))
                .thenReturn(page);
    }

    @SuppressWarnings("unchecked")
    private void mockJpqlQueries() {
        TypedQuery<Tuple> authorQuery = mock(TypedQuery.class);
        when(authorQuery.setMaxResults(anyInt())).thenReturn(authorQuery);
        when(authorQuery.setParameter(anyString(), any())).thenReturn(authorQuery);
        when(authorQuery.getResultList()).thenReturn(Collections.emptyList());

        TypedQuery<Tuple> langQuery = mock(TypedQuery.class);
        when(langQuery.setParameter(anyString(), any())).thenReturn(langQuery);
        when(langQuery.getResultList()).thenReturn(Collections.emptyList());

        TypedQuery<BookFileType> ftQuery = mock(TypedQuery.class);
        when(ftQuery.setParameter(anyString(), any())).thenReturn(ftQuery);
        when(ftQuery.getResultList()).thenReturn(Collections.emptyList());

        when(entityManager.createQuery(anyString(), eq(Tuple.class)))
                .thenReturn(authorQuery)
                .thenReturn(langQuery);
        when(entityManager.createQuery(anyString(), eq(BookFileType.class)))
                .thenReturn(ftQuery);
    }
}
