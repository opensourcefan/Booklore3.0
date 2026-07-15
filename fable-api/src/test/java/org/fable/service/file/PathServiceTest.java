package org.fable.service.file;

import org.fable.config.security.service.AuthenticationService;
import org.fable.exception.APIException;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.Library;
import org.fable.model.entity.LibraryEntity;
import org.fable.model.entity.LibraryPathEntity;
import org.fable.repository.LibraryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PathServiceTest {

    @Mock
    private AuthenticationService authenticationService;

    @Mock
    private LibraryRepository libraryRepository;

    private PathService pathService;

    @BeforeEach
    void setUp() {
        pathService = new PathService(authenticationService, libraryRepository);
    }

    @Test
    void adminBlockedFromOsDenylist() {
        assertThrows(APIException.class, () -> pathService.assertPathAllowedForCurrentUser("/etc"));
        assertThrows(APIException.class, () -> pathService.assertPathAllowedForCurrentUser("/home/someone"));
        assertThrows(APIException.class, () -> pathService.assertPathAllowedForCurrentUser("/tmp/foo"));
    }

    @Test
    void adminMayUseBooksPaths() {
        when(authenticationService.getAuthenticatedUser()).thenReturn(adminUser(1L));
        assertDoesNotThrow(() -> pathService.assertPathAllowedForCurrentUser("/books"));
        assertDoesNotThrow(() -> pathService.assertPathAllowedForCurrentUser("/books/fiction"));
    }

    @Test
    void nonAdminDeniedOutsideAllowlist() {
        FableUser guest = guestUser(4L, List.of(Library.builder().id(10L).build()));
        when(authenticationService.getAuthenticatedUser()).thenReturn(guest);
        when(libraryRepository.findByIdIn(anyList())).thenReturn(List.of(
                LibraryEntity.builder()
                        .id(10L)
                        .libraryPaths(List.of(LibraryPathEntity.builder()
                                .path("/books/_users/4")
                                .build()))
                        .build()
        ));

        assertThrows(APIException.class, () -> pathService.assertPathAllowedForCurrentUser("/books"));
        assertThrows(APIException.class, () -> pathService.assertPathAllowedForCurrentUser("/books/_users"));
        assertThrows(APIException.class, () -> pathService.assertPathAllowedForCurrentUser("/books/_users/5"));
        assertDoesNotThrow(() -> pathService.assertPathAllowedForCurrentUser("/books/_users/4"));
        assertDoesNotThrow(() -> pathService.assertPathAllowedForCurrentUser("/books/_users/4/uploads"));
    }

    @Test
    void nonAdminAllowedOnAssignedSharedLibraryPath() {
        FableUser guest = guestUser(4L, List.of(Library.builder().id(10L).build()));
        when(authenticationService.getAuthenticatedUser()).thenReturn(guest);
        when(libraryRepository.findByIdIn(anyList())).thenReturn(List.of(
                LibraryEntity.builder()
                        .id(10L)
                        .libraryPaths(List.of(LibraryPathEntity.builder()
                                .path("/books/SharedSciFi")
                                .build()))
                        .build()
        ));

        assertDoesNotThrow(() -> pathService.assertPathAllowedForCurrentUser("/books/SharedSciFi"));
        assertDoesNotThrow(() -> pathService.assertPathAllowedForCurrentUser("/books/SharedSciFi/Asimov"));
        assertThrows(APIException.class, () -> pathService.assertPathAllowedForCurrentUser("/books/Other"));
    }

    @Test
    void resolveNonAdminAllowlistedRootsIncludesPersonalAndAssigned() {
        FableUser guest = guestUser(9L, List.of(Library.builder().id(3L).build()));
        when(libraryRepository.findByIdIn(anyList())).thenReturn(List.of(
                LibraryEntity.builder()
                        .id(3L)
                        .libraryPaths(List.of(LibraryPathEntity.builder().path("/books/SharedSciFi").build()))
                        .build()
        ));

        Set<String> roots = pathService.resolveNonAdminAllowlistedRoots(guest);

        assertEquals(Set.of("/books/_users/9", "/books/SharedSciFi"), roots);
    }

    @Test
    void isUnderAnyRootMatchesExactAndDescendantOnly() {
        Set<String> roots = Set.of("/books/_users/4", "/books/Shared");

        assertTrue(PathService.isUnderAnyRoot("/books/_users/4", roots));
        assertTrue(PathService.isUnderAnyRoot("/books/_users/4/a", roots));
        assertTrue(PathService.isUnderAnyRoot("/books/Shared/x", roots));
        assertFalse(PathService.isUnderAnyRoot("/books/_users", roots));
        assertFalse(PathService.isUnderAnyRoot("/books/_users/40", roots));
        assertFalse(PathService.isUnderAnyRoot("/books", roots));
    }

    private static FableUser adminUser(Long id) {
        FableUser.UserPermissions perms = new FableUser.UserPermissions();
        perms.setAdmin(true);
        FableUser user = new FableUser();
        user.setId(id);
        user.setPermissions(perms);
        return user;
    }

    private static FableUser guestUser(Long id, List<Library> libraries) {
        FableUser.UserPermissions perms = new FableUser.UserPermissions();
        perms.setAdmin(false);
        perms.setCanManageLibrary(true);
        FableUser user = new FableUser();
        user.setId(id);
        user.setPermissions(perms);
        user.setAssignedLibraries(libraries);
        return user;
    }
}
