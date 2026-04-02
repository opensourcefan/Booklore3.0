import {Component, OnDestroy, OnInit, inject} from '@angular/core';
import {filter, Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {NavigationEnd, Router} from '@angular/router';
import {ProgressSpinner} from 'primeng/progressspinner';
import {DirectoryTreeService, DirectoryRootNode} from '../../service/directory-tree.service';
import {DirectoryFilterService} from '../../service/directory-filter.service';
import {DirectoryPanelService} from '../../service/directory-panel.service';
import {DirectoryTreeNodeComponent} from '../directory-tree-node/directory-tree-node.component';
import {ResizableDividerDirective} from '../../../../shared/directives/resizable-divider.directive';

@Component({
  selector: 'app-directory-panel',
  standalone: true,
  imports: [ProgressSpinner, DirectoryTreeNodeComponent, ResizableDividerDirective],
  templateUrl: './directory-panel.component.html',
  styleUrls: ['./directory-panel.component.scss']
})
export class DirectoryPanelComponent implements OnInit, OnDestroy {
  visible = false;
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
  readonly panelService = inject(DirectoryPanelService);

  ngOnInit(): void {
    // Track visibility
    this.panelService.visible$.pipe(takeUntil(this.destroy$)).subscribe(v => {
      const wasVisible = this.visible;
      this.visible = v;
      if (v && !wasVisible) {
        const saved = localStorage.getItem('bl-dir-panel-width');
        const width = saved ? parseInt(saved, 10) : 200;
        document.documentElement.style.setProperty('--dir-panel-width', width + 'px');
        if (this.tree.length === 0) {
          this.loadTree();
        }
      } else if (!v) {
        document.documentElement.style.setProperty('--dir-panel-width', '0px');
      }
    });

    // Track selected filter
    this.filterService.filter$.pipe(takeUntil(this.destroy$)).subscribe(f => {
      this.selectedPath = f?.fileSubPath ?? null;
      this.selectedLibraryPathId = f?.libraryPathId ?? null;
    });

    // Track route changes
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntil(this.destroy$)
    ).subscribe(() => this.onRouteChange());

    this.onRouteChange();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    document.documentElement.style.setProperty('--dir-panel-width', '0px');
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
