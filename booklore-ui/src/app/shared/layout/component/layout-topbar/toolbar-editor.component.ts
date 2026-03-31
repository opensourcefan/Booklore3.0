import {Component, EventEmitter, inject, Output} from '@angular/core';
import {NgFor} from '@angular/common';
import {ToolbarConfigService, ToolbarItem} from './toolbar-config.service';

@Component({
  selector: 'app-toolbar-editor',
  standalone: true,
  imports: [NgFor],
  template: `
    <div class="toolbar-editor">
      <div class="toolbar-editor-header">
        <span>Customize Toolbar</span>
      </div>
      <ul class="toolbar-editor-list">
        <li *ngFor="let item of draftItems; let i = index"
            class="toolbar-editor-item"
            draggable="true"
            (dragstart)="onDragStart(i)"
            (dragover)="onDragOver($event, i)"
            (drop)="onDrop(i)">
          <i class="pi pi-bars drag-icon"></i>
          <span class="item-label">{{ getItemLabel(item) }}</span>
          <button class="toggle-btn" (click)="toggleVisible(item)">
            <i [class]="item.visible ? 'pi pi-eye' : 'pi pi-eye-slash'"></i>
          </button>
        </li>
      </ul>
      <div class="toolbar-editor-actions">
        <button class="save-btn" (click)="save()">Save</button>
        <button class="reset-btn" (click)="reset()">Reset</button>
      </div>
    </div>
  `,
  styles: [`
    .toolbar-editor { min-width: 220px; padding: 0.5rem; }
    .toolbar-editor-header { font-weight: 700; font-size: 0.85rem; padding: 0.25rem 0 0.5rem; border-bottom: 1px solid var(--p-content-border-color); margin-bottom: 0.5rem; }
    .toolbar-editor-list { list-style: none; padding: 0; margin: 0; }
    .toolbar-editor-item { display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0.25rem; cursor: grab; border-radius: 4px; &:hover { background: var(--p-surface-700); } }
    .drag-icon { font-size: 0.65rem; color: var(--p-surface-500); }
    .item-label { flex: 1; font-size: 0.8rem; }
    .toggle-btn { background: none; border: none; cursor: pointer; color: var(--p-surface-400); padding: 0; &:hover { color: var(--p-primary-color); } }
    .toolbar-editor-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--p-content-border-color); }
    .save-btn, .reset-btn { flex: 1; padding: 0.25rem; border-radius: 4px; border: 1px solid var(--p-content-border-color); cursor: pointer; font-size: 0.75rem; background: var(--p-surface-700); color: var(--p-surface-100); &:hover { border-color: var(--p-primary-color); } }
  `]
})
export class ToolbarEditorComponent {
  config = inject(ToolbarConfigService);
  @Output() saved = new EventEmitter<void>();
  private dragIndex = -1;
  draftItems: ToolbarItem[] = this.config.items.map(item => ({...item}));

  onDragStart(i: number) { this.dragIndex = i; }
  onDragOver(e: DragEvent, _i: number) { e.preventDefault(); }
  onDrop(i: number) {
    if (this.dragIndex < 0 || this.dragIndex === i) return;
    const items = [...this.draftItems];
    const [moved] = items.splice(this.dragIndex, 1);
    items.splice(i, 0, moved);
    this.draftItems = items;
    this.dragIndex = -1;
  }
  getItemLabel(item: ToolbarItem): string {
    if (item.type !== 'separator') {
      return item.label ?? item.id;
    }
    return item.id === 'sep1' ? 'Separator 1' : item.id === 'sep2' ? 'Separator 2' : 'Separator';
  }
  toggleVisible(item: ToolbarItem) { item.visible = !item.visible; }
  save() {
    this.config.setItems(this.draftItems.map(item => ({...item})));
    this.config.save();
    this.saved.emit();
  }
  reset() {
    this.config.reset();
    this.draftItems = this.config.items.map(item => ({...item}));
    this.saved.emit();
  }
}
