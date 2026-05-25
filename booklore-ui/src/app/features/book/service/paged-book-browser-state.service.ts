import {Injectable, inject, Injector} from '@angular/core';
import {BehaviorSubject, forkJoin, map, Observable, of} from 'rxjs';
import {AppPageResponse, BookService, PagedBooksParams} from './book.service';
import {Book} from '../model/book.model';
import {BookStateService} from './book-state.service';
import {PagedGridPilotService} from './paged-grid-pilot.service';
import {
  BookBrowserViewMode,
  DEFAULT_BOOK_BROWSER_ROLLOUT_GUARDRAILS,
  LEGACY_FALLBACK_GUARDRAILS,
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
  private readonly injector = inject(Injector);

  private readonly pagedBookBrowserStateSubject = new BehaviorSubject<PagedBookBrowserState>({
    guardrails: DEFAULT_BOOK_BROWSER_ROLLOUT_GUARDRAILS,
    cache: {},
  });

  constructor() {
    this.bookStateService.bookState$.subscribe(state => {
      if (state.loaded) {
        this.syncCacheFromBookState();
        const pagedGridPilotService = this.injector.get(PagedGridPilotService);
        pagedGridPilotService.refreshActiveState();
      }
    });
  }

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
      guardrails: LEGACY_FALLBACK_GUARDRAILS,
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
    return this.bookStateService.getCachedPagedBookById(bookId);
  }

  getCachedBooksByIds(bookIds: number[]): Book[] {
    return this.bookStateService.getCachedPagedBooksByIds(bookIds);
  }

  patchBook(updatedBook: Book): void {
    if (!this.bookStateService.patchPagedCacheBook(updatedBook)) {
      return;
    }

    this.syncCacheFromBookState();
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
    this.bookStateService.invalidatePagedCacheByEntity(entity, entityId);
    this.syncCacheFromBookState();
  }

  invalidateBooks(bookIds: number[]): void {
    if (bookIds.length === 0) {
      return;
    }

    this.bookStateService.invalidatePagedCacheByBookIds(bookIds);
    this.syncCacheFromBookState();
  }

  reset(): void {
    this.updateState({
      guardrails: LEGACY_FALLBACK_GUARDRAILS,
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
    this.bookStateService.setPagedCache(state.cache);
  }

  private syncCacheFromBookState(): void {
    this.pagedBookBrowserStateSubject.next({
      ...this.getCurrentState(),
      cache: {...(this.bookStateService.getCurrentBookState().pagedCache ?? {})},
    });
  }
}