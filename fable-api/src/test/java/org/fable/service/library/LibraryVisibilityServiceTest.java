package org.fable.service.library;

import org.fable.model.dto.FableUser;
import org.fable.model.dto.Library;
import org.fable.model.entity.LibraryEntity;
import org.fable.repository.LibraryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LibraryVisibilityServiceTest {

    @Mock
    private LibraryRepository libraryRepository;

    private LibraryVisibilityService service;

    @BeforeEach
    void setUp() {
        service = new LibraryVisibilityService(libraryRepository);
    }

    @Test
    void adminSeesSharedAndShowOnPersonalOnly() {
        LibraryEntity shared = LibraryEntity.builder().id(1L).name("Shared").build();
        LibraryEntity shown = LibraryEntity.builder().id(2L).name("Shown").ownerUserId(9L).showInAdminCatalog(true).build();
        when(libraryRepository.findAdminCatalogVisible()).thenReturn(List.of(shared, shown));

        FableUser admin = adminUser();
        Set<Long> ids = service.getAccessibleLibraryIds(admin);

        assertEquals(Set.of(1L, 2L), ids);
        assertTrue(service.isLibraryAccessible(admin, 1L));
        assertTrue(service.isLibraryAccessible(admin, 2L));
        assertFalse(service.isLibraryAccessible(admin, 99L));
    }

    @Test
    void guestSeesAssignedLibrariesOnly() {
        FableUser guest = guestUser(List.of(
                Library.builder().id(10L).name("Mine").build(),
                Library.builder().id(11L).name("Shared").build()
        ));

        Set<Long> ids = service.getAccessibleLibraryIds(guest);
        assertEquals(Set.of(10L, 11L), ids);
    }

    @Test
    void guestWithNoLibrariesSeesNothing() {
        FableUser guest = guestUser(List.of());
        assertTrue(service.getAccessibleLibraryIds(guest).isEmpty());
    }

    private static FableUser adminUser() {
        FableUser.UserPermissions perms = new FableUser.UserPermissions();
        perms.setAdmin(true);
        FableUser user = new FableUser();
        user.setId(1L);
        user.setPermissions(perms);
        return user;
    }

    private static FableUser guestUser(List<Library> libraries) {
        FableUser.UserPermissions perms = new FableUser.UserPermissions();
        perms.setAdmin(false);
        FableUser user = new FableUser();
        user.setId(2L);
        user.setPermissions(perms);
        user.setAssignedLibraries(libraries);
        return user;
    }
}
