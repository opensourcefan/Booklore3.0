import {Component, OnDestroy, OnInit, inject} from '@angular/core';
import {filter, Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {NavigationEnd, Router} from '@angular/router';
import {ProgressSpinner} from 'primeng/progressspinner';
import {DirectoryTreeService, DirectoryRootNode} from '../../service/directory-tree.service';
import {DirectoryFilterService} from '../../service/directory-filter.service';
import {DirectoryTreeNodeComponent} from '../directory-tree-node/directory-tree-node.component';

@Component({
  selector: 'app-directory-mobile-panel',
  standalone: true,
  imports: [ProgressSpinner, DirectoryTreeNodeComponent],
  template: `
    <div class="dir-mobile-panel">
      @if (loading) {
        <div class="dir-mobile-panel__loading">
          <p-progress-spinner strokeWidth="4" styleClass="dir-panel-spinner"></p-progress-spinner>
        </div>
      } @else if (tree.length === 0) {
        <div class="dir-mobile-panel__empty">No folders found</div>
      } @else {
        @for (root of tree; track root.libraryPathId) {
          <div class="dir-tree-root">
            <div class="dir-tree-root__row">
              @if (root.children && root.children.length > 0) {
                <button type="button"
                        class="dir-tree-root__toggle"
                        (click)="toggleRoot(root, $event)"
                        [attr.aria-label]="isRootExpanded(root) ? 'Collapse' : 'Expand'">
                  {{ isRootExpanded(root) ? '−' : '+' }}
                </button>
              } @else {
                <span class="dir-tree-root__toggle-slot" aria-hidden="true"></span>
              }

              <button type="button"
                      class="dir-tree-root__header"
                      [class.dir-tree-root__header--selected]="isRootSelected(root)"
                      (click)="selectRoot(root)">
                <span class="dir-tree-root__label">
                  @if (!isLibraryRoute) {
                    <span class="dir-tree-root__libname">{{ root.libraryName }}: </span>
                  }{{ getShortPath(root.rootPath) }}
                </span>
                @if (!root.hasRootBooks) {
                  <span class="dir-tree-root__status" aria-hidden="true">
                    <i class="pi pi-ban"></i>
                  </span>
                }
              </button>
            </div>

            @if (isRootExpanded(root) && root.children && root.children.length > 0) {
              <ul class="dir-tree-children">
                @for (child of root.children; track child.path) {
                  <app-directory-tree-node
                    [node]="child"
                    [libraryPathId]="root.libraryPathId"
                    [selectedPath]="selectedPath"
                    [selectedLibraryPathId]="selectedLibraryPathId"
                    (nodeSelected)="onNodeSelected($event)">
                  </app-directory-tree-node>
                }
              </ul>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    :host {
      --dir-tree-row-height: 2rem;
      --dir-tree-row-radius: 8px;
      --dir-tree-row-font-size: 0.95rem;
      --dir-tree-toggle-slot-width: 1rem;
      --dir-tree-row-gap: 0.35rem;
      --dir-tree-row-padding-inline: 0.65rem;
      --dir-tree-indent: 1rem;
      --dir-tree-hover-background: var(--surface-hover, var(--p-surface-100, rgba(0, 0, 0, 0.06)));
      --dir-tree-selected-background: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
    }

    .dir-mobile-panel {
      max-height: 60dvh;
      overflow-y: auto;
      min-width: 220px;
      max-width: 320px;
    }
    .dir-mobile-panel__loading,
    .dir-mobile-panel__empty {
      padding: 1.5rem;
      text-align: center;
      color: var(--p-text-muted-color, #9ca3af);
      font-size: 0.82rem;
    }

    .dir-tree-root {
      margin-bottom: 0.2rem;
    }

    .dir-tree-root__row {
      display: grid;
      grid-template-columns: var(--dir-tree-toggle-slot-width) minmax(0, 1fr);
      align-items: center;
      column-gap: var(--dir-tree-row-gap);
      margin: 0 0.25rem;
    }

    .dir-tree-root__toggle,
    .dir-tree-root__toggle-slot {
      width: var(--dir-tree-toggle-slot-width);
      height: var(--dir-tree-toggle-slot-width);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .dir-tree-root__toggle {
      border: none;
      background: none;
      padding: 0;
      cursor: pointer;
      color: var(--p-text-muted-color, #6b7280);
      font-size: 0.95rem;
      font-weight: 700;
      line-height: 1;
    }

    .dir-tree-root__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.55rem;
      min-height: var(--dir-tree-row-height);
      width: 100%;
      padding: 0 var(--dir-tree-row-padding-inline);
      border: none;
      border-radius: var(--dir-tree-row-radius);
      background: none;
      color: var(--p-text-color);
      font-size: var(--dir-tree-row-font-size);
      font-weight: 600;
      text-align: left;
      cursor: pointer;
    }

    .dir-tree-root__header:hover {
      background: var(--dir-tree-hover-background);
    }

    .dir-tree-root__header--selected {
      background: var(--dir-tree-selected-background);
      color: var(--p-primary-color);
    }

    .dir-tree-root__label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      line-height: 1.35;
    }

    .dir-tree-root__libname {
      color: var(--p-text-muted-color, #6b7280);
      font-weight: 400;
    }

    .dir-tree-root__status {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--p-text-muted-color, #6b7280);
      font-size: 0.72rem;
      opacity: 0.7;
    }

    .dir-tree-children {
      list-style: none;
      margin: 0;
      padding: 0;
      padding-left: var(--dir-tree-indent);
    }
  `]
})
export class DirectoryMobilePanelComponent implements OnInit, OnDestroy {
  tree: DirectoryRootNode[] = [];
  loading = false;
  selectedPath: string | null = null;
  selectedLibraryPathId: number | null = null;
  currentLibraryId: number | null = null;
  isLibraryRoute = false;
  private expandedRootIds = new Set<number>();

  private destroy$ = new Subject<void>();
  private router = inject(Router);
  private treeService = inject(DirectoryTreeService);
  private filterService = inject(DirectoryFilterService);

  ngOnInit(): void {
    this.filterService.filter$.pipe(takeUntil(this.destroy$)).subscribe(f => {
      this.selectedPath = f?.fileSubPath ?? null;
      this.selectedLibraryPathId = f?.libraryPathId ?? null;
    });

    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe(() => this.onRouteChange());

    this.onRouteChange();
    this.loadTree();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onNodeSelected(event: {libraryPathId: number; fileSubPath: string}): void {
    const current = this.filterService.currentFilter;
    if (current?.libraryPathId === event.libraryPathId && current?.fileSubPath === event.fileSubPath) {
      this.filterService.clear();
    } else {
      this.filterService.setFilter(event);
    }
  }

  selectRoot(root: DirectoryRootNode): void {
    const fileSubPath = '';
    const current = this.filterService.currentFilter;
    if (current?.libraryPathId === root.libraryPathId && current?.fileSubPath === fileSubPath) {
      this.filterService.clear();
    } else {
      this.filterService.setFilter({libraryPathId: root.libraryPathId, fileSubPath});
    }
  }

  isRootSelected(root: DirectoryRootNode): boolean {
    return this.selectedLibraryPathId === root.libraryPathId && this.selectedPath === '';
  }

  isRootExpanded(root: DirectoryRootNode): boolean {
    return this.expandedRootIds.has(root.libraryPathId);
  }

  toggleRoot(root: DirectoryRootNode, event: MouseEvent): void {
    event.stopPropagation();
    if (this.isRootExpanded(root)) {
      this.expandedRootIds.delete(root.libraryPathId);
      return;
    }
    this.expandedRootIds.add(root.libraryPathId);
  }

  getShortPath(fullPath: string): string {
    const parts = fullPath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || fullPath;
  }

  private onRouteChange(): void {
    const url = this.router.url.split('?')[0].split('#')[0];
    const libraryMatch = url.match(/^\/library\/(\d+)\/books/);
    if (libraryMatch) {
      const newLibId = parseInt(libraryMatch[1], 10);
      this.isLibraryRoute = true;
      if (newLibId !== this.currentLibraryId) {
        this.currentLibraryId = newLibId;
        this.tree = [];
        this.expandedRootIds.clear();
        this.loadTree();
      }
    } else {
      this.isLibraryRoute = false;
      if (this.currentLibraryId !== null) {
        this.currentLibraryId = null;
        this.tree = [];
        this.expandedRootIds.clear();
        this.loadTree();
      }
    }
  }

  private loadTree(): void {
    this.loading = true;
    const obs = this.currentLibraryId !== null
      ? this.treeService.getTreeForLibrary(this.currentLibraryId)
      : this.treeService.getAllLibrariesTree();
    obs.pipe(takeUntil(this.destroy$)).subscribe({
      next: tree => {
        this.tree = tree;
        this.expandedRootIds.forEach(rootId => {
          if (!tree.some(root => root.libraryPathId === rootId)) {
            this.expandedRootIds.delete(rootId);
          }
        });
        this.loading = false;
      },
      error: () => { this.tree = []; this.loading = false; }
    });
  }
}
