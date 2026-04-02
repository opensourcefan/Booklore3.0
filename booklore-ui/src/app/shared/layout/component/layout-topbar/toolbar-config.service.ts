import {Injectable} from '@angular/core';

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
  {id: 'dirExplorer', type: 'button', visible: true, label: 'Directory Explorer', icon: 'pi pi-folder'},
  {id: 'sep1', type: 'separator', visible: true},
  {id: 'metadata', type: 'button', visible: true, label: 'Metadata', icon: 'pi pi-database'},
  {id: 'stats', type: 'button', visible: true, label: 'Stats', icon: 'pi pi-chart-bar'},
  {id: 'sep2', type: 'separator', visible: true},
  {id: 'notifications', type: 'button', visible: true, label: 'Notifications', icon: 'pi pi-bell'},
  {id: 'theme', type: 'button', visible: true, label: 'Theme', icon: 'pi pi-palette'},
  {id: 'user', type: 'button', visible: true, label: 'User', icon: 'pi pi-user'},
];

@Injectable({providedIn: 'root'})
export class ToolbarConfigService {
  items: ToolbarItem[] = [];

  constructor() {
    this.load();
  }

  load(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: ToolbarItem[] = JSON.parse(saved);
        this.items = this.mergeWithDefaults(parsed);
      } else {
        this.items = this.getDefaultItems();
      }
    } catch {
      this.items = this.getDefaultItems();
    }
  }

  setItems(items: ToolbarItem[]): void {
    this.items = this.normalizeItems(items);
  }

  save(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
  }

  reset(): void {
    this.items = this.getDefaultItems();
    localStorage.removeItem(STORAGE_KEY);
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

    for (const item of items) {
      const defaultItem = defaults.get(item.id);
      if (!defaultItem || seen.has(item.id)) {
        continue;
      }
      normalized.push({...defaultItem, ...item});
      seen.add(item.id);
    }

    for (const defaultItem of DEFAULT_ITEMS) {
      if (!seen.has(defaultItem.id)) {
        normalized.push({...defaultItem});
      }
    }

    return normalized;
  }

  private mergeWithDefaults(saved: ToolbarItem[]): ToolbarItem[] {
    return this.normalizeItems(saved);
  }
}
