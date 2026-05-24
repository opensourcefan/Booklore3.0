import {Injectable, inject} from '@angular/core';
import {User, UserService} from '../../../../features/settings/user-management/user.service';

export interface ToolbarItem {
  id: string;
  type: 'button' | 'separator';
  visible: boolean;
  label?: string;
  icon?: string;
}

export const STORAGE_KEY = 'bl-toolbar-config';

const DEFAULT_ITEMS: ToolbarItem[] = [
  {id: 'bookdrop', type: 'button', visible: true, label: 'Bookdrop', icon: 'pi pi-inbox'},
  {id: 'createLibrary', type: 'button', visible: true, label: 'Create New Library', icon: 'pi pi-plus-circle'},
  {id: 'upload', type: 'button', visible: true, label: 'Upload', icon: 'pi pi-upload'},
  {id: 'sep1', type: 'separator', visible: true},
  {id: 'metadata', type: 'button', visible: true, label: 'Metadata', icon: 'pi pi-database'},
  {id: 'stats', type: 'button', visible: true, label: 'Stats', icon: 'pi pi-chart-bar'},
  {id: 'sep2', type: 'separator', visible: true},
  {id: 'layoutPhone', type: 'button', visible: true, label: 'Phone Mode', icon: 'pi pi-mobile'},
  {id: 'layoutTablet', type: 'button', visible: true, label: 'Tablet Mode', icon: 'pi pi-tablet'},
  {id: 'layoutAuto', type: 'button', visible: true, label: 'Auto Mode', icon: 'pi pi-desktop'},
  {id: 'sep3', type: 'separator', visible: true},
  {id: 'fullscreen', type: 'button', visible: true, label: 'Fullscreen', icon: 'pi pi-window-maximize'},
  {id: 'notifications', type: 'button', visible: true, label: 'Notifications', icon: 'pi pi-bell'},
  {id: 'theme', type: 'button', visible: true, label: 'Theme', icon: 'pi pi-palette'},
  {id: 'user', type: 'button', visible: true, label: 'User', icon: 'pi pi-user'},
  {id: 'logout', type: 'button', visible: true, label: 'Logout', icon: 'pi pi-sign-out'},
];

@Injectable({providedIn: 'root'})
export class ToolbarConfigService {
  private userService = inject(UserService);
  items: ToolbarItem[] = this.getDefaultItems();

  load(user: User | null | undefined = this.userService.getCurrentUser()): void {
    const legacyItems = this.readLegacyLocalStorage();

    if (!user) {
      this.items = legacyItems ? this.mergeWithDefaults(legacyItems) : this.getDefaultItems();
      return;
    }

    const savedItems = user.userSettings?.toolbarConfig;
    if (Array.isArray(savedItems)) {
      const normalizedSaved = this.mergeWithDefaults(savedItems);
      const normalizedLegacy = legacyItems ? this.mergeWithDefaults(legacyItems) : null;

      if (normalizedLegacy && this.shouldMigrateLegacyConfig(normalizedSaved, normalizedLegacy)) {
        this.items = normalizedLegacy;
        this.userService.updateUserSetting(user.id, 'toolbarConfig', normalizedLegacy);
        this.clearLegacyLocalStorage();
        return;
      }

      this.items = normalizedSaved;
      if (normalizedLegacy && this.isSameConfig(normalizedSaved, normalizedLegacy)) {
        this.clearLegacyLocalStorage();
      }
      return;
    }

    if (legacyItems) {
      this.items = this.mergeWithDefaults(legacyItems);
      this.userService.updateUserSetting(user.id, 'toolbarConfig', this.items);
      this.clearLegacyLocalStorage();
      return;
    }

    this.items = this.getDefaultItems();
  }

  setItems(items: ToolbarItem[]): void {
    this.items = this.normalizeItems(items);
  }

  save(): void {
    const user = this.userService.getCurrentUser();
    if (!user) {
      return;
    }

    this.userService.updateUserSetting(user.id, 'toolbarConfig', this.items);
    this.clearLegacyLocalStorage();
  }

  reset(): void {
    this.items = this.getDefaultItems();
    const user = this.userService.getCurrentUser();
    if (user) {
      this.userService.updateUserSetting(user.id, 'toolbarConfig', this.items);
    }
    this.clearLegacyLocalStorage();
  }

  getDefaultItems(): ToolbarItem[] {
    return DEFAULT_ITEMS.map(item => ({...item}));
  }

  isVisible(id: string): boolean {
    return this.items.find(i => i.id === id)?.visible ?? true;
  }

  private normalizeItems(items: ToolbarItem[]): ToolbarItem[] {
    const defaults = new Map(DEFAULT_ITEMS.map(item => [item.id, item]));
    const seen = new Set<string>();
    const normalized: ToolbarItem[] = [];

    // First pass: add all saved items that exist in defaults (maintaining saved order)
    for (const item of items) {
      const defaultItem = defaults.get(item.id);
      if (!defaultItem || seen.has(item.id)) {
        continue;
      }
      normalized.push({...defaultItem, ...item});
      seen.add(item.id);
    }

    // Second pass: insert new default items in their correct position relative to
    // their predecessors in DEFAULT_ITEMS (so new toolbar items aren't appended at the end)
    for (let i = 0; i < DEFAULT_ITEMS.length; i++) {
      const defaultItem = DEFAULT_ITEMS[i];
      if (seen.has(defaultItem.id)) continue;

      // Find the last predecessor (from DEFAULT_ITEMS) that is already in normalized
      let insertAfterIdx = -1;
      for (let j = i - 1; j >= 0; j--) {
        const predecessorId = DEFAULT_ITEMS[j].id;
        const idx = normalized.findIndex(n => n.id === predecessorId);
        if (idx >= 0) {
          insertAfterIdx = idx;
          break;
        }
      }

      if (insertAfterIdx >= 0) {
        normalized.splice(insertAfterIdx + 1, 0, {...defaultItem});
      } else {
        normalized.unshift({...defaultItem});
      }
    }

    return normalized;
  }

  private mergeWithDefaults(saved: ToolbarItem[]): ToolbarItem[] {
    return this.normalizeItems(saved);
  }

  private readLegacyLocalStorage(): ToolbarItem[] | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) as ToolbarItem[] : null;
    } catch {
      return null;
    }
  }

  private clearLegacyLocalStorage(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  private shouldMigrateLegacyConfig(serverItems: ToolbarItem[], legacyItems: ToolbarItem[]): boolean {
    return this.isDefaultConfig(serverItems) && !this.isDefaultConfig(legacyItems) && !this.isSameConfig(serverItems, legacyItems);
  }

  private isDefaultConfig(items: ToolbarItem[]): boolean {
    return this.isSameConfig(items, this.getDefaultItems());
  }

  private isSameConfig(a: ToolbarItem[], b: ToolbarItem[]): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }
}
