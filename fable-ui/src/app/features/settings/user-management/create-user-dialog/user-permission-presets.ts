export type UserPermissionPresetId = 'reader' | 'contributor' | 'librarian' | 'admin' | 'custom';

export const USER_PERMISSION_PRESET_DEFAULT: UserPermissionPresetId = 'reader';

/** Form control names for create-user permission checkboxes. */
export type UserPermissionFormKey =
  | 'permissionUpload'
  | 'permissionDownload'
  | 'permissionEditMetadata'
  | 'permissionManageLibrary'
  | 'permissionEmailBook'
  | 'permissionDeleteBook'
  | 'permissionAccessOpds'
  | 'permissionSyncKoreader'
  | 'permissionSyncKobo'
  | 'permissionManageMetadataConfig'
  | 'permissionAccessBookdrop'
  | 'permissionAccessLibraryStats'
  | 'permissionAccessUserStats'
  | 'permissionAccessTaskManager'
  | 'permissionManageGlobalPreferences'
  | 'permissionManageIcons'
  | 'permissionManageFonts'
  | 'permissionAdmin'
  | 'permissionBulkAutoFetchMetadata'
  | 'permissionBulkCustomFetchMetadata'
  | 'permissionBulkEditMetadata'
  | 'permissionBulkRegenerateCover'
  | 'permissionMoveOrganizeFiles'
  | 'permissionBulkLockUnlockMetadata'
  | 'permissionBulkResetFableReadProgress'
  | 'permissionBulkResetKoReaderReadProgress'
  | 'permissionBulkResetBookReadStatus';

export type UserPermissionPresetValues = Partial<Record<UserPermissionFormKey, boolean>>;

const ALL_PERMISSION_KEYS: UserPermissionFormKey[] = [
  'permissionUpload',
  'permissionDownload',
  'permissionEditMetadata',
  'permissionManageLibrary',
  'permissionEmailBook',
  'permissionDeleteBook',
  'permissionAccessOpds',
  'permissionSyncKoreader',
  'permissionSyncKobo',
  'permissionManageMetadataConfig',
  'permissionAccessBookdrop',
  'permissionAccessLibraryStats',
  'permissionAccessUserStats',
  'permissionAccessTaskManager',
  'permissionManageGlobalPreferences',
  'permissionManageIcons',
  'permissionManageFonts',
  'permissionAdmin',
  'permissionBulkAutoFetchMetadata',
  'permissionBulkCustomFetchMetadata',
  'permissionBulkEditMetadata',
  'permissionBulkRegenerateCover',
  'permissionMoveOrganizeFiles',
  'permissionBulkLockUnlockMetadata',
  'permissionBulkResetFableReadProgress',
  'permissionBulkResetKoReaderReadProgress',
  'permissionBulkResetBookReadStatus',
];

/**
 * Instance-wide / admin territory — keep off guest presets and highlight in the UI.
 * Manage Library is also highlighted (path remount can escape a sandbox) but librarian still gets it.
 */
export const ADMIN_TERRITORY_PERMISSION_KEYS: ReadonlySet<UserPermissionFormKey> = new Set([
  'permissionAdmin',
  'permissionManageGlobalPreferences',
  'permissionAccessTaskManager',
  'permissionManageMetadataConfig',
  'permissionManageIcons',
  'permissionManageFonts',
  'permissionManageLibrary',
]);

function allPermissionsFalse(): Record<UserPermissionFormKey, boolean> {
  return Object.fromEntries(ALL_PERMISSION_KEYS.map(key => [key, false])) as Record<UserPermissionFormKey, boolean>;
}

function allExceptAdminTerritory(): Record<UserPermissionFormKey, boolean> {
  const base = allPermissionsFalse();
  for (const key of ALL_PERMISSION_KEYS) {
    base[key] = !ADMIN_TERRITORY_PERMISSION_KEYS.has(key);
  }
  return base;
}

/**
 * Guest-oriented presets:
 * - Reader / Contributor / Librarian never get instance settings or full Admin.
 * - Librarian gets Manage Library so they can run their own library (trusted users only).
 */
export const USER_PERMISSION_PRESETS: Record<Exclude<UserPermissionPresetId, 'custom'>, UserPermissionPresetValues> = {
  reader: {
    ...allPermissionsFalse(),
    permissionDownload: true,
    permissionEmailBook: true,
    permissionAccessUserStats: true,
    permissionAccessLibraryStats: true,
    permissionAccessOpds: true,
    permissionSyncKoreader: true,
    permissionSyncKobo: true,
  },
  contributor: {
    ...allExceptAdminTerritory(),
    // Contributor may mutate books in assigned libs, but not remount paths.
    permissionManageLibrary: false,
  },
  librarian: {
    ...allExceptAdminTerritory(),
    // Full control of their libraries — including path management (light B; no Phase 3 path policy).
    permissionManageLibrary: true,
  },
  admin: {
    permissionAdmin: true,
  },
};

export function presetValuesFor(preset: Exclude<UserPermissionPresetId, 'custom'>): Record<UserPermissionFormKey, boolean> {
  const base = allPermissionsFalse();
  if (preset === 'admin') {
    for (const key of ALL_PERMISSION_KEYS) {
      base[key] = true;
    }
    return base;
  }
  const partial = USER_PERMISSION_PRESETS[preset];
  for (const [key, value] of Object.entries(partial)) {
    base[key as UserPermissionFormKey] = !!value;
  }
  return base;
}

export function isAdminTerritoryPermission(key: UserPermissionFormKey): boolean {
  return ADMIN_TERRITORY_PERMISSION_KEYS.has(key);
}
