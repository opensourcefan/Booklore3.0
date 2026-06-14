import {Component, EventEmitter, Input, Output} from '@angular/core';
import {DirectoryNode} from '../../service/directory-tree.service';

@Component({
  selector: 'app-directory-tree-node',
  standalone: true,
  imports: [],
  template: `
    <div class="dir-tree-node">
      <div class="dir-tree-node__row">
        @if (node.children && node.children.length > 0) {
          <button type="button"
                  class="dir-tree-node__toggle"
                  (click)="toggle($event)"
                  [attr.aria-label]="expanded ? 'Collapse' : 'Expand'">
            {{ expanded ? '−' : '+' }}
          </button>
        } @else {
          <span class="dir-tree-node__toggle-slot" aria-hidden="true"></span>
        }
        <button type="button"
                class="dir-tree-node__body"
          [class.dir-tree-node__body--branch]="hasChildren"
                [class.dir-tree-node__body--selected]="isSelected"
                (click)="onSelect()">
          <span class="dir-tree-node__label">{{ node.name }}</span>
        </button>
      </div>
      @if (expanded && node.children && node.children.length > 0) {
        <ul class="dir-tree-children">
          @for (child of node.children; track child.path) {
            <app-directory-tree-node
              [node]="child"
              [selectedPath]="selectedPath"
              [selectedLibraryPathId]="selectedLibraryPathId"
              [libraryPathId]="libraryPathId"
              (nodeSelected)="nodeSelected.emit($event)">
            </app-directory-tree-node>
          }
        </ul>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .dir-tree-node__row {
      display: grid;
      grid-template-columns: var(--dir-tree-toggle-slot-width) minmax(0, 1fr);
      align-items: center;
      column-gap: var(--dir-tree-row-gap);
    }

    .dir-tree-node__toggle,
    .dir-tree-node__toggle-slot {
      width: var(--dir-tree-toggle-slot-width);
      height: var(--dir-tree-toggle-slot-width);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .dir-tree-node__toggle {
      border: none;
      background: none;
      padding: 0;
      cursor: pointer;
      color: var(--p-text-muted-color, #6b7280);
      font-size: 1.2rem;
      font-weight: 700;
      line-height: 1;
    }

    .dir-tree-node__toggle:hover {
      color: var(--p-primary-color);
    }

    .dir-tree-node__body {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      min-height: var(--dir-tree-row-height);
      width: 100%;
      padding: 0 var(--dir-tree-row-padding-inline);
      border: none;
      border-radius: var(--dir-tree-row-radius);
      background: none;
      color: var(--p-text-color);
      font-size: var(--dir-tree-row-font-size);
      text-align: left;
      cursor: pointer;
      transition: background 0.12s, color 0.12s;

      &--branch {
        background: var(--dir-tree-branch-background);
      }
    }

    .dir-tree-node__body:hover {
      background: var(--dir-tree-hover-background);
      color: var(--p-text-color);
    }

    .dir-tree-node__body--selected {
      background: var(--dir-tree-selected-background);
      color: var(--p-primary-color);
    }

    .dir-tree-node__label {
      display: block;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      line-height: 1.35;
    }

    .dir-tree-children {
      list-style: none;
      margin: 0;
      padding: 0;
      padding-left: var(--dir-tree-indent);
    }
  `]
})
export class DirectoryTreeNodeComponent {
  @Input() node!: DirectoryNode;
  @Input() libraryPathId!: number;
  @Input() selectedPath: string | null = null;
  @Input() selectedLibraryPathId: number | null = null;
  @Output() nodeSelected = new EventEmitter<{libraryPathId: number; fileSubPath: string}>();

  expanded = false;

  get hasChildren(): boolean {
    return !!this.node.children?.length;
  }

  get isSelected(): boolean {
    return this.selectedLibraryPathId === this.libraryPathId && this.selectedPath === this.node.path;
  }

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.expanded = !this.expanded;
  }

  onSelect(): void {
    this.nodeSelected.emit({libraryPathId: this.libraryPathId, fileSubPath: this.node.path});
  }
}
