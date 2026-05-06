import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, filter, Observable, Subscription, take } from 'rxjs';
import { BookState } from '../model/state/book-state.model';
import { SortDirection, SortOption } from '../model/sort.model';
import { PagedBookBrowserEntity, PagedBookBrowserPage, PagedBookBrowserRequestKey } from '../model/state/paged-book-browser-state.model';
import { BookService, PagedBooksParams } from './book.service';
import { PagedBookBrowserStateService } from './paged-book-browser-state.service';
import { ServerFilterAdapter } from './server-filter-adapter.service';

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
  private static readonly PREFETCHED_PAGE_COUNT = 4;

  private readonly bookService = inject(BookService);
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
  private warmStartSubscription: Subscription | null = null;

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

    if (context.entity === 'LIBRARY' && context.entityId != null) {
      params.libraryId = context.entityId;
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
        this.seedFromLegacyState(this.activeQuery);
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
      enabledEntities: ['ALL_BOOKS', 'LIBRARY'],
    });

    this.activeQuery = {
      signature,
      params,
      requestKey,
      legacyFactory,
      nextPage: 0,
    };

    const cachedPages = this.getCachedPages(this.activeQuery.requestKey);
    if (cachedPages.length === 0) {
      this.seedFromLegacyState(this.activeQuery);
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
      this.seedFromLegacyState(this.activeQuery);
      this.fetchPage(this.activeQuery, 0);
      return;
    }

    this.emitCachedState(this.activeQuery);
  }

  invalidateAllBooksCache(): void {
    this.pagedBookBrowserStateService.invalidateEntity('ALL_BOOKS');

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

    this.bookStateSubject.next({
      books: null,
      loaded: false,
      error: null,
    });

    this.fetchPage(this.activeQuery, 0);
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
    return (context.entity === 'ALL_BOOKS' || context.entity === 'LIBRARY')
      && context.viewMode === 'grid'
      && !context.isDirectoryScopedView
      && !context.isSeriesCollapsed
      && context.searchTerm.trim().length === 0
      && this.hasPagedSafeSort(context.sortCriteria)
      && this.serverFilterAdapter.supportsSortCriteria(context.sortCriteria)
      && this.serverFilterAdapter.supportsFilters(context.filters);
  }

  private hasPagedSafeSort(sortCriteria: SortOption[]): boolean {
    return sortCriteria.length === 0
      || (
        sortCriteria.length === 1
        && sortCriteria[0].field === 'addedOn'
        && sortCriteria[0].direction === SortDirection.DESCENDING
      );
  }

  private getEligibilityBlockers(context: PagedGridPilotContext): string[] {
    const blockers: string[] = [];

    if (!this.normalizeViewMode(context.viewMode)) {
      blockers.push(`view mode is ${context.viewMode ?? 'unset'}`);
    }

    if (context.isDirectoryScopedView) {
      blockers.push('directory scope is active');
    }

    if (context.isSeriesCollapsed) {
      blockers.push('series collapse is enabled');
    }

    if (context.searchTerm.trim().length > 0) {
      blockers.push('search is active');
    }

    if (!this.hasPagedSafeSort(context.sortCriteria)) {
      blockers.push(`sort is ${this.describeSortCriteria(context.sortCriteria)}`);
    } else {
      const unsupportedSortFields = this.serverFilterAdapter.getUnsupportedSortFields(context.sortCriteria);
      if (unsupportedSortFields.length > 0) {
        blockers.push(`unsupported sort fields: ${unsupportedSortFields.join(', ')}`);
      }
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

        this.pagedBookBrowserStateService.storePage(requestKey, response);
        this.emitCachedState(this.activeQuery);
        this.ensurePrefetchedRunway(this.activeQuery);
      },
      error: error => {
        this.requestSubscription = null;
        this.pagedBookBrowserStateService.markError(requestKey, error, 'stage-3-legacy-fallback');
        this.setLegacyStatus(['paged request failed'], 'The paged request failed, so the browser fell back to the legacy full-state path.');

        if (!this.activeQuery || this.activeQuery.signature !== query.signature) {
          return;
        }

        this.subscribeToLegacy(query.legacyFactory);
      },
    });
    this.requestSubscription = requestSubscription.closed ? null : requestSubscription;
  }

  private seedFromLegacyState(query: ActivePagedQuery): void {
    if (!this.canWarmStart(query)) {
      return;
    }

    this.warmStartSubscription?.unsubscribe();
    this.warmStartSubscription = query.legacyFactory().pipe(
      filter(state => state.loaded && !state.error),
      take(1),
    ).subscribe(state => {
      this.warmStartSubscription = null;

      if (!this.activeQuery || this.activeQuery.signature !== query.signature) {
        return;
      }

      if (this.getCachedPages(query.requestKey).length > 0) {
        return;
      }

      const warmBooks = state.books?.slice(0, query.params.size ?? PagedGridPilotService.PAGE_SIZE) ?? [];
      if (warmBooks.length === 0) {
        return;
      }

      this.bookStateSubject.next({
        books: warmBooks,
        loaded: true,
        error: null,
      });
    });
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

    this.bookStateSubject.next({
      books,
      loaded: true,
      error: null,
    });
  }

  private getCachedPages(baseRequestKey: PagedBookBrowserRequestKey): PagedBookBrowserPage[] {
    const matchingEntries = Object.values(this.pagedBookBrowserStateService.getCurrentState().cache)
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

  private canWarmStart(query: ActivePagedQuery): boolean {
    return query.requestKey.sorts.length === 0
      || query.requestKey.sorts.every(sort => sort.split(',')[0] === 'addedOn');
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
    this.warmStartSubscription?.unsubscribe();
    this.warmStartSubscription = null;
  }
}