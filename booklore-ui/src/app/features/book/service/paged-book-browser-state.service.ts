import {Injectable, inject} from '@angular/core';
import {BehaviorSubject, forkJoin, map, Observable, of} from 'rxjs';
import {AppPageResponse, BookService, PagedBooksParams} from './book.service';
import {Book} from '../model/book.model';
import {BookStateService} from './book-state.service';
import {
  BookBrowserViewMode,
  DEFAULT_BOOK_BROWSER_ROLLOUT_GUARDRAILS,
  DEFAULT_PAGED_BOOK_BROWSER_STATE,
  PagedBookBrowserCacheEntry,
  PagedBookBrowserEntity,
  PagedBookBrowserPage,
  PagedBookBrowserRequestKey,
  PagedBookBrowserState,
} from '../model/state/paged-book-browser-state.model';

@Injectable({
  providedIn: 'root',
})
export class PagedBookBrowserStateService {
  private readonly bookService = inject(BookService);
  private readonly bookStateService = inject(BookStateService);

  private readonly pagedBookBrowserStateSubject = new BehaviorSubject<PagedBookBrowserState>({
    guardrails: DEFAULT_BOOK_BROWSER_ROLLOUT_GUARDRAILS,
    cache: {},
  });

  readonly pagedBookBrowserState$ = this.pagedBookBrowserStateSubject.asObservable();

  getCurrentState(): PagedBookBrowserState {
    return this.pagedBookBrowserStateSubject.value;
  }

  getCurrentGuardrails() {
    return this.getCurrentState().guardrails;
  }

  setGuardrails(guardrails: PagedBookBrowserState['guardrails']): void {
    this.updateState({
      ...this.getCurrentState(),
      guardrails,
    });
  }

  resetToLegacyMode(): void {
    this.updateState({
      ...this.getCurrentState(),
      guardrails: DEFAULT_BOOK_BROWSER_ROLLOUT_GUARDRAILS,
    });
  }

  clearCache(): void {
    this.updateState({
      ...this.getCurrentState(),
      cache: {},
    });
  }

  buildRequestKey(
    entity: PagedBookBrowserEntity,
    entityId: number | null,
    viewMode: BookBrowserViewMode,
    params: PagedBooksParams,
    filters: Record<string, string[]> = {}
  ): PagedBookBrowserRequestKey {
    return {
      entity,
      entityId,
      viewMode,
      page: params.page ?? 0,
      size: params.size ?? 50,
      sorts: [...(params.sorts ?? [])],
      filterMode: params.filterMode ?? 'and',
      search: params.search ?? null,
      filters: this.sortFilters(filters),
    };
  }

  toCacheKey(key: PagedBookBrowserRequestKey): string {
    return JSON.stringify({
      ...key,
      filters: this.sortFilters(key.filters),
      sorts: [...key.sorts],
    });
  }

  markLoading(key: PagedBookBrowserRequestKey): void {
    this.upsertEntry({
      key,
      status: 'loading',
      page: this.getCachedEntry(key)?.page ?? null,
      error: null,
      loadedAt: this.getCachedEntry(key)?.loadedAt ?? null,
      fallbackReason: null,
    });
  }

  storePage(
    key: PagedBookBrowserRequestKey,
    response: AppPageResponse<Book>,
    fallbackReason: string | null = null
  ): void {
    this.upsertEntry({
      key,
      status: 'loaded',
      page: this.mapPageResponse(response),
      error: null,
      loadedAt: Date.now(),
      fallbackReason,
    });
  }

  markError(key: PagedBookBrowserRequestKey, error: unknown, fallbackReason: string | null = null): void {
    const message = error instanceof Error ? error.message : String(error);
    this.upsertEntry({
      key,
      status: 'error',
      page: this.getCachedEntry(key)?.page ?? null,
      error: message,
      loadedAt: this.getCachedEntry(key)?.loadedAt ?? null,
      fallbackReason,
    });
  }

  getCachedEntry(key: PagedBookBrowserRequestKey): PagedBookBrowserCacheEntry | undefined {
    return this.getCurrentState().cache[this.toCacheKey(key)];
  }

  getCachedPage(key: PagedBookBrowserRequestKey): PagedBookBrowserPage | null {
    return this.getCachedEntry(key)?.page ?? null;
  }

  getCachedBookById(bookId: number): Book | undefined {
    for (const entry of Object.values(this.getCurrentState().cache)) {
      const book = entry.page?.content?.find(b => b.id === bookId);
      if (book) {
        return book;
      }
    }
    return undefined;
  }

  getCachedBooksByIds(bookIds: number[]): Book[] {
    const booksById = new Map<number, Book>();

    for (const entry of Object.values(this.getCurrentState().cache)) {
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

  patchBook(updatedBook: Book): void {
    let didChange = false;
    const nextCache = Object.fromEntries(
      Object.entries(this.getCurrentState().cache).map(([cacheKey, entry]) => {
        if (!entry.page?.content?.some(book => book.id === updatedBook.id)) {
          return [cacheKey, entry];
        }

        didChange = true;

        return [
          cacheKey,
          {
            ...entry,
            page: entry.page
              ? {
                  ...entry.page,
                  content: entry.page.content.map(book => (book.id === updatedBook.id ? updatedBook : book)),
                }
              : null,
          } satisfies PagedBookBrowserCacheEntry,
        ];
      })
    );

    if (didChange) {
      this.updateState({
        ...this.getCurrentState(),
        cache: nextCache,
      });
    }
  }

  resolveBookById(bookId: number, withDescription = false): Observable<Book | undefined> {
    const cached = this.getCachedBookById(bookId);
    if (cached) {
      return of(cached);
    }

    const stateBook = this.bookService.getBookByIdFromState(bookId);
    if (stateBook) {
      return of(stateBook);
    }

    return this.bookService.getBookByIdFromAPI(bookId, withDescription).pipe(
      map(book => book ?? undefined)
    );
  }

  resolveBooksByIds(bookIds: number[], withDescription = false): Observable<Book[]> {
    if (bookIds.length === 0) {
      return of([]);
    }

    const orderedIds = [...new Set(bookIds.map(id => +id))];
    const resolved = new Map<number, Book>();

    for (const book of this.getCachedBooksByIds(orderedIds)) {
      resolved.set(book.id, book);
    }

    for (const book of this.bookService.getBooksByIdsFromState(orderedIds)) {
      if (!resolved.has(book.id)) {
        resolved.set(book.id, book);
      }
    }

    const missingIds = orderedIds.filter(id => !resolved.has(id));
    if (missingIds.length === 0) {
      return of(orderedIds.map(id => resolved.get(id)!).filter(Boolean));
    }

    return forkJoin(missingIds.map(id => this.bookService.getBookByIdFromAPI(id, withDescription))).pipe(
      map(fetchedBooks => {
        for (const book of fetchedBooks) {
          resolved.set(book.id, book);
        }

        return orderedIds.map(id => resolved.get(id)).filter((book): book is Book => !!book);
      })
    );
  }

  invalidateEntity(entity: PagedBookBrowserEntity, entityId: number | null = null): void {
    const nextCache = Object.fromEntries(
      Object.entries(this.getCurrentState().cache).filter(
        ([, entry]) => !(entry.key.entity === entity && (entityId == null || entry.key.entityId === entityId))
      )
    );

    if (Object.keys(nextCache).length < Object.keys(this.getCurrentState().cache).length) {
      this.updateState({
        ...this.getCurrentState(),
        cache: nextCache,
      });
    }
  }

  invalidateBooks(bookIds: number[]): void {
    if (bookIds.length === 0) {
      return;
    }

    const idSet = new Set(bookIds.map(id => +id));
    const nextCache = Object.fromEntries(
      Object.entries(this.getCurrentState().cache).filter(
        ([, entry]) => !(entry.page?.content ?? []).some(book => idSet.has(book.id))
      )
    );

    if (Object.keys(nextCache).length < Object.keys(this.getCurrentState().cache).length) {
      this.updateState({
        ...this.getCurrentState(),
        cache: nextCache,
      });
    }
  }

  reset(): void {
    this.updateState({
      guardrails: DEFAULT_PAGED_BOOK_BROWSER_STATE.guardrails,
      cache: {},
    });
  }

  private upsertEntry(entry: PagedBookBrowserCacheEntry): void {
    const cacheKey = this.toCacheKey(entry.key);
    this.updateState({
      ...this.getCurrentState(),
      cache: {
        ...this.getCurrentState().cache,
        [cacheKey]: entry,
      },
    });
  }

  private mapPageResponse(response: AppPageResponse<Book>): PagedBookBrowserPage {
    return {
      content: response.content,
      page: response.page,
      size: response.size,
      totalElements: response.totalElements,
      totalPages: response.totalPages,
      hasNext: response.hasNext,
      hasPrevious: response.hasPrevious,
    };
  }

  private sortFilters(filters: Record<string, string[]>): Record<string, string[]> {
    return Object.fromEntries(
      Object.entries(filters)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, values]) => [key, [...values]])
    );
  }

  private updateState(state: PagedBookBrowserState): void {
    this.pagedBookBrowserStateSubject.next(state);
  }
}