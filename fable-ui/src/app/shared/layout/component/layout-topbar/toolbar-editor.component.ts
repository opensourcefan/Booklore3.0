import {Component, EventEmitter, inject, Output, OnInit} from '@angular/core';
import {ToolbarConfigService, ToolbarItem} from './toolbar-config.service';

@Component({
  selector: 'app-toolbar-editor',
  standalone: true,
  imports: [],
  template: `
    <div class="toolbar-editor">
      <div class="toolbar-editor-header">
        <span>Customize Toolbar</span>
      </div>
      <ul class="toolbar-editor-list">
        @for (item of draftItems; track item.id; let i = $index) {
          <li
              class="toolbar-editor-item"
              [class.separator-item]="item.type === 'separator'"
              [class.dragging]="dragIndex === i"
              [class.drag-over-above]="dragOverIndex === i && dragIndex > i"
              [class.drag-over-below]="dragOverIndex === i && dragIndex < i"
              draggable="true"
              (dragstart)="onDragStart(i)"
              (dragover)="onDragOver($event, i)"
              (drop)="onDrop(i)"
              (dragend)="onDragEnd()">
            <i class="pi pi-bars drag-icon"></i>
            <span class="item-label">{{ getItemLabel(item) }}</span>
            @if (item.type === 'separator') {
              <button class="remove-btn" (click)="removeSeparator(i)" title="Remove Separator">
                <i class="pi pi-trash"></i>
              </button>
            } @else {
              <button class="toggle-btn" (click)="toggleVisible(item)">
                <i [class]="item.visible ? 'pi pi-eye' : 'pi pi-eye-slash'"></i>
              </button>
            }
          </li>
        }
      </ul>
      <div class="toolbar-editor-add-actions">
        <button class="add-sep-btn" (click)="addSeparator()">
          <i class="pi pi-plus" style="font-size: 0.75rem; margin-right: 0.25rem;"></i>Add Separator
        </button>
      </div>
      <div class="toolbar-editor-actions">
        <button class="save-btn" (click)="save()">Save</button>
        <button class="reset-btn" (click)="reset()">Reset</button>
      </div>
    </div>
  `,
  styles: [`
    .toolbar-editor { min-width: 220px; padding: 0.5rem; }
    .toolbar-editor-header { font-weight: 700; font-size: 0.85rem; padding: 0.25rem 0 0.5rem; border-bottom: 1px solid var(--p-content-border-color); margin-bottom: 0.5rem; }
    .toolbar-editor-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.25rem; }
    .toolbar-editor-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.35rem;
      cursor: grab;
      border-radius: 4px;
      border-top: 2px solid transparent;
      border-bottom: 2px solid transparent;
      transition: background 0.15s ease, border-color 0.1s ease;
    }
    .toolbar-editor-item:hover { background: var(--p-surface-700); }
    .toolbar-editor-item.dragging { opacity: 0.4; }
    .toolbar-editor-item.drag-over-above { border-top: 2px solid var(--p-primary-color); }
    .toolbar-editor-item.drag-over-below { border-bottom: 2px solid var(--p-primary-color); }
    
    .separator-item {
      background: rgba(255, 255, 255, 0.03);
      border: 1px dashed var(--p-surface-600);
      margin: 2px 0;
    }
    
    .drag-icon { font-size: 0.65rem; color: var(--p-surface-500); }
    .item-label { flex: 1; font-size: 0.8rem; }
    .toggle-btn { background: none; border: none; cursor: pointer; color: var(--p-surface-400); padding: 0; &:hover { color: var(--p-primary-color); } }
    .remove-btn { background: none; border: none; cursor: pointer; color: var(--p-surface-400); padding: 0; transition: color 0.15s ease; &:hover { color: #ef4444; } }
    
    .toolbar-editor-add-actions { display: flex; margin-top: 0.5rem; padding-top: 0.25rem; }
    .add-sep-btn {
      width: 100%;
      padding: 0.3rem;
      border-radius: 4px;
      border: 1px dashed var(--p-content-border-color);
      cursor: pointer;
      font-size: 0.75rem;
      background: transparent;
      color: var(--p-surface-300);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.25rem;
      transition: all 0.2s ease;
      &:hover {
        border-color: var(--p-primary-color);
        color: var(--p-primary-color);
        background: rgba(255, 255, 255, 0.02);
      }
    }
    
    .toolbar-editor-actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--p-content-border-color); }
    .save-btn, .reset-btn { flex: 1; padding: 0.25rem; border-radius: 4px; border: 1px solid var(--p-content-border-color); cursor: pointer; font-size: 0.75rem; background: var(--p-surface-700); color: var(--p-surface-100); &:hover { border-color: var(--p-primary-color); } }
  `]
})
export class ToolbarEditorComponent implements OnInit {
  config = inject(ToolbarConfigService);
  @Output() saved = new EventEmitter<void>();
  dragIndex = -1;
  dragOverIndex = -1;
  draftItems: ToolbarItem[] = [];

  ngOnInit() {
    this.syncItems();
  }

  syncItems() {
    this.draftItems = this.config.items
      .filter(item => item.type === 'separator' || this.config.isAllowed(item.id))
      .map(item => ({...item}));
  }

  onDragStart(i: number) {
    this.dragIndex = i;
  }

  onDragOver(e: DragEvent, i: number) {
    e.preventDefault();
    if (this.dragIndex === i) {
      this.dragOverIndex = -1;
      return;
    }
    this.dragOverIndex = i;
  }

  onDragEnd() {
    this.dragIndex = -1;
    this.dragOverIndex = -1;
  }

  onDrop(i: number) {
    if (this.dragIndex < 0 || this.dragIndex === i) {
      this.dragIndex = -1;
      this.dragOverIndex = -1;
      return;
    }
    const items = [...this.draftItems];
    const [moved] = items.splice(this.dragIndex, 1);
    items.splice(i, 0, moved);
    this.draftItems = items;
    this.dragIndex = -1;
    this.dragOverIndex = -1;
  }

  getItemLabel(item: ToolbarItem): string {
    if (item.type !== 'separator') {
      return item.label ?? item.id;
    }
    return 'Separator';
  }

  addSeparator() {
    const newSep: ToolbarItem = {
      id: `sep_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      type: 'separator',
      visible: true
    };
    this.draftItems.push(newSep);
  }

  removeSeparator(index: number) {
    this.draftItems.splice(index, 1);
  }

  toggleVisible(item: ToolbarItem) {
    item.visible = !item.visible;
  }

  save() {
    this.config.setItems(this.draftItems.map(item => ({...item})));
    this.config.save();
    this.saved.emit();
  }

  reset() {
    this.config.reset();
    this.syncItems();
    this.saved.emit();
  }
}
