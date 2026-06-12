package org.fable.model.entity;

import jakarta.persistence.FetchType;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.OneToMany;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Verifies that FableUserEntity and LibraryEntity use LAZY fetching
 * for their collection relationships to avoid unnecessary database cascades
 * during authentication and token refresh cycles.
 *
 * <p>This test uses only Java reflection — no Spring context is required.
 * It validates the exact JPA annotations present on the entity classes.</p>
 */
class FableUserEntityFetchTypeTest {

    @Test
    @DisplayName("FableUserEntity.libraries must be LAZY (was EAGER before fix #1)")
    void userLibrariesShouldBeLazy() throws NoSuchFieldException {
        Field librariesField = FableUserEntity.class.getDeclaredField("libraries");
        ManyToMany annotation = librariesField.getAnnotation(ManyToMany.class);
        assertNotNull(annotation, "libraries field must have @ManyToMany annotation");
        assertEquals(FetchType.LAZY, annotation.fetch(),
                "libraries fetch type must be LAZY to prevent unnecessary DB cascades");
    }

    @Test
    @DisplayName("FableUserEntity.settings must be LAZY (was EAGER before fix #1)")
    void userSettingsShouldBeLazy() throws NoSuchFieldException {
        Field settingsField = FableUserEntity.class.getDeclaredField("settings");
        OneToMany annotation = settingsField.getAnnotation(OneToMany.class);
        assertNotNull(annotation, "settings field must have @OneToMany annotation");
        assertEquals(FetchType.LAZY, annotation.fetch(),
                "settings fetch type must be LAZY to prevent unnecessary DB cascades");
    }

    @Test
    @DisplayName("LibraryEntity.libraryPaths must be LAZY (was EAGER before fix #1)")
    void libraryPathsShouldBeLazy() throws NoSuchFieldException {
        Field pathsField = LibraryEntity.class.getDeclaredField("libraryPaths");
        OneToMany annotation = pathsField.getAnnotation(OneToMany.class);
        assertNotNull(annotation, "libraryPaths field must have @OneToMany annotation");
        assertEquals(FetchType.LAZY, annotation.fetch(),
                "libraryPaths fetch type must be LAZY to prevent unnecessary DB cascades");
    }
}