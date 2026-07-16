import {Injectable, OnDestroy, inject} from '@angular/core';
import {Subscription} from 'rxjs';
import {User, UserService} from '../../../../features/settings/user-management/user.service';
import {DeviceBreakpoint, MobileUxService} from '../../../../core/services/mobile-ux.service';

export interface ToolbarItem {
  id: string;
  type: 'button' | 'separator';
  visible: boolean;
  label?: string;
  icon?: string;
}

/** Legacy single-layout key (migrated into the current effective layout once). */
export const STORAGE_KEY = 'bl-toolbar-config';
/** Per effective layout (phone/tablet/desktop) toolbar layouts for this browser. */
export const STORAGE_KEY_BY_MODE = 'bl-toolbar-config-by-mode';

/**
 * Storage keys follow the rendered layout, not the topbar mode-button selection.
 * Forced phone/tablet/desktop map 1:1; auto / auto-shape resolve to the active
 * breakpoint so rotating a tablet swaps tablet ↔ desktop toolbar configs.
 */
export type ToolbarLayoutKey = 'phone' | 'tablet' | 'desktop';

type ToolbarConfigByMode = Partial<Record<ToolbarLayoutKey, ToolbarItem[]>>;

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
 * Toolbar layout is stored per browser AND per effective layout (phone / tablet /
 * desktop). Mode-button selections like auto-shape do not get their own key;
 * they reuse the layout currently being rendered.
 */
@Injectable({providedIn: 'root'})
export class ToolbarConfigService implements OnDestroy {
  private userService = inject(UserService);
  private mobileUx = inject(MobileUxService);
  private breakpointSub: Subscription;
  items: ToolbarItem[] = this.getDefaultItems();
  /** Bumped whenever items are replaced so OnPush consumers can refresh. */
  revision = 0;
  private lastLoadedLayoutKey: ToolbarLayoutKey | null = null;
  private activeBreakpoint: DeviceBreakpoint = 'desktop';

  constructor() {
    // breakpoint$ already reacts to layoutMode + viewport size/orientation.
    this.breakpointSub = this.mobileUx.breakpoint$.subscribe(bp => {
      this.activeBreakpoint = bp;
      const key = this.breakpointToLayoutKey(bp);
      if (key !== this.lastLoadedLayoutKey) {
        this.load(this.userService.getCurrentUser());
      }
    });
  }

  ngOnDestroy(): void {
    this.breakpointSub.unsubscribe();
  }

  /** Effective phone/tablet/desktop key for the currently rendered layout. */
  resolveLayoutKey(): ToolbarLayoutKey {
    return this.breakpointToLayoutKey(this.activeBreakpoint);
  }

  load(user: User | null | undefined = this.userService.getCurrentUser()): void {
    const key = this.resolveLayoutKey();
    this.lastLoadedLayoutKey = key;
    const byMode = this.readByModeMap();
    const modeItems = byMode[key];

    if (Array.isArray(modeItems)) {
      this.setActiveItems(this.mergeWithDefaults(modeItems));
      return;
    }

    // One-time migrate legacy single-key config into the current effective layout only.
    const legacyItems = this.readLegacyLocalStorage();
    if (legacyItems) {
      const migrated = this.mergeWithDefaults(legacyItems);
      this.setActiveItems(migrated);
      this.writeModeItems(key, migrated);
      this.clearLegacyLocalStorage();
      return;
    }

    // One-time seed from any previously synced server config into the current layout.
    const serverItems = user?.userSettings?.toolbarConfig;
    if (Array.isArray(serverItems)) {
      const seeded = this.mergeWithDefaults(serverItems);
      this.setActiveItems(seeded);
      this.writeModeItems(key, seeded);
      return;
    }

    this.setActiveItems(this.getDefaultItems());
  }

  setItems(items: ToolbarItem[]): void {
    this.setActiveItems(this.normalizeItems(items));
  }

  save(): void {
    this.writeModeItems(this.resolveLayoutKey(), this.items);
  }

  reset(): void {
    this.setActiveItems(this.getDefaultItems());
    this.writeModeItems(this.resolveLayoutKey(), this.items);
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

  private breakpointToLayoutKey(bp: DeviceBreakpoint): ToolbarLayoutKey {
    if (bp === 'mobile') return 'phone';
    if (bp === 'mobile-tablet') return 'tablet';
    return 'desktop';
  }

  private setActiveItems(items: ToolbarItem[]): void {
    this.items = items;
    this.revision++;
  }

  private normalizeItems(items: ToolbarItem[]): ToolbarItem[] {
    const defaults = new Map(DEFAULT_ITEMS.map(item => [item.id, item]));
    const seen = new Set<string>();
    const normalized: ToolbarItem[] = [];

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

    for (let i = 0; i < DEFAULT_ITEMS.length; i++) {
      const defaultItem = DEFAULT_ITEMS[i];
      if (defaultItem.type === 'separator') continue;
      if (seen.has(defaultItem.id)) continue;

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

  private readByModeMap(): ToolbarConfigByMode {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_BY_MODE);
      if (!saved) {
        return {};
      }
      const parsed = JSON.parse(saved) as ToolbarConfigByMode;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private writeModeItems(mode: ToolbarLayoutKey, items: ToolbarItem[]): void {
    const byMode = this.readByModeMap();
    byMode[mode] = items;
    localStorage.setItem(STORAGE_KEY_BY_MODE, JSON.stringify(byMode));
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
}
