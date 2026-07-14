import {describe, expect, it} from 'vitest';
import {
  ADMIN_TERRITORY_PERMISSION_KEYS,
  presetValuesFor,
} from './user-permission-presets';

describe('user-permission-presets', () => {
  it('reader stays non-mutating and off admin territory', () => {
    const values = presetValuesFor('reader');
    expect(values.permissionDownload).toBe(true);
    expect(values.permissionUpload).toBe(false);
    expect(values.permissionEditMetadata).toBe(false);
    for (const key of ADMIN_TERRITORY_PERMISSION_KEYS) {
      expect(values[key]).toBe(false);
    }
  });

  it('contributor can edit/delete metadata but not manage paths or system settings', () => {
    const values = presetValuesFor('contributor');
    expect(values.permissionUpload).toBe(true);
    expect(values.permissionEditMetadata).toBe(true);
    expect(values.permissionDeleteBook).toBe(true);
    expect(values.permissionBulkEditMetadata).toBe(true);
    expect(values.permissionManageLibrary).toBe(false);
    expect(values.permissionAdmin).toBe(false);
    expect(values.permissionManageGlobalPreferences).toBe(false);
  });

  it('librarian gets full library control including manage library and edit metadata', () => {
    const values = presetValuesFor('librarian');
    expect(values.permissionEditMetadata).toBe(true);
    expect(values.permissionDeleteBook).toBe(true);
    expect(values.permissionBulkEditMetadata).toBe(true);
    expect(values.permissionManageLibrary).toBe(true);
    expect(values.permissionAdmin).toBe(false);
    expect(values.permissionManageGlobalPreferences).toBe(false);
    expect(values.permissionAccessTaskManager).toBe(false);
    expect(values.permissionManageMetadataConfig).toBe(false);
  });

  it('admin enables all permissions', () => {
    const values = presetValuesFor('admin');
    expect(Object.values(values).every(Boolean)).toBe(true);
  });
});
