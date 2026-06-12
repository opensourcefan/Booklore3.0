package org.fable.model.enums;

import org.fable.model.dto.FableUser;
import org.fable.model.dto.request.UserUpdateRequest;
import org.fable.model.entity.UserPermissionsEntity;
import lombok.Getter;

import java.util.function.BiConsumer;
import java.util.function.Function;
import java.util.function.Predicate;

@Getter
public enum UserPermission {
    IS_ADMIN("Admin access",
            FableUser.UserPermissions::isAdmin,
            FableUser.UserPermissions::setAdmin,
            UserUpdateRequest.Permissions::isAdmin,
            UserPermissionsEntity::isPermissionAdmin,
            UserPermissionsEntity::setPermissionAdmin
    ),
    CAN_UPLOAD(
            "Upload books",
            FableUser.UserPermissions::isCanUpload,
            FableUser.UserPermissions::setCanUpload,
            UserUpdateRequest.Permissions::isCanUpload,
            UserPermissionsEntity::isPermissionUpload,
            UserPermissionsEntity::setPermissionUpload
    ),
    CAN_DOWNLOAD(
            "Download books",
            FableUser.UserPermissions::isCanDownload,
            FableUser.UserPermissions::setCanDownload,
            UserUpdateRequest.Permissions::isCanDownload,
            UserPermissionsEntity::isPermissionDownload,
            UserPermissionsEntity::setPermissionDownload
    ),
    CAN_EDIT_METADATA(
            "Edit metadata",
            FableUser.UserPermissions::isCanEditMetadata,
            FableUser.UserPermissions::setCanEditMetadata,
            UserUpdateRequest.Permissions::isCanEditMetadata,
            UserPermissionsEntity::isPermissionEditMetadata,
            UserPermissionsEntity::setPermissionEditMetadata
    ),
    CAN_MANAGE_LIBRARY(
            "Manage library",
            FableUser.UserPermissions::isCanManageLibrary,
            FableUser.UserPermissions::setCanManageLibrary,
            UserUpdateRequest.Permissions::isCanManageLibrary,
            UserPermissionsEntity::isPermissionManageLibrary,
            UserPermissionsEntity::setPermissionManageLibrary
    ),
    CAN_SYNC_KOREADER(
            "Sync KoReader",
            FableUser.UserPermissions::isCanSyncKoReader,
            FableUser.UserPermissions::setCanSyncKoReader,
            UserUpdateRequest.Permissions::isCanSyncKoReader,
            UserPermissionsEntity::isPermissionSyncKoreader,
            UserPermissionsEntity::setPermissionSyncKoreader
    ),
    CAN_SYNC_KOBO(
            "Sync Kobo",
            FableUser.UserPermissions::isCanSyncKobo,
            FableUser.UserPermissions::setCanSyncKobo,
            UserUpdateRequest.Permissions::isCanSyncKobo,
            UserPermissionsEntity::isPermissionSyncKobo,
            UserPermissionsEntity::setPermissionSyncKobo
    ),
    CAN_EMAIL_BOOK(
            "Email books",
            FableUser.UserPermissions::isCanEmailBook,
            FableUser.UserPermissions::setCanEmailBook,
            UserUpdateRequest.Permissions::isCanEmailBook,
            UserPermissionsEntity::isPermissionEmailBook,
            UserPermissionsEntity::setPermissionEmailBook
    ),
    CAN_DELETE_BOOK(
            "Delete books",
            FableUser.UserPermissions::isCanDeleteBook,
            FableUser.UserPermissions::setCanDeleteBook,
            UserUpdateRequest.Permissions::isCanDeleteBook,
            UserPermissionsEntity::isPermissionDeleteBook,
            UserPermissionsEntity::setPermissionDeleteBook
    ),
    CAN_ACCESS_OPDS(
            "Access OPDS",
            FableUser.UserPermissions::isCanAccessOpds,
            FableUser.UserPermissions::setCanAccessOpds,
            UserUpdateRequest.Permissions::isCanAccessOpds,
            UserPermissionsEntity::isPermissionAccessOpds,
            UserPermissionsEntity::setPermissionAccessOpds
    ),
    CAN_MANAGE_METADATA_CONFIG(
            "Manage metadata config",
            FableUser.UserPermissions::isCanManageMetadataConfig,
            FableUser.UserPermissions::setCanManageMetadataConfig,
            UserUpdateRequest.Permissions::isCanManageMetadataConfig,
            UserPermissionsEntity::isPermissionManageMetadataConfig,
            UserPermissionsEntity::setPermissionManageMetadataConfig
    ),
    CAN_ACCESS_BOOKDROP(
            "Access bookdrop",
            FableUser.UserPermissions::isCanAccessBookdrop,
            FableUser.UserPermissions::setCanAccessBookdrop,
            UserUpdateRequest.Permissions::isCanAccessBookdrop,
            UserPermissionsEntity::isPermissionAccessBookdrop,
            UserPermissionsEntity::setPermissionAccessBookdrop
    ),
    CAN_ACCESS_LIBRARY_STATS(
            "Access library stats",
            FableUser.UserPermissions::isCanAccessLibraryStats,
            FableUser.UserPermissions::setCanAccessLibraryStats,
            UserUpdateRequest.Permissions::isCanAccessLibraryStats,
            UserPermissionsEntity::isPermissionAccessLibraryStats,
            UserPermissionsEntity::setPermissionAccessLibraryStats
    ),
    CAN_ACCESS_USER_STATS(
            "Access user stats",
            FableUser.UserPermissions::isCanAccessUserStats,
            FableUser.UserPermissions::setCanAccessUserStats,
            UserUpdateRequest.Permissions::isCanAccessUserStats,
            UserPermissionsEntity::isPermissionAccessUserStats,
            UserPermissionsEntity::setPermissionAccessUserStats
    ),
    CAN_ACCESS_TASK_MANAGER(
            "Access task manager",
            FableUser.UserPermissions::isCanAccessTaskManager,
            FableUser.UserPermissions::setCanAccessTaskManager,
            UserUpdateRequest.Permissions::isCanAccessTaskManager,
            UserPermissionsEntity::isPermissionAccessTaskManager,
            UserPermissionsEntity::setPermissionAccessTaskManager
    ),
    CAN_MANAGE_GLOBAL_PREFERENCES(
            "Manage global preferences",
            FableUser.UserPermissions::isCanManageGlobalPreferences,
            FableUser.UserPermissions::setCanManageGlobalPreferences,
            UserUpdateRequest.Permissions::isCanManageGlobalPreferences,
            UserPermissionsEntity::isPermissionManageGlobalPreferences,
            UserPermissionsEntity::setPermissionManageGlobalPreferences
    ),
    CAN_MANAGE_ICONS(
            "Manage icons",
            FableUser.UserPermissions::isCanManageIcons,
            FableUser.UserPermissions::setCanManageIcons,
            UserUpdateRequest.Permissions::isCanManageIcons,
            UserPermissionsEntity::isPermissionManageIcons,
            UserPermissionsEntity::setPermissionManageIcons
    ),
    CAN_MANAGE_FONTS(
            "Manage fonts",
            FableUser.UserPermissions::isCanManageFonts,
            FableUser.UserPermissions::setCanManageFonts,
            UserUpdateRequest.Permissions::isCanManageFonts,
            UserPermissionsEntity::isPermissionManageFonts,
            UserPermissionsEntity::setPermissionManageFonts
    ),
    CAN_BULK_AUTO_FETCH_METADATA(
            "Bulk auto fetch metadata",
            FableUser.UserPermissions::isCanBulkAutoFetchMetadata,
            FableUser.UserPermissions::setCanBulkAutoFetchMetadata,
            UserUpdateRequest.Permissions::isCanBulkAutoFetchMetadata,
            UserPermissionsEntity::isPermissionBulkAutoFetchMetadata,
            UserPermissionsEntity::setPermissionBulkAutoFetchMetadata
    ),
    CAN_BULK_CUSTOM_FETCH_METADATA(
            "Bulk custom fetch metadata",
            FableUser.UserPermissions::isCanBulkCustomFetchMetadata,
            FableUser.UserPermissions::setCanBulkCustomFetchMetadata,
            UserUpdateRequest.Permissions::isCanBulkCustomFetchMetadata,
            UserPermissionsEntity::isPermissionBulkCustomFetchMetadata,
            UserPermissionsEntity::setPermissionBulkCustomFetchMetadata
    ),
    CAN_BULK_EDIT_METADATA(
            "Bulk edit metadata",
            FableUser.UserPermissions::isCanBulkEditMetadata,
            FableUser.UserPermissions::setCanBulkEditMetadata,
            UserUpdateRequest.Permissions::isCanBulkEditMetadata,
            UserPermissionsEntity::isPermissionBulkEditMetadata,
            UserPermissionsEntity::setPermissionBulkEditMetadata
    ),
    CAN_BULK_REGENERATE_COVER(
            "Bulk regenerate cover",
            FableUser.UserPermissions::isCanBulkRegenerateCover,
            FableUser.UserPermissions::setCanBulkRegenerateCover,
            UserUpdateRequest.Permissions::isCanBulkRegenerateCover,
            UserPermissionsEntity::isPermissionBulkRegenerateCover,
            UserPermissionsEntity::setPermissionBulkRegenerateCover
    ),
    CAN_MOVE_ORGANIZE_FILES(
            "Move/organize files",
            FableUser.UserPermissions::isCanMoveOrganizeFiles,
            FableUser.UserPermissions::setCanMoveOrganizeFiles,
            UserUpdateRequest.Permissions::isCanMoveOrganizeFiles,
            UserPermissionsEntity::isPermissionMoveOrganizeFiles,
            UserPermissionsEntity::setPermissionMoveOrganizeFiles
    ),
    CAN_BULK_LOCK_UNLOCK_METADATA(
            "Bulk lock/unlock metadata",
            FableUser.UserPermissions::isCanBulkLockUnlockMetadata,
            FableUser.UserPermissions::setCanBulkLockUnlockMetadata,
            UserUpdateRequest.Permissions::isCanBulkLockUnlockMetadata,
            UserPermissionsEntity::isPermissionBulkLockUnlockMetadata,
            UserPermissionsEntity::setPermissionBulkLockUnlockMetadata
    ),
    CAN_BULK_RESET_FABLE_READ_PROGRESS(
            "Bulk reset Fable read progress",
            FableUser.UserPermissions::isCanBulkResetFableReadProgress,
            FableUser.UserPermissions::setCanBulkResetFableReadProgress,
            UserUpdateRequest.Permissions::isCanBulkResetFableReadProgress,
            UserPermissionsEntity::isPermissionBulkResetFableReadProgress,
            UserPermissionsEntity::setPermissionBulkResetFableReadProgress
    ),
    CAN_BULK_RESET_KOREADER_READ_PROGRESS(
            "Bulk reset KoReader read progress",
            FableUser.UserPermissions::isCanBulkResetKoReaderReadProgress,
            FableUser.UserPermissions::setCanBulkResetKoReaderReadProgress,
            UserUpdateRequest.Permissions::isCanBulkResetKoReaderReadProgress,
            UserPermissionsEntity::isPermissionBulkResetKoReaderReadProgress,
            UserPermissionsEntity::setPermissionBulkResetKoReaderReadProgress
    ),
    CAN_BULK_RESET_BOOK_READ_STATUS(
            "Bulk reset book read status",
            FableUser.UserPermissions::isCanBulkResetBookReadStatus,
            FableUser.UserPermissions::setCanBulkResetBookReadStatus,
            UserUpdateRequest.Permissions::isCanBulkResetBookReadStatus,
            UserPermissionsEntity::isPermissionBulkResetBookReadStatus,
            UserPermissionsEntity::setPermissionBulkResetBookReadStatus
    );

    private final String description;
    private final Predicate<FableUser.UserPermissions> dtoGetter;
    private final BiConsumer<FableUser.UserPermissions, Boolean> dtoSetter;
    private final Function<UserUpdateRequest.Permissions, Boolean> requestGetter;
    private final Predicate<UserPermissionsEntity> entityGetter;
    private final BiConsumer<UserPermissionsEntity, Boolean> entitySetter;

    UserPermission(
            String description,
            Predicate<FableUser.UserPermissions> dtoGetter,
            BiConsumer<FableUser.UserPermissions, Boolean> dtoSetter,
            Function<UserUpdateRequest.Permissions, Boolean> requestGetter,
            Predicate<UserPermissionsEntity> entityGetter,
            BiConsumer<UserPermissionsEntity, Boolean> entitySetter
    ) {
        this.description = description;
        this.dtoGetter = dtoGetter;
        this.dtoSetter = dtoSetter;
        this.requestGetter = requestGetter;
        this.entityGetter = entityGetter;
        this.entitySetter = entitySetter;
    }

    public boolean isGranted(FableUser.UserPermissions permissions) {
        return permissions != null && dtoGetter.test(permissions);
    }

    public void setInDto(FableUser.UserPermissions dto, boolean value) {
        if (dto != null) {
            dtoSetter.accept(dto, value);
        }
    }

    public boolean getFromEntity(UserPermissionsEntity entity) {
        return entity != null && entityGetter.test(entity);
    }

    public void setInEntity(UserPermissionsEntity entity, boolean value) {
        if (entity != null) {
            entitySetter.accept(entity, value);
        }
    }

    public boolean getFromRequest(UserUpdateRequest.Permissions request) {
        return request != null && requestGetter.apply(request);
    }

    public static void copyFromEntityToDto(UserPermissionsEntity source, FableUser.UserPermissions target) {
        if (source == null || target == null) return;
        for (UserPermission permission : values()) {
            permission.setInDto(target, permission.getFromEntity(source));
        }
    }

    public static void copyFromRequestToEntity(UserUpdateRequest.Permissions source, UserPermissionsEntity target) {
        if (source == null || target == null) return;
        for (UserPermission permission : values()) {
            permission.setInEntity(target, permission.getFromRequest(source));
        }
    }
}
