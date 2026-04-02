import {Injectable, inject} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable, of} from 'rxjs';
import {tap} from 'rxjs/operators';

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

  getTreeForLibrary(libraryId: number): Observable<DirectoryRootNode[]> {
    const cached = this.libraryCache.get(libraryId);
    if (cached) return of(cached);
    return this.http.get<DirectoryRootNode[]>(`/api/v1/libraries/${libraryId}/directory-tree`).pipe(
      tap(data => this.libraryCache.set(libraryId, data))
    );
  }

  getAllLibrariesTree(): Observable<DirectoryRootNode[]> {
    if (this.allCache) return of(this.allCache);
    return this.http.get<DirectoryRootNode[]>('/api/v1/libraries/directory-tree').pipe(
      tap(data => { this.allCache = data; })
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
}
