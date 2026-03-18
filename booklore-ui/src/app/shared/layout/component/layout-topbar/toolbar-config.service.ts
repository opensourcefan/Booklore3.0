import {Injectable} from '@angular/core';

export interface ToolbarItem {
  id: string;
  type: 'button' | 'separator';
  visible: boolean;
  label?: string;
  icon?: string;
}

const STORAGE_KEY = 'bl-toolbar-config';

const DEFAULT_ITEMS: ToolbarItem[] = [
  {id: 'bookdrop', type: 'button', visible: true, label: 'Bookdrop', icon: 'pi pi-inbox'},
  {id: 'upload', type: 'button', visible: true, label: 'Upload', icon: 'pi pi-upload'},
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
        // Merge saved with defaults to pick up any new items
        const map = new Map(parsed.map(i => [i.id, i]));
        this.items = DEFAULT_ITEMS.map(d => map.get(d.id) ?? d);
      } else {
        this.items = [...DEFAULT_ITEMS];
      }
    } catch {
      this.items = [...DEFAULT_ITEMS];
    }
  }

  save(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
  }

  reset(): void {
    this.items = [...DEFAULT_ITEMS];
    localStorage.removeItem(STORAGE_KEY);
  }

  isVisible(id: string): boolean {
    return this.items.find(i => i.id === id)?.visible ?? true;
  }
}
