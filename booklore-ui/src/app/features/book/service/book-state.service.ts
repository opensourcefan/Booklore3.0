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

  getBookById(bookId: number): Book | undefined {
    const normalizedId = +bookId;
    return this.getCurrentBookState().books?.find(book => +book.id === normalizedId)
      ?? this.getCachedPagedBookById(normalizedId);
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

  getBooksByIds(bookIds: number[]): Book[] {
    if (bookIds.length === 0) {
      return [];
    }

    const booksById = new Map<number, Book>();

    for (const book of this.getCurrentBookState().books ?? []) {
      booksById.set(+book.id, book);
    }

    for (const book of this.getCachedPagedBooksByIds(bookIds)) {
      if (!booksById.has(+book.id)) {
        booksById.set(+book.id, book);
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

  setPagedCache(
    cache: Record<string, PagedBookBrowserCacheEntry>,
    totalCount: number | null = this.deriveTotalCount(cache)
  ): void {
    this.updateBookState({
      pagedCache: cache,
      totalCount,
    });
  }

  patchPagedCacheBook(updatedBook: Book): boolean {
    let didChange = false;
    const nextCache = Object.fromEntries(
      Object.entries(this.getCurrentBookState().pagedCache ?? {}).map(([cacheKey, entry]) => {
        if (!entry.page?.content?.some(book => book.id === updatedBook.id)) {
          return [cacheKey, entry];
        }

        didChange = true;

        return [cacheKey, {
          ...entry,
          page: entry.page
            ? {
                ...entry.page,
                content: entry.page.content.map(book => book.id === updatedBook.id ? updatedBook : book),
              }
            : null,
        } satisfies PagedBookBrowserCacheEntry];
      })
    );

    if (!didChange) {
      return false;
    }

    this.setPagedCache(nextCache);
    return true;
  }

  invalidatePagedCacheByEntity(entity: PagedBookBrowserEntity, entityId: number | null = null): void {
    const nextCache = Object.fromEntries(
      Object.entries(this.getCurrentBookState().pagedCache ?? {})
        .filter(([, entry]) => !(entry.key.entity === entity && (entityId == null || entry.key.entityId === entityId)))
    );

    this.setPagedCache(nextCache);
  }

  invalidatePagedCacheByBookIds(bookIds: number[]): void {
    if (bookIds.length === 0) {
      return;
    }

    const idSet = new Set(bookIds.map(id => +id));
    const nextCache = Object.fromEntries(
      Object.entries(this.getCurrentBookState().pagedCache ?? {})
        .filter(([, entry]) => !(entry.page?.content ?? []).some(book => idSet.has(book.id)))
    );

    this.setPagedCache(nextCache);
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

