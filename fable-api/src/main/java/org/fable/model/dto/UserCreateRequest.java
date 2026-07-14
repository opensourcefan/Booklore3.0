package org.fable.model.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.Set;

@Data
public class UserCreateRequest {

    @NotBlank
    private String username;

    @NotBlank
    @Size(min = 8, max = 72, message = "Password must be at least 8 characters long")
    private String password;

    @NotBlank
    private String name;

    /** Optional contact email — login uses username, not email. */
    @Email
    private String email;

    private boolean permissionUpload;
    private boolean permissionDownload;
    private boolean permissionEditMetadata;
    private boolean permissionManageLibrary;
    private boolean permissionEmailBook;
    private boolean permissionDeleteBook;
    private boolean permissionAccessOpds;
    private boolean permissionSyncKoreader;
    private boolean permissionSyncKobo;
    private boolean permissionAdmin;
    private boolean permissionManageMetadataConfig;
    private boolean permissionAccessBookdrop;
    private boolean permissionAccessLibraryStats;
    private boolean permissionAccessUserStats;
    private boolean permissionAccessTaskManager;
    private boolean permissionManageGlobalPreferences;
    private boolean permissionManageIcons;
    private boolean permissionManageFonts;
    private boolean permissionBulkAutoFetchMetadata;
    private boolean permissionBulkCustomFetchMetadata;
    private boolean permissionBulkEditMetadata;
    private boolean permissionBulkRegenerateCover;
    private boolean permissionMoveOrganizeFiles;
    private boolean permissionBulkLockUnlockMetadata;
    private boolean permissionBulkResetFableReadProgress;
    private boolean permissionBulkResetKoReaderReadProgress;
    private boolean permissionBulkResetBookReadStatus;

    private Set<Long> selectedLibraries;

    /**
     * When true (default), provision a personal library under {@code /books/_users/{id}/}.
     * Shared libraries in {@link #selectedLibraries} are optional extras.
     */
    private Boolean createPersonalLibrary = true;

    /**
     * Create User "Show library" — when true, the personal library appears under admin USERS
     * and enters the admin working catalog / AI corpus.
     */
    private boolean showLibrary;
}