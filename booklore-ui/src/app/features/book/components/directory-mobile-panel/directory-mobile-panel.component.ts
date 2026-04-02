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
            <button type="button" class="dir-tree-root__header"
                 [class.dir-tree-root__header--selected]="isRootSelected(root)"
                 (click)="selectRoot(root)">
              <i class="pi pi-database dir-tree-root__icon"></i>
              <span class="dir-tree-root__label">
                @if (!isLibraryRoute) {
                  <span class="dir-tree-root__libname">{{ root.libraryName }}: </span>
                }{{ getShortPath(root.rootPath) }}
              </span>
            </button>
            @if (root.children && root.children.length > 0) {
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
  `]
})
export class DirectoryMobilePanelComponent implements OnInit, OnDestroy {
  tree: DirectoryRootNode[] = [];
  loading = false;
  selectedPath: string | null = null;
  selectedLibraryPathId: number | null = null;
  currentLibraryId: number | null = null;
  isLibraryRoute = false;

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
        this.loadTree();
      }
    } else {
      this.isLibraryRoute = false;
      if (this.currentLibraryId !== null) {
        this.currentLibraryId = null;
        this.tree = [];
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
      next: tree => { this.tree = tree; this.loading = false; },
      error: () => { this.tree = []; this.loading = false; }
    });
  }
}
