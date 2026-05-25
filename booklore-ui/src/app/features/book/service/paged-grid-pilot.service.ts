import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { Book } from '../model/book.model';
import { BookState } from '../model/state/book-state.model';
import { SortDirection, SortOption } from '../model/sort.model';
import { PagedBookBrowserEntity, PagedBookBrowserPage, PagedBookBrowserRequestKey } from '../model/state/paged-book-browser-state.model';
import { BookService, PagedBooksParams } from './book.service';
import { BookStateService } from './book-state.service';
import { PagedBookBrowserStateService } from './paged-book-browser-state.service';
import { ServerFilterAdapter } from './server-filter-adapter.service';

const ENABLED_PAGED_ENTITIES: ReadonlySet<PagedBookBrowserEntity> = new Set([
  'ALL_BOOKS',
  'LIBRARY',
  'SHELF',
  'NOT_SHELFED',
]);

export interface PagedGridPilotContext {
  entity: PagedBookBrowserEntity;
  entityId?: number | null;
  viewMode: string | undefined;
  sortCriteria: SortOption[];
  filters: Record<string, string[]>;
  filterMode: string;
  isDirectoryScopedView: boolean;
  isSeriesCollapsed: boolean;
  searchTerm: string;
}

export interface PagedGridPilotStatus {
  mode: 'inactive' | 'paged' | 'legacy';
  summary: string;
  detail: string | null;
  blockers: string[];
}

type PilotViewMode = 'grid' | 'table';

interface ActivePagedQuery {
  signature: string;
  params: PagedBooksParams;
  requestKey: PagedBookBrowserRequestKey;
  legacyFactory: () => Observable<BookState>;
  nextPage: number | null;
}

@Injectable({
  providedIn: 'root',
})
export class PagedGridPilotService {
  private static readonly PAGE_SIZE = 80;
  private static readonly LOAD_MORE_THRESHOLD_PX = 600;
  private static readonly LOAD_MORE_THRESHOLD_VIEWPORTS = 3;
  private static readonly PREFETCHED_PAGE_COUNT = 2;

  private readonly bookService = inject(BookService);
  private readonly bookStateService = inject(BookStateService);
  private readonly pagedBookBrowserStateService = inject(PagedBookBrowserStateService);
  private readonly serverFilterAdapter = inject(ServerFilterAdapter);

  private readonly bookStateSubject = new BehaviorSubject<BookState>({
    books: null,
    loaded: false,
    error: null,
  });
  private readonly statusSubject = new BehaviorSubject<PagedGridPilotStatus>({
    mode: 'inactive',
    summary: '',
    detail: null,
    blockers: [],
  });

  readonly bookState$ = this.bookStateSubject.asObservable();
  readonly status$ = this.statusSubject.asObservable();

  private activeQuery: ActivePagedQuery | null = null;
  private pagedActive = false;
  private requestSubscription: Subscription | null = null;
  private legacySubscription: Subscription | null = null;
  private deferInitialEmit = false;

  connect(context: PagedGridPilotContext, legacyFactory: () => Observable<BookState>): Observable<BookState> {
    const blockers = this.getEligibilityBlockers(context);
    const viewMode = this.normalizeViewMode(context.viewMode);

    if (blockers.length > 0) {
      this.setLegacyStatus(blockers);
      this.subscribeToLegacy(legacyFactory);
      return this.bookState$;
    }

    const params = this.serverFilterAdapter.mergeParams(
      {
        page: 0,
        size: PagedGridPilotService.PAGE_SIZE,
      },
      this.serverFilterAdapter.buildSortParams(context.sortCriteria),
      this.serverFilterAdapter.buildFilterParams(context.filters, context.filterMode),
    );

    const searchTerm = this.getPagedSearchTerm(context.searchTerm);
    if (searchTerm) {
      params.search = searchTerm;
    }

    if (context.entity === 'LIBRARY' && context.entityId != null) {
      params.libraryId = context.entityId;
    }

    if (context.entity === 'SHELF' && context.entityId != null) {
      params.shelfId = context.entityId;
    }

    if (context.entity === 'NOT_SHELFED') {
      params.unshelved = true;
    }

    const requestKey = this.pagedBookBrowserStateService.buildRequestKey(
      context.entity,
      context.entityId ?? null,
      viewMode!,
      params,
      context.filters,
    );
    const signature = this.buildSignature(requestKey);

    if (this.activeQuery?.signature === signature && this.pagedActive) {
      this.setPagedStatus(viewMode!);
      if (this.getCachedPages(this.activeQuery.requestKey).length > 0) {
        this.emitCachedState(this.activeQuery);
        this.ensurePrefetchedRunway(this.activeQuery);
      } else {
        this.fetchPage(this.activeQuery, 0);
      }
      return this.bookState$;
    }

    this.clearActiveSubscriptions();
    this.pagedActive = true;
    this.setPagedStatus(viewMode!);
    this.pagedBookBrowserStateService.setGuardrails({
      activeMode: 'paged-browse',
      fallbackMode: 'legacy-full-state',
      allowPagedGridView: true,
      allowPagedTableView: true,
      enabledEntities: ['ALL_BOOKS', 'LIBRARY', 'SHELF', 'NOT_SHELFED'],
    });

    this.activeQuery = {
      signature,
      params,
      requestKey,
      legacyFactory,
      nextPage: 0,
    };

    this.bookStateSubject.next({
      books: null,
      loaded: false,
      error: null,
    });

    const cachedPages = this.getCachedPages(this.activeQuery.requestKey);
    if (cachedPages.length === 0) {
      this.deferInitialEmit = true;
      this.fetchPage(this.activeQuery, 0);
      return this.bookState$;
    }

    this.emitCachedState(this.activeQuery);
    this.ensurePrefetchedRunway(this.activeQuery);

    return this.bookState$;
  }

  isPagedActive(): boolean {
    return this.pagedActive;
  }

  getStatus(): PagedGridPilotStatus {
    return this.statusSubject.getValue();
  }

  refreshActiveState(): void {
    if (!this.pagedActive || !this.activeQuery) {
      return;
    }

    const cachedPages = this.getCachedPages(this.activeQuery.requestKey);
    if (cachedPages.length === 0) {
      this.fetchPage(this.activeQuery, 0);
      return;
    }

    this.emitCachedState(this.activeQuery);
  }

  invalidateAllBooksCache(): void {
    this.pagedBookBrowserStateService.invalidateEntity('ALL_BOOKS');
    this.pagedBookBrowserStateService.invalidateEntity('NOT_SHELFED');

    if (this.activeQuery) {
      this.pagedBookBrowserStateService.invalidateEntity(
        this.activeQuery.requestKey.entity,
        this.activeQuery.requestKey.entityId,
      );
    }

    if (!this.pagedActive || !this.activeQuery) {
      return;
    }

    this.requestSubscription?.unsubscribe();
    this.requestSubscription = null;

    this.fetchPage(this.activeQuery, 0);
  }

  /**
   * Append a newly imported book to the active paged grid without
   * resetting state to null — avoids screen flash during bulk import.
   * Only applies when the default sort is active (addedOn,desc) and
   * no search/filters are applied (new books always match unshelved).
   */
  appendNewBook(book: Book): void {
    if (!this.pagedActive || !this.activeQuery) {
      return;
    }

    const currentState = this.bookStateSubject.getValue();
    const currentBooks = currentState.books ?? [];
    if (currentState.error || currentBooks.some(b => b.id === book.id)) {
      return;
    }

    const nextBooks = [book, ...currentBooks];
    this.bookStateSubject.next({
      books: nextBooks,
      loaded: true,
      error: null,
    });
  }

  loadNextPageIfNeeded(scrollTop: number, clientHeight: number, scrollHeight: number): void {
    if (!this.pagedActive || !this.activeQuery || this.activeQuery.nextPage === null) {
      return;
    }

    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    const loadMoreThreshold = Math.max(
      PagedGridPilotService.LOAD_MORE_THRESHOLD_PX,
      clientHeight * PagedGridPilotService.LOAD_MORE_THRESHOLD_VIEWPORTS,
    );

    if (distanceFromBottom > loadMoreThreshold) {
      return;
    }

    this.fetchPage(this.activeQuery, this.activeQuery.nextPage);
  }

  resetActiveQuery(): void {
    this.clearActiveSubscriptions();
    this.activeQuery = null;
    this.pagedActive = false;
    this.pagedBookBrowserStateService.resetToLegacyMode();
    this.statusSubject.next({
      mode: 'inactive',
      summary: '',
      detail: null,
      blockers: [],
    });
  }

  setExplicitLegacyStatus(detail: string, blockers: string[] = []): void {
    this.clearActiveSubscriptions();
    this.activeQuery = null;
    this.pagedActive = false;
    this.pagedBookBrowserStateService.resetToLegacyMode();
    this.setLegacyStatus(blockers, detail);
  }

  private canUsePagedPilot(context: PagedGridPilotContext): boolean {
    return ENABLED_PAGED_ENTITIES.has(context.entity)
      && !!this.normalizeViewMode(context.viewMode)
      && !context.isDirectoryScopedView
      && !context.isSeriesCollapsed
      && this.serverFilterAdapter.supportsSortCriteria(context.sortCriteria)
      && this.serverFilterAdapter.supportsFilters(context.filters);
  }

  private getEligibilityBlockers(context: PagedGridPilotContext): string[] {
    const blockers: string[] = [];

    if (!ENABLED_PAGED_ENTITIES.has(context.entity)) {
      blockers.push(`entity ${context.entity} is not enabled for paged browse`);
    }

    if (!this.normalizeViewMode(context.viewMode)) {
      blockers.push(`view mode is ${context.viewMode ?? 'unset'}`);
    }

    if (context.isDirectoryScopedView) {
      blockers.push('directory scope is active');
    }

    if (context.isSeriesCollapsed) {
      blockers.push('series collapse is enabled');
    }

    const unsupportedSortFields = this.serverFilterAdapter.getUnsupportedSortFields(context.sortCriteria);
    if (unsupportedSortFields.length > 0) {
      blockers.push(`unsupported sort fields: ${unsupportedSortFields.join(', ')}`);
    }

    if (this.getPagedSearchTerm(context.searchTerm) === null && context.searchTerm.trim().length > 0) {
      blockers.push('search term is too short for server search');
    }

    const unsupportedFilterKeys = this.serverFilterAdapter.getUnsupportedFilterKeys(context.filters);
    if (unsupportedFilterKeys.length > 0) {
      blockers.push(`unsupported filters: ${unsupportedFilterKeys.join(', ')}`);
    }

    return blockers;
  }

  private describeSortCriteria(sortCriteria: SortOption[]): string {
    if (sortCriteria.length === 0) {
      return 'default';
    }

    if (sortCriteria.length === 1) {
      const [sort] = sortCriteria;
      const direction = sort.direction === SortDirection.DESCENDING ? 'desc' : 'asc';
      return `${sort.field} ${direction}`;
    }

    return `multi-sort (${sortCriteria.map(sort => `${sort.field} ${sort.direction === SortDirection.DESCENDING ? 'desc' : 'asc'}`).join(', ')})`;
  }

  private setPagedStatus(viewMode: PilotViewMode): void {
    const isTableView = viewMode === 'table';

    this.statusSubject.next({
      mode: 'paged',
      summary: isTableView ? 'Paged list active' : 'Paged grid active',
      detail: isTableView
        ? 'This route is using the server-paged list pilot.'
        : 'This route is using the server-paged grid pilot.',
      blockers: [],
    });
  }

  private normalizeViewMode(viewMode: string | undefined): PilotViewMode | null {
    if (viewMode === 'grid' || viewMode === 'table') {
      return viewMode;
    }

    return null;
  }

  private setLegacyStatus(blockers: string[], detail?: string): void {
    this.statusSubject.next({
      mode: 'legacy',
      summary: 'Legacy full-state mode',
      detail: detail ?? blockers.join(' | '),
      blockers,
    });
  }

  private fetchPage(query: ActivePagedQuery, page: number): void {
    if (this.requestSubscription || !this.activeQuery || this.activeQuery.signature !== query.signature) {
      return;
    }

    const params: PagedBooksParams = {
      ...query.params,
      page,
      size: PagedGridPilotService.PAGE_SIZE,
    };

    const requestKey = this.pagedBookBrowserStateService.buildRequestKey(
      query.requestKey.entity,
      query.requestKey.entityId,
      query.requestKey.viewMode,
      params,
      query.requestKey.filters,
    );

    const cachedPage = this.pagedBookBrowserStateService.getCachedPage(requestKey);
    if (cachedPage) {
      this.emitCachedState(query);
      this.ensurePrefetchedRunway(query);
      return;
    }

    this.pagedBookBrowserStateService.markLoading(requestKey);
    const requestSubscription = this.bookService.getBooksPaged(params).subscribe({
      next: response => {
        this.requestSubscription = null;

        if (!this.activeQuery || this.activeQuery.signature !== query.signature) {
          return;
        }

        const adaptedResponse = {
          ...response,
          content: response.content.map(s => this.bookService.adaptGridSummaryToBook(s)),
        };
        this.pagedBookBrowserStateService.storePage(requestKey, adaptedResponse);

        if (this.deferInitialEmit) {
          const cachedPages = this.getCachedPages(this.activeQuery.requestKey);
          if (cachedPages.length >= PagedGridPilotService.PREFETCHED_PAGE_COUNT || !response.hasNext) {
            this.deferInitialEmit = false;
            this.emitCachedState(this.activeQuery);
          }
          this.ensurePrefetchedRunway(this.activeQuery);
        } else {
          this.emitCachedState(this.activeQuery);
          this.ensurePrefetchedRunway(this.activeQuery);
        }
      },
      error: error => {
        this.requestSubscription = null;
        this.pagedBookBrowserStateService.markError(requestKey, error, 'stage-3-legacy-fallback');

        if (this.deferInitialEmit && this.activeQuery && this.activeQuery.signature === query.signature) {
          this.deferInitialEmit = false;
          this.emitCachedState(this.activeQuery);
        }

        this.setLegacyStatus(['paged request failed'], 'The paged request failed, so the browser fell back to the legacy full-state path.');

        if (!this.activeQuery || this.activeQuery.signature !== query.signature) {
          return;
        }

        this.subscribeToLegacy(query.legacyFactory);
      },
    });
    this.requestSubscription = requestSubscription.closed ? null : requestSubscription;
  }

  private ensurePrefetchedRunway(query: ActivePagedQuery): void {
    if (this.requestSubscription || !this.activeQuery || this.activeQuery.signature !== query.signature) {
      return;
    }

    const cachedPages = this.getCachedPages(query.requestKey);
    if (cachedPages.length === 0 || cachedPages.length >= PagedGridPilotService.PREFETCHED_PAGE_COUNT) {
      return;
    }

    const lastPage = cachedPages[cachedPages.length - 1];
    if (!lastPage.hasNext) {
      return;
    }

    this.fetchPage(query, lastPage.page + 1);
  }

  private emitCachedState(query: ActivePagedQuery): void {
    const cachedPages = this.getCachedPages(query.requestKey);

    if (cachedPages.length === 0) {
      this.activeQuery = {
        ...query,
        nextPage: 0,
      };
      this.bookStateSubject.next({
        books: null,
        loaded: false,
        error: null,
      });
      return;
    }

    const books = cachedPages.flatMap(page => page.content);
    const lastPage = cachedPages[cachedPages.length - 1];

    this.activeQuery = {
      ...query,
      nextPage: lastPage.hasNext ? lastPage.page + 1 : null,
    };

    const nextState: BookState = {
      books,
      loaded: true,
      error: null,
    };

    if (this.isEquivalentBookState(this.bookStateSubject.getValue(), nextState)) {
      return;
    }

    this.bookStateSubject.next(nextState);
  }

  private getCachedPages(baseRequestKey: PagedBookBrowserRequestKey): PagedBookBrowserPage[] {
    const matchingEntries = Object.values(this.bookStateService.getCurrentBookState().pagedCache ?? {})
      .filter(entry => this.isMatchingKey(entry.key, baseRequestKey) && entry.status === 'loaded' && entry.page)
      .sort((left, right) => left.key.page - right.key.page);

    const contiguousPages: PagedBookBrowserPage[] = [];
    let expectedPage = 0;

    for (const entry of matchingEntries) {
      if (!entry.page || entry.page.page !== expectedPage) {
        break;
      }

      contiguousPages.push(entry.page);
      expectedPage += 1;
    }

    return contiguousPages;
  }

  private isMatchingKey(left: PagedBookBrowserRequestKey, right: PagedBookBrowserRequestKey): boolean {
    return left.entity === right.entity
      && left.entityId === right.entityId
      && left.viewMode === right.viewMode
      && left.size === right.size
      && left.filterMode === right.filterMode
      && left.search === right.search
      && JSON.stringify(left.sorts) === JSON.stringify(right.sorts)
      && JSON.stringify(left.filters) === JSON.stringify(right.filters);
  }

  private buildSignature(requestKey: PagedBookBrowserRequestKey): string {
    return JSON.stringify({
      entity: requestKey.entity,
      entityId: requestKey.entityId,
      viewMode: requestKey.viewMode,
      size: requestKey.size,
      sorts: requestKey.sorts,
      filterMode: requestKey.filterMode,
      search: requestKey.search,
      filters: requestKey.filters,
    });
  }

  private isEquivalentBookState(currentState: BookState, nextState: BookState): boolean {
    if (currentState.loaded !== nextState.loaded || currentState.error !== nextState.error) {
      return false;
    }

    if (currentState.books === nextState.books) {
      return true;
    }

    if (!currentState.books || !nextState.books) {
      return false;
    }

    if (currentState.books.length !== nextState.books.length) {
      return false;
    }

    return currentState.books.every((book, i) => {
      const nextBook = nextState.books![i];
      return book.id === nextBook.id
        && book.metadata === nextBook.metadata;
    });
  }

  private getPagedSearchTerm(searchTerm: string): string | null {
    const trimmed = searchTerm.trim();
    if (trimmed.length === 0) {
      return null;
    }

    return this.normalizeSearchTerm(trimmed).length >= 2 ? trimmed : null;
  }

  private normalizeSearchTerm(term: string): string {
    return term
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ø/gi, 'o')
      .replace(/ł/gi, 'l')
      .replace(/æ/gi, 'ae')
      .replace(/œ/gi, 'oe')
      .replace(/ß/g, 'ss')
      .replace(/[!@$%^&*_=|~`<>?/";']/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private subscribeToLegacy(legacyFactory: () => Observable<BookState>): void {
    this.clearActiveSubscriptions();
    this.activeQuery = null;
    this.pagedActive = false;
    this.pagedBookBrowserStateService.resetToLegacyMode();
    this.legacySubscription = legacyFactory().subscribe(state => {
      this.bookStateSubject.next(state);
    });
  }

  private clearActiveSubscriptions(): void {
    this.requestSubscription?.unsubscribe();
    this.requestSubscription = null;
    this.legacySubscription?.unsubscribe();
    this.legacySubscription = null;
  }
}