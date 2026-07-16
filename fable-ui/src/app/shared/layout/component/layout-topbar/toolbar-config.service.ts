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
  {id: 'layoutDesktop', type: 'button', visible: true, label: 'Desktop Mode', icon: 'pi pi-desktop'},
  {id: 'layoutAuto', type: 'button', visible: true, label: 'Auto Mode', icon: 'pi pi-objects-column'},
  {id: 'sep3', type: 'separator', visible: true},
  {id: 'fullscreen', type: 'button', visible: true, label: 'Fullscreen', icon: 'pi pi-window-maximize'},
  {id: 'notifications', type: 'button', visible: true, label: 'Notifications', icon: 'pi pi-bell'},
  {id: 'theme', type: 'button', visible: true, label: 'Theme', icon: 'pi pi-palette'},
  {id: 'settings', type: 'button', visible: true, label: 'Settings', icon: 'pi pi-cog'},
  {id: 'user', type: 'button', visible: true, label: 'User', icon: 'pi pi-user'},
  {id: 'logout', type: 'button', visible: true, label: 'Logout', icon: 'pi pi-sign-out'},
];

/**
 * Toolbar layout is stored per-browser in localStorage so desktop and tablet
 * clients can keep independent button layouts for the same account.
 */
@Injectable({providedIn: 'root'})
export class ToolbarConfigService {
  private userService = inject(UserService);
  items: ToolbarItem[] = this.getDefaultItems();

  load(user: User | null | undefined = this.userService.getCurrentUser()): void {
    const localItems = this.readLocalStorage();
    if (localItems) {
      this.items = this.mergeWithDefaults(localItems);
      return;
    }

    // One-time seed from any previously synced server config, then stay local.
    const serverItems = user?.userSettings?.toolbarConfig;
    if (Array.isArray(serverItems)) {
      this.items = this.mergeWithDefaults(serverItems);
      this.writeLocalStorage(this.items);
      return;
    }

    this.items = this.getDefaultItems();
  }

  setItems(items: ToolbarItem[]): void {
    this.items = this.normalizeItems(items);
  }

  save(): void {
    this.writeLocalStorage(this.items);
  }

  reset(): void {
    this.items = this.getDefaultItems();
    this.writeLocalStorage(this.items);
  }

  getDefaultItems(): ToolbarItem[] {
    return DEFAULT_ITEMS.map(item => ({...item}));
  }

  isAllowed(id: string): boolean {
    const user = this.userService.getCurrentUser();
    switch (id) {
      case 'bookdrop':
        return !!(user?.permissions?.canAccessBookdrop || user?.permissions?.admin);
      case 'createLibrary':
        return !!(user?.permissions?.canManageLibrary || user?.permissions?.admin);
      case 'upload':
        return !!(user?.permissions?.canUpload || user?.permissions?.admin);
      case 'metadata':
        return !!(user?.permissions?.canManageLibrary || user?.permissions?.admin);
      case 'stats':
        return !!(user?.permissions?.canAccessLibraryStats || user?.permissions?.canAccessUserStats || user?.permissions?.admin);
      case 'user':
        return !user?.permissions?.demoUser;
      default:
        return true;
    }
  }

  isVisible(id: string): boolean {
    return this.items.find(i => i.id === id)?.visible ?? true;
  }

  private normalizeItems(items: ToolbarItem[]): ToolbarItem[] {
    const defaults = new Map(DEFAULT_ITEMS.map(item => [item.id, item]));
    const seen = new Set<string>();
    const normalized: ToolbarItem[] = [];

    // First pass: add all saved items that exist in defaults OR are separators (maintaining saved order)
    for (const item of items) {
      if (item.type === 'separator' || item.id.startsWith('sep')) {
        if (seen.has(item.id)) {
          continue;
        }
        normalized.push({
          id: item.id,
          type: 'separator',
          visible: item.visible ?? true
        });
        seen.add(item.id);
      } else {
        const defaultItem = defaults.get(item.id);
        if (!defaultItem || seen.has(item.id)) {
          continue;
        }
        normalized.push({...defaultItem, ...item});
        seen.add(item.id);
      }
    }

    // Second pass: insert new default items in their correct position relative to
    // their predecessors in DEFAULT_ITEMS (so new toolbar items aren't appended at the end).
    // Note: We skip default separators here to avoid re-inserting them if deleted by user.
    for (let i = 0; i < DEFAULT_ITEMS.length; i++) {
      const defaultItem = DEFAULT_ITEMS[i];
      if (defaultItem.type === 'separator') continue;
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

    // Settings must remain available as an escape hatch from a bad toolbar layout.
    for (const item of normalized) {
      if (item.id === 'settings') {
        item.visible = true;
      }
    }

    return normalized;
  }

  private mergeWithDefaults(saved: ToolbarItem[]): ToolbarItem[] {
    return this.normalizeItems(saved);
  }

  private readLocalStorage(): ToolbarItem[] | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) as ToolbarItem[] : null;
    } catch {
      return null;
    }
  }

  private writeLocalStorage(items: ToolbarItem[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }
}
