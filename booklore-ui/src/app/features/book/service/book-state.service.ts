import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';
import {Book, BookMetadata} from '../model/book.model';
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

  upsertBookAndInvalidatePagedCaches(book: Book): void {
    const currentState = this.getCurrentBookState();
    const currentBooks = currentState.books ?? [];
    const existingIndex = currentBooks.findIndex(existingBook => existingBook.id === book.id);
    const nextBooks = [...currentBooks];

    if (existingIndex > -1) {
      nextBooks[existingIndex] = book;
    } else {
      nextBooks.push(book);
    }

    const nextPagedCache = this.invalidatePagedCacheEntries(entry => (
      entry.key.entity === 'ALL_BOOKS'
      || (entry.key.entity === 'LIBRARY' && entry.key.entityId === book.libraryId)
    ));

    this.commitState(nextBooks, nextPagedCache, nextBooks.length);
  }

  removeBooksAndInvalidatePagedCaches(bookIds: number[]): void {
    if (bookIds.length === 0) {
      return;
    }

    const currentState = this.getCurrentBookState();
    const idSet = new Set(bookIds.map(id => +id));
    const impactedLibraryIds = this.collectLibraryIdsForBookIds(idSet);
    const nextBooks = (currentState.books ?? []).filter(book => !idSet.has(book.id));
    const nextPagedCache = this.invalidatePagedCacheEntries(entry => (
      entry.key.entity === 'ALL_BOOKS'
        || (entry.key.entity === 'LIBRARY' && entry.key.entityId != null && impactedLibraryIds.has(entry.key.entityId))      ));
    this.commitState(nextBooks, nextPagedCache, nextBooks.length);
  }

  replaceBookAcrossState(updatedBook: Book): void {
    const currentState = this.getCurrentBookState();
    let didChange = false;

    const nextBooks = currentState.books?.map(book => {
      if (book.id !== updatedBook.id) {
        return book;
      }

      didChange = true;
      return updatedBook;
    }) ?? null;

    const nextPagedCache = this.mapPagedCacheBooks(book => {
      if (book.id !== updatedBook.id) {
        return book;
      }

      didChange = true;
      return updatedBook;
    });

    if (!didChange) {
      return;
    }

    this.commitState(nextBooks, nextPagedCache);
  }

  replaceBookMetadataAcrossState(bookId: number, updatedMetadata: BookMetadata): void {
    let didChange = false;

    const nextBooks = this.getCurrentBookState().books?.map(book => {
      if (book.id !== bookId) {
        return book;
      }

      didChange = true;
      return {...book, metadata: updatedMetadata};
    }) ?? null;

    const nextPagedCache = this.mapPagedCacheBooks(book => {
      if (book.id !== bookId) {
        return book;
      }

      didChange = true;
      return {...book, metadata: updatedMetadata};
    });

    if (!didChange) {
      return;
    }

    this.commitState(nextBooks, nextPagedCache);
  }

  patchBookCoverUpdatesAcrossState(patches: { id: number; coverUpdatedOn: string }[]): void {
    if (patches.length === 0) {
      return;
    }

    const patchMap = new Map(patches.map(patch => [patch.id, patch.coverUpdatedOn]));
    let didChange = false;

    const nextBooks = this.getCurrentBookState().books?.map(book => {
      const coverUpdatedOn = patchMap.get(book.id);
      if (!coverUpdatedOn || !book.metadata) {
        return book;
      }

      didChange = true;
      return {
        ...book,
        metadata: {
          ...book.metadata,
          coverUpdatedOn,
        },
      };
    }) ?? null;

    const nextPagedCache = this.mapPagedCacheBooks(book => {
      const coverUpdatedOn = patchMap.get(book.id);
      if (!coverUpdatedOn || !book.metadata) {
        return book;
      }

      didChange = true;
      return {
        ...book,
        metadata: {
          ...book.metadata,
          coverUpdatedOn,
        },
      };
    });

    if (!didChange) {
      return;
    }

    this.commitState(nextBooks, nextPagedCache);
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

  private commitState(
    books: Book[] | null,
    pagedCache: Record<string, PagedBookBrowserCacheEntry>,
    totalCount: number | null = this.deriveTotalCount(pagedCache) ?? (Array.isArray(books) ? books.length : this.getCurrentBookState().totalCount ?? null)
  ): void {
    const currentState = this.getCurrentBookState();

    this.bookStateSubject.next({
      books,
      loaded: currentState.loaded,
      error: currentState.error,
      totalCount,
      pagedCache,
    });
  }

  private invalidatePagedCacheEntries(
    shouldInvalidate: (entry: PagedBookBrowserCacheEntry) => boolean
  ): Record<string, PagedBookBrowserCacheEntry> {
    return Object.fromEntries(
      Object.entries(this.getCurrentBookState().pagedCache ?? {})
        .filter(([, entry]) => !shouldInvalidate(entry))
    );
  }

  private mapPagedCacheBooks(
    mapper: (book: Book) => Book
  ): Record<string, PagedBookBrowserCacheEntry> {
    return Object.fromEntries(
      Object.entries(this.getCurrentBookState().pagedCache ?? {}).map(([cacheKey, entry]) => {
        if (!entry.page) {
          return [cacheKey, entry];
        }

        return [cacheKey, {
          ...entry,
          page: {
            ...entry.page,
            content: entry.page.content.map(mapper),
          },
        } satisfies PagedBookBrowserCacheEntry];
      })
    );
  }

  private collectLibraryIdsForBookIds(bookIds: Set<number>): Set<number> {
    const libraryIds = new Set<number>();

    for (const book of this.getCurrentBookState().books ?? []) {
      if (bookIds.has(book.id)) {
        libraryIds.add(book.libraryId);
      }
    }

    for (const entry of Object.values(this.getCurrentBookState().pagedCache ?? {})) {
      for (const book of entry.page?.content ?? []) {
        if (bookIds.has(book.id)) {
          libraryIds.add(book.libraryId);
        }
      }
    }

    return libraryIds;
  }
}

