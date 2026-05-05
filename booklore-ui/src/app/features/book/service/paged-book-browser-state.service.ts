import {Injectable, inject} from '@angular/core';
import {BehaviorSubject, forkJoin, map, Observable, of} from 'rxjs';
import {AppPageResponse, BookService, PagedBooksParams} from './book.service';
import {Book} from '../model/book.model';
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
    return Object.values(this.getCurrentState().cache)
      .flatMap(entry => entry.page?.content ?? [])
      .find(book => book.id === bookId);
  }

  getCachedBooksByIds(bookIds: number[]): Book[] {
    const seen = new Set<number>();
    const booksById = new Map<number, Book>();

    for (const entry of Object.values(this.getCurrentState().cache)) {
      for (const book of entry.page?.content ?? []) {
        if (!booksById.has(book.id)) {
          booksById.set(book.id, book);
        }
      }
    }

    const orderedBooks: Book[] = [];
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
    const filteredEntries = Object.entries(this.getCurrentState().cache)
      .filter(([, entry]) => !(entry.key.entity === entity && (entityId == null || entry.key.entityId === entityId)));

    this.updateState({
      ...this.getCurrentState(),
      cache: Object.fromEntries(filteredEntries),
    });
  }

  invalidateBooks(bookIds: number[]): void {
    if (bookIds.length === 0) {
      return;
    }

    const idSet = new Set(bookIds.map(id => +id));
    const filteredEntries = Object.entries(this.getCurrentState().cache)
      .filter(([, entry]) => !(entry.page?.content ?? []).some(book => idSet.has(book.id)));

    this.updateState({
      ...this.getCurrentState(),
      cache: Object.fromEntries(filteredEntries),
    });
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