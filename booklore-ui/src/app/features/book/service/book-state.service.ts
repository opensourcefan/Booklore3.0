import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';
import {Book} from '../model/book.model';
import {BookState} from '../model/state/book-state.model';
import {PagedBookBrowserCacheEntry, PagedBookBrowserEntity} from '../model/state/paged-book-browser-state.model';

function createDefaultBookState(): BookState {
  return {
    books: null,
    loaded: false,
    error: null,
    totalCount: null,
    pagedCache: {},
  };
}

@Injectable({
  providedIn: 'root',
})
export class BookStateService {
  private bookStateSubject = new BehaviorSubject<BookState>(createDefaultBookState());

  public readonly bookState$ = this.bookStateSubject.asObservable();

  getCurrentBookState(): BookState {
    return this.bookStateSubject.value;
  }

  updateBookState(state: Partial<BookState>): void {
    const currentState = this.getCurrentBookState();
    const hasBooks = Object.prototype.hasOwnProperty.call(state, 'books');
    const hasLoaded = Object.prototype.hasOwnProperty.call(state, 'loaded');
    const hasError = Object.prototype.hasOwnProperty.call(state, 'error');
    const hasTotalCount = Object.prototype.hasOwnProperty.call(state, 'totalCount');
    const hasPagedCache = Object.prototype.hasOwnProperty.call(state, 'pagedCache');

    const nextBooks = hasBooks ? state.books ?? null : currentState.books;
    let nextPagedCache = hasPagedCache ? {...(state.pagedCache ?? {})} : {...(currentState.pagedCache ?? {})};
    let nextTotalCount = hasTotalCount ? state.totalCount ?? null : currentState.totalCount ?? null;

    if (hasBooks && nextBooks !== currentState.books && (!hasPagedCache || state.pagedCache === currentState.pagedCache)) {
      nextPagedCache = {};
      if (Array.isArray(nextBooks)) {
        nextTotalCount = nextBooks.length;
      }
    }

    this.bookStateSubject.next({
      books: nextBooks,
      loaded: hasLoaded ? state.loaded ?? false : currentState.loaded,
      error: hasError ? state.error ?? null : currentState.error,
      totalCount: nextTotalCount,
      pagedCache: nextPagedCache,
    });
  }

  resetBookState(): void {
    this.bookStateSubject.next({
      ...createDefaultBookState(),
      loaded: true,
    });
  }

  getCachedPagedBookById(bookId: number): Book | undefined {
    return Object.values(this.getCurrentBookState().pagedCache ?? {})
      .flatMap(entry => entry.page?.content ?? [])
      .find(book => book.id === bookId);
  }

  getCachedPagedBooksByIds(bookIds: number[]): Book[] {
    const booksById = new Map<number, Book>();

    for (const entry of Object.values(this.getCurrentBookState().pagedCache ?? {})) {
      for (const book of entry.page?.content ?? []) {
        if (!booksById.has(book.id)) {
          booksById.set(book.id, book);
        }
      }
    }

    const orderedBooks: Book[] = [];
    const seen = new Set<number>();

    for (const rawId of bookIds) {
      const id = +rawId;
      if (seen.has(id)) {
        continue;
      }

      const book = booksById.get(id);
      if (book) {
        orderedBooks.push(book);
        seen.add(id);
      }
    }

    return orderedBooks;
  }

  setPagedCache(cache: Record<string, PagedBookBrowserCacheEntry>, totalCount: number | null): void {
    this.updateBookState({
      pagedCache: cache,
      totalCount,
    });
  }

  invalidatePagedCacheByEntity(entity: PagedBookBrowserEntity, entityId: number | null = null): void {
    const filteredEntries = Object.entries(this.getCurrentBookState().pagedCache ?? {})
      .filter(([, entry]) => !(entry.key.entity === entity && (entityId == null || entry.key.entityId === entityId)));

    this.setPagedCache(Object.fromEntries(filteredEntries), this.deriveTotalCount(Object.fromEntries(filteredEntries)));
  }

  invalidatePagedCacheByBookIds(bookIds: number[]): void {
    if (bookIds.length === 0) {
      return;
    }

    const idSet = new Set(bookIds.map(id => +id));
    const filteredEntries = Object.entries(this.getCurrentBookState().pagedCache ?? {})
      .filter(([, entry]) => !(entry.page?.content ?? []).some(book => idSet.has(book.id)));

    this.setPagedCache(Object.fromEntries(filteredEntries), this.deriveTotalCount(Object.fromEntries(filteredEntries)));
  }

  private deriveTotalCount(cache: Record<string, PagedBookBrowserCacheEntry>): number | null {
    const totalCounts = Object.values(cache)
      .map(entry => entry.page?.totalElements ?? null)
      .filter((value): value is number => value !== null);

    if (totalCounts.length === 0) {
      return null;
    }

    return Math.max(...totalCounts);
  }
}

