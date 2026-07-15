package org.fable.service.bookdrop;

import org.fable.config.AppProperties;
import org.fable.model.dto.FableUser;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;

class BookdropInboxServiceTest {

    @TempDir
    Path tempDir;

    private BookdropInboxService service;

    @BeforeEach
    void setUp() {
        AppProperties appProperties = new AppProperties();
        appProperties.setBookdropFolder(tempDir.resolve("bookdrop").toString());
        service = new BookdropInboxService(appProperties);
    }

    @Test
    void adminUsesGlobalInbox() {
        FableUser.UserPermissions perms = new FableUser.UserPermissions();
        perms.setAdmin(true);
        FableUser admin = new FableUser();
        admin.setId(1L);
        admin.setPermissions(perms);

        assertEquals(service.getGlobalInbox(), service.resolveInboxForUser(admin));
    }

    @Test
    void nonAdminUsesPersonalInbox() {
        FableUser.UserPermissions perms = new FableUser.UserPermissions();
        perms.setAdmin(false);
        FableUser guest = new FableUser();
        guest.setId(6L);
        guest.setPermissions(perms);

        Path personal = service.resolveInboxForUser(guest);
        assertEquals(service.getPersonalInbox(6L), personal);
        assertTrue(personal.toString().replace('\\', '/').endsWith("/books/_users/6/bookdrop"));
    }

    @Test
    void resolveOwnerUserIdFromPersonalPath() {
        assertEquals(Optional.of(6L), service.resolveOwnerUserId(Path.of("/books/_users/6/bookdrop/novel.epub")));
        assertEquals(Optional.of(6L), service.resolveOwnerUserId(Path.of("/books/_users/6/bookdrop/sub/novel.epub")));
        assertTrue(service.resolveOwnerUserId(Path.of("/bookdrop/novel.epub")).isEmpty());
        assertTrue(service.resolveOwnerUserId(Path.of("/books/_users/6/uploads/novel.epub")).isEmpty());
        assertTrue(service.resolveOwnerUserId(Path.of("/books/_users/notanid/bookdrop/x.epub")).isEmpty());
    }
}
