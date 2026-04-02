import {Component, EventEmitter, Input, Output} from '@angular/core';
import {DirectoryNode} from '../../service/directory-tree.service';

@Component({
  selector: 'app-directory-tree-node',
  standalone: true,
  imports: [],
  template: `
    <div class="dir-tree-node" [class.dir-tree-node--selected]="isSelected">
      <div class="dir-tree-node__row">
        @if (node.children && node.children.length > 0) {
          <button type="button" class="dir-tree-node__toggle" (click)="toggle($event)" [attr.aria-label]="expanded ? 'Collapse' : 'Expand'">
            {{ expanded ? '−' : '+' }}
          </button>
        } @else {
          <span class="dir-tree-node__toggle dir-tree-node__toggle--leaf"></span>
        }
        <button type="button" class="dir-tree-node__body" (click)="onSelect()">
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
  `
})
export class DirectoryTreeNodeComponent {
  @Input() node!: DirectoryNode;
  @Input() libraryPathId!: number;
  @Input() selectedPath: string | null = null;
  @Input() selectedLibraryPathId: number | null = null;
  @Output() nodeSelected = new EventEmitter<{libraryPathId: number; fileSubPath: string}>();

  expanded = false;

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
