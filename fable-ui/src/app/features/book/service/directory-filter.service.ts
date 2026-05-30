import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';

export interface DirectorySelection {
  libraryPathId: number;
  fileSubPath: string;
  scopeKey: string;
}

@Injectable({providedIn: 'root'})
export class DirectoryFilterService {
  private filterSubject = new BehaviorSubject<DirectorySelection | null>(null);
  readonly filter$ = this.filterSubject.asObservable();

  get currentFilter(): DirectorySelection | null {
    return this.filterSubject.value;
  }

  setFilter(selection: DirectorySelection): void {
    this.filterSubject.next(selection);
  }

  clear(): void {
    this.filterSubject.next(null);
  }

  clearScope(scopeKey: string | null): void {
    if (!scopeKey) {
      return;
    }

    const current = this.filterSubject.value;
    if (current?.scopeKey === scopeKey) {
      this.filterSubject.next(null);
    }
  }

  getScopeKeyFromUrl(url: string): string | null {
    const cleanUrl = url.split('?')[0].split('#')[0];

    if (/^\/all-books\/?$/.test(cleanUrl)) {
      return 'all-books';
    }

    const libraryMatch = cleanUrl.match(/^\/library\/(\d+)\/books\/?$/);
    if (libraryMatch) {
      return `library:${libraryMatch[1]}`;
    }

    const shelfMatch = cleanUrl.match(/^\/shelf\/(\d+)\/books\/?$/);
    if (shelfMatch) {
      return `shelf:${shelfMatch[1]}`;
    }

    return null;
  }

  getScopedFilter(scopeKey: string | null, filter: DirectorySelection | null = this.filterSubject.value): DirectorySelection | null {
    if (!scopeKey || !filter) {
      return null;
    }

    return filter.scopeKey === scopeKey ? filter : null;
  }
}
