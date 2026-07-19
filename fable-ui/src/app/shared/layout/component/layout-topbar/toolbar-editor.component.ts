import {Component, EventEmitter, inject, Output, OnInit} from '@angular/core';
import {CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray} from '@angular/cdk/drag-drop';
import {ToolbarConfigService, ToolbarItem} from './toolbar-config.service';

@Component({
  selector: 'app-toolbar-editor',
  standalone: true,
  imports: [CdkDropList, CdkDrag, CdkDragHandle],
  template: `
    <div class="toolbar-editor">
      <div class="toolbar-editor-header">
        <div class="toolbar-editor-title-row">
          <span>Customize Toolbar</span>
          <button type="button" class="toolbar-editor-close" (click)="close()" aria-label="Close" title="Close">
            <i class="pi pi-times"></i>
          </button>
        </div>
        <span class="toolbar-editor-hint">Saved for the current layout (phone, tablet, or desktop) on this browser</span>
      </div>
      <ul
          class="toolbar-editor-list"
          cdkDropList
          [cdkDropListData]="draftItems"
          (cdkDropListDropped)="onDrop($event)">
        @for (item of draftItems; track item.id) {
          <li
              class="toolbar-editor-item"
              [class.separator-item]="item.type === 'separator'"
              cdkDrag
              (cdkDragStarted)="isDragging = true"
              (cdkDragEnded)="isDragging = false">
            <div class="drag-handle" cdkDragHandle aria-label="Drag to reorder" title="Drag to reorder">
              <i class="pi pi-bars drag-icon"></i>
            </div>
            <span class="item-label">{{ getItemLabel(item) }}</span>
            @if (item.type === 'separator') {
              <button type="button" class="remove-btn" (click)="removeSeparator($index)" title="Remove Separator">
                <i class="pi pi-trash"></i>
              </button>
            } @else {
              <button type="button" class="toggle-btn" (click)="toggleVisible(item)">
                <i [class]="item.visible ? 'pi pi-eye' : 'pi pi-eye-slash'"></i>
              </button>
            }
          </li>
        }
      </ul>
      <div class="toolbar-editor-footer">
        <div class="toolbar-editor-add-actions">
          <button type="button" class="add-sep-btn" (click)="addSeparator()">
            <i class="pi pi-plus" style="font-size: 0.75rem; margin-right: 0.25rem;"></i>Add Separator
          </button>
        </div>
        <div class="toolbar-editor-actions">
          <button type="button" class="save-btn" (click)="save()">Save</button>
          <button type="button" class="reset-btn" (click)="reset()">Reset</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .toolbar-editor {
      display: flex;
      flex-direction: column;
      min-width: 220px;
      max-width: min(22rem, calc(100vw - 1.5rem));
      /* Leave room for topbar + margin so PrimeNG flip-up cannot pin to y=0. */
      max-height: min(70dvh, calc(100dvh - 5rem));
      padding: 0.5rem;
      box-sizing: border-box;
    }
    .toolbar-editor-header {
      flex-shrink: 0;
      font-weight: 700;
      font-size: 0.85rem;
      padding: 0.25rem 0 0.5rem;
      border-bottom: 1px solid var(--p-content-border-color);
      margin-bottom: 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .toolbar-editor-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }
    .toolbar-editor-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 1.75rem;
      height: 1.75rem;
      margin: -0.25rem -0.15rem -0.25rem 0;
      padding: 0;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--p-surface-400);
      cursor: pointer;
    }
    .toolbar-editor-close:hover { color: var(--p-surface-100); background: var(--p-surface-700); }
    .toolbar-editor-hint { font-weight: 500; font-size: 0.7rem; color: var(--p-surface-400); }
    .toolbar-editor-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
    .toolbar-editor-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.35rem;
      border-radius: 4px;
      border: 2px solid transparent;
      transition: background 0.15s ease, border-color 0.1s ease;
    }
    .toolbar-editor-item:hover { background: var(--p-surface-700); }

    .separator-item {
      background: rgba(255, 255, 255, 0.03);
      border: 1px dashed var(--p-surface-600);
      margin: 2px 0;
    }

    .drag-handle {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      padding: 0.25rem;
      margin: -0.25rem;
      cursor: grab;
      touch-action: none;
      color: var(--p-surface-500);
    }
    .drag-handle:active { cursor: grabbing; }
    .drag-icon { font-size: 0.65rem; pointer-events: none; }
    .item-label { flex: 1; font-size: 0.8rem; }
    .toggle-btn { background: none; border: none; cursor: pointer; color: var(--p-surface-400); padding: 0; &:hover { color: var(--p-primary-color); } }
    .remove-btn { background: none; border: none; cursor: pointer; color: var(--p-surface-400); padding: 0; transition: color 0.15s ease; &:hover { color: #ef4444; } }

    .toolbar-editor-footer { flex-shrink: 0; }
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

    .cdk-drag-preview {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 0.35rem;
      border-radius: 4px;
      background: var(--p-surface-800, var(--card-background));
      border: 1px solid var(--p-primary-color);
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.25);
      list-style: none;
    }
    .cdk-drag-placeholder { opacity: 0.35; }
    .cdk-drag-animating { transition: transform 200ms cubic-bezier(0, 0, 0.2, 1); }
    .toolbar-editor-list.cdk-drop-list-dragging .toolbar-editor-item:not(.cdk-drag-placeholder) {
      transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
    }
  `]
})
export class ToolbarEditorComponent implements OnInit {
  config = inject(ToolbarConfigService);
  @Output() saved = new EventEmitter<void>();
  /** Dismiss without persisting draft changes. */
  @Output() cancelled = new EventEmitter<void>();
  /** True while a CDK drag is active — parent popover should not auto-dismiss. */
  isDragging = false;
  draftItems: ToolbarItem[] = [];

  ngOnInit() {
    this.syncItems();
  }

  syncItems() {
    this.draftItems = this.config.items
      .filter(item => item.type === 'separator' || this.config.isAllowed(item.id))
      .map(item => ({...item}));
  }

  onDrop(event: CdkDragDrop<ToolbarItem[]>) {
    if (event.previousIndex === event.currentIndex) {
      return;
    }
    const items = [...this.draftItems];
    moveItemInArray(items, event.previousIndex, event.currentIndex);
    this.draftItems = items;
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
    this.draftItems = [...this.draftItems, newSep];
  }

  removeSeparator(index: number) {
    this.draftItems = this.draftItems.filter((_, i) => i !== index);
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

  close() {
    this.cancelled.emit();
  }
}
