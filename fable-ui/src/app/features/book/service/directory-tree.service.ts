import {Injectable, inject} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable, of} from 'rxjs';
import {map} from 'rxjs/operators';
import {API_CONFIG} from '../../../core/config/api-config';

export interface DirectoryNode {
  name: string;
  path: string;
  children?: DirectoryNode[];
}

export interface DirectoryRootNode {
  libraryId: number;
  libraryName: string;
  libraryPathId: number;
  rootPath: string;
  hasRootBooks: boolean;
  children?: DirectoryNode[];
}

@Injectable({providedIn: 'root'})
export class DirectoryTreeService {
  private http = inject(HttpClient);
  private libraryCache = new Map<number, DirectoryRootNode[]>();
  private allCache: DirectoryRootNode[] | null = null;
  private readonly collator = new Intl.Collator(undefined, {numeric: true, sensitivity: 'base'});

  getTreeForLibrary(libraryId: number): Observable<DirectoryRootNode[]> {
    const cached = this.libraryCache.get(libraryId);
    if (cached) return of(cached);
    return this.http.get<DirectoryRootNode[]>(`${API_CONFIG.BASE_URL}/api/v1/libraries/${libraryId}/directory-tree`).pipe(
      map(data => {
        const sorted = this.sortRootNodes(data);
        this.libraryCache.set(libraryId, sorted);
        return sorted;
      })
    );
  }

  getAllLibrariesTree(): Observable<DirectoryRootNode[]> {
    if (this.allCache) return of(this.allCache);
    return this.http.get<DirectoryRootNode[]>(`${API_CONFIG.BASE_URL}/api/v1/libraries/directory-tree`).pipe(
      map(data => {
        const sorted = this.sortRootNodes(data);
        this.allCache = sorted;
        return sorted;
      })
    );
  }

  invalidateLibrary(libraryId: number): void {
    this.libraryCache.delete(libraryId);
    this.allCache = null;
  }

  invalidateAll(): void {
    this.libraryCache.clear();
    this.allCache = null;
  }

  private sortRootNodes(nodes: DirectoryRootNode[]): DirectoryRootNode[] {
    return [...nodes]
      .map(node => ({
        ...node,
        children: this.sortDirectoryNodes(node.children ?? []),
      }))
      .sort((a, b) => this.compareRootNodes(a, b));
  }

  private sortDirectoryNodes(nodes: DirectoryNode[]): DirectoryNode[] {
    return [...nodes]
      .map(node => ({
        ...node,
        children: this.sortDirectoryNodes(node.children ?? []),
      }))
      .sort((a, b) => this.collator.compare(a.name, b.name));
  }

  private compareRootNodes(a: DirectoryRootNode, b: DirectoryRootNode): number {
    const nameComparison = this.collator.compare(this.getRootLabel(a.rootPath), this.getRootLabel(b.rootPath));
    if (nameComparison !== 0) {
      return nameComparison;
    }

    const libraryComparison = this.collator.compare(a.libraryName, b.libraryName);
    if (libraryComparison !== 0) {
      return libraryComparison;
    }

    return this.collator.compare(a.rootPath, b.rootPath);
  }

  private getRootLabel(rootPath: string): string {
    const normalizedPath = rootPath.replace(/\\/g, '/');
    const parts = normalizedPath.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? rootPath;
  }
}
