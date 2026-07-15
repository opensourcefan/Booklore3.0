import {Component, inject, OnInit} from '@angular/core';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {UtilityService} from './utility.service';
import {TableModule} from 'primeng/table';
import {InputText} from 'primeng/inputtext';

import {FormsModule} from '@angular/forms';
import {ProgressSpinner} from 'primeng/progressspinner';
import {MenuItem} from 'primeng/api';
import {CheckboxModule} from 'primeng/checkbox';
import {InputIcon} from 'primeng/inputicon';
import {Button} from 'primeng/button';
import {IconField} from 'primeng/iconfield';
import {Tooltip} from 'primeng/tooltip';
import {TranslocoDirective, TranslocoPipe} from '@jsverse/transloco';
import {UserService} from '../../../features/settings/user-management/user.service';
import {LibraryService} from '../../../features/book/service/library.service';
import {Library} from '../../../features/book/model/library.model';

@Component({
  selector: 'app-directory-picker-v2',
  standalone: true,
  templateUrl: './directory-picker.component.html',
  imports: [
    TableModule,
    InputText,
    FormsModule,
    ProgressSpinner,
    CheckboxModule,
    InputIcon,
    Button,
    InputIcon,
    IconField,
    Tooltip,
    TranslocoDirective,
    TranslocoPipe
  ],
  styleUrls: ['./directory-picker.component.scss']
})
export class DirectoryPickerComponent implements OnInit {
  value: unknown;
  paths: string[] = [];
  filteredPaths: string[] = [];
  selectedProductName = '';
  selectedFolders: string[] = [];
  selectedFoldersMap: Record<string, boolean> = {};
  searchQuery = '';
  isLoading = false;
  breadcrumbItems: MenuItem[] = [];
  home: MenuItem = {icon: 'pi pi-home', command: () => this.navigateToRoot()};
  importedFolders: string[] = [];
  importedFoldersMap: Record<string, boolean> = {};
  /** Root the home/up controls cannot leave (admin: /books, non-admin: jail root). */
  browseRoot = '/books';

  private utilityService = inject(UtilityService);
  private dynamicDialogRef = inject(DynamicDialogRef);
  private dynamicDialogConfig = inject(DynamicDialogConfig);
  private userService = inject(UserService);
  private libraryService = inject(LibraryService);

  ngOnInit() {
    this.importedFolders = (this.dynamicDialogConfig.data?.existingFolders ?? []).map((folder: string) => this.normalizePath(folder));
    this.importedFoldersMap = this.importedFolders.reduce<Record<string, boolean>>((acc, folder) => {
      acc[folder] = true;
      return acc;
    }, {});
    const configuredRoot = this.dynamicDialogConfig.data?.initialPath as string | undefined;
    const initialPath = configuredRoot?.trim()
      ? this.normalizePath(configuredRoot)
      : this.resolveDefaultBrowseRoot();
    this.browseRoot = initialPath;
    this.selectedProductName = initialPath;
    this.getFolders(initialPath);
  }

  getFolders(path: string): void {
    this.isLoading = true;
    this.filteredPaths = [];
    this.utilityService.getFolders(path).subscribe({
      next: (folders: string[]) => {
        this.paths = folders;
        this.filteredPaths = folders;
        this.isLoading = false;
        this.updateBreadcrumb(path);
        folders.forEach(folder => {
          this.selectedFoldersMap[folder] = this.selectedFolders.includes(folder);
        });
      },
      error: (error) => {
        console.error('Error fetching folders:', error);
        this.isLoading = false;
      }
    });
  }

  updateBreadcrumb(path: string): void {
    if (path === '/' || path === '') {
      this.breadcrumbItems = [];
      return;
    }

    const parts = path.split('/').filter(p => p);
    const root = this.normalizePath(this.browseRoot);
    this.breadcrumbItems = parts.map((part, index) => {
      const fullPath = '/' + parts.slice(0, index + 1).join('/');
      const withinRoot = fullPath === root || fullPath.startsWith(root + '/');
      return {
        label: part,
        command: withinRoot ? () => this.navigateToPath(fullPath) : undefined
      };
    });
  }

  navigateToRoot(): void {
    this.selectedProductName = this.browseRoot;
    this.getFolders(this.browseRoot);
    this.searchQuery = '';
  }

  navigateToPath(path: string): void {
    if (!this.isWithinBrowseRoot(path)) {
      return;
    }
    this.selectedProductName = path;
    this.getFolders(path);
    this.searchQuery = '';
  }

  onRowClick(path: string): void {
    this.selectedProductName = path;
    this.getFolders(path);
    this.searchQuery = '';
  }

  onCheckboxChange(path: string, checked: boolean): void {
    const index = this.selectedFolders.indexOf(path);
    if (checked && index === -1) {
      this.selectedFolders.push(path);
    } else if (!checked && index > -1) {
      this.selectedFolders.splice(index, 1);
    }
  }

  isFolderSelected(path: string): boolean {
    return this.selectedFolders.includes(path);
  }

  goUp(): void {
    if (this.isAtBrowseRoot()) {
      return;
    }
    const result = this.selectedProductName.substring(0, this.selectedProductName.lastIndexOf('/')) || '/';
    if (!this.isWithinBrowseRoot(result)) {
      this.selectedProductName = this.browseRoot;
      this.getFolders(this.browseRoot);
      this.searchQuery = '';
      return;
    }
    this.selectedProductName = result;
    this.getFolders(result);
    this.searchQuery = '';
  }

  isAtBrowseRoot(): boolean {
    return this.normalizePath(this.selectedProductName || this.browseRoot) === this.normalizePath(this.browseRoot);
  }

  onSearch(): void {
    if (!this.searchQuery.trim()) {
      this.filteredPaths = this.paths;
      return;
    }

    const query = this.searchQuery.toLowerCase();
    this.filteredPaths = this.paths.filter(path =>
      path.toLowerCase().includes(query)
    );
  }

  onSelect(): void {
    this.dynamicDialogRef.close(this.selectedFolders);
  }

  onCancel(): void {
    this.dynamicDialogRef.close(null);
  }

  selectAll(): void {
    this.filteredPaths.forEach(folder => {
      if (!this.selectedFolders.includes(folder)) {
        this.selectedFolders.push(folder);
      }
      this.selectedFoldersMap[folder] = true;
    });
  }

  deselectAll(): void {
    this.selectedFolders = [];
    Object.keys(this.selectedFoldersMap).forEach(key => {
      this.selectedFoldersMap[key] = false;
    });
  }

  selectCurrent(): void {
    const currentPath = this.selectedProductName || this.browseRoot;
    if (!this.selectedFolders.includes(currentPath)) {
      this.selectedFolders.push(currentPath);
    }
    this.selectedFoldersMap[currentPath] = true;
  }

  getFolderName(path: string): string {
    return path.split('/').filter(p => p).pop() || path;
  }

  getDisplayPath(path: string): string {
    if (!path || path === '/') {
      return '/';
    }
    const parts = path.split('/').filter(p => p);
    if (parts.length <= 2) {
      return path;
    }
    return '.../' + parts.slice(parts.length - 2).join('/');
  }

  isImported(path: string): boolean {
    return this.getImportState(path) === 'direct';
  }

  hasImportedDescendants(path: string): boolean {
    return this.getImportState(path) === 'descendant';
  }

  shouldShowImportBadge(path: string): boolean {
    return this.getImportState(path) !== 'none';
  }

  getImportBadgeKey(path: string): string {
    return this.hasImportedDescendants(path) ? 'subdirectoriesImported' : 'alreadyImported';
  }

  getImportedFolderCountInView(): number {
    return this.filteredPaths.filter(path => this.isImported(path)).length;
  }

  private getImportState(path: string): 'direct' | 'descendant' | 'none' {
    const normalizedPath = this.normalizePath(path);

    if (this.importedFoldersMap[normalizedPath]) {
      return 'direct';
    }

    const descendantPrefix = normalizedPath === '/' ? '/' : `${normalizedPath}/`;
    const hasImportedDescendant = this.importedFolders.some(importedFolder =>
      importedFolder !== normalizedPath && importedFolder.startsWith(descendantPrefix)
    );

    return hasImportedDescendant ? 'descendant' : 'none';
  }

  private normalizePath(path: string): string {
    if (!path || path === '/') {
      return '/';
    }

    const normalized = path.replace(/\/+/g, '/').replace(/\/+$|\/$/g, '');
    return normalized || '/';
  }

  private isWithinBrowseRoot(path: string): boolean {
    const normalized = this.normalizePath(path);
    const root = this.normalizePath(this.browseRoot);
    return normalized === root || normalized.startsWith(root + '/');
  }

  /**
   * Admin → `/books`. Non-admin → personal library path, else first assigned path,
   * else `/books/_users/{id}`.
   */
  private resolveDefaultBrowseRoot(): string {
    const user = this.userService.getCurrentUser();
    if (!user) {
      return '/books';
    }
    if (user.permissions?.admin) {
      return '/books';
    }

    const libraries = this.libraryService.getLibrariesFromState() ?? [];
    const personal = libraries.find(lib => lib.ownerUserId === user.id)
      ?? user.assignedLibraries?.find((lib: Library) => lib.ownerUserId === user.id);
    const personalPath = personal?.paths?.[0]?.path;
    if (personalPath) {
      return this.normalizePath(personalPath);
    }

    const firstAssigned = libraries.find(lib => lib.paths?.[0]?.path)
      ?? user.assignedLibraries?.find((lib: Library) => lib.paths?.[0]?.path);
    const assignedPath = firstAssigned?.paths?.[0]?.path;
    if (assignedPath) {
      return this.normalizePath(assignedPath);
    }

    return this.normalizePath(`/books/_users/${user.id}`);
  }
}
