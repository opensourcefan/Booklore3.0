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

function allPermissionsFalse(): Record<UserPermissionFormKey, boolean> {
  return Object.fromEntries(ALL_PERMISSION_KEYS.map(key => [key, false])) as Record<UserPermissionFormKey, boolean>;
}

/** Guest-safe defaults — never grants admin, task manager, global prefs (AI settings), or bookdrop. */
export const USER_PERMISSION_PRESETS: Record<Exclude<UserPermissionPresetId, 'custom'>, UserPermissionPresetValues> = {
  reader: {
    ...allPermissionsFalse(),
    permissionDownload: true,
    permissionAccessUserStats: true,
    permissionAccessOpds: true,
    permissionSyncKobo: true,
  },
  contributor: {
    ...allPermissionsFalse(),
    permissionDownload: true,
    permissionAccessUserStats: true,
    permissionAccessOpds: true,
    permissionSyncKobo: true,
    permissionUpload: true,
    permissionEditMetadata: true,
  },
  librarian: {
    ...allPermissionsFalse(),
    permissionDownload: true,
    permissionAccessUserStats: true,
    permissionAccessOpds: true,
    permissionSyncKobo: true,
    permissionUpload: true,
    permissionEditMetadata: true,
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
