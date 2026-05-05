import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, filter, Observable, Subscription, take } from 'rxjs';
import { BookState } from '../model/state/book-state.model';
import { SortOption } from '../model/sort.model';
import { PagedBookBrowserPage, PagedBookBrowserRequestKey } from '../model/state/paged-book-browser-state.model';
import { BookService, PagedBooksParams } from './book.service';
import { PagedBookBrowserStateService } from './paged-book-browser-state.service';
import { ServerFilterAdapter } from './server-filter-adapter.service';

export interface AllBooksPagedGridPilotContext {
  isAllBooksRoute: boolean;
  viewMode: string | undefined;
  sortCriteria: SortOption[];
  filters: Record<string, string[]>;
  filterMode: string;
  isDirectoryScopedView: boolean;
  isSeriesCollapsed: boolean;
  searchTerm: string;
}

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
export class AllBooksPagedGridPilotService {
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

  readonly bookState$ = this.bookStateSubject.asObservable();

  private activeQuery: ActivePagedQuery | null = null;
  private pagedActive = false;
  private requestSubscription: Subscription | null = null;
  private legacySubscription: Subscription | null = null;
  private warmStartSubscription: Subscription | null = null;

  connect(context: AllBooksPagedGridPilotContext, legacyFactory: () => Observable<BookState>): Observable<BookState> {
    if (!this.canUsePagedPilot(context)) {
      this.subscribeToLegacy(legacyFactory);
      return this.bookState$;
    }

    const params = this.serverFilterAdapter.mergeParams(
      {
        page: 0,
        size: AllBooksPagedGridPilotService.PAGE_SIZE,
      },
      this.serverFilterAdapter.buildSortParams(context.sortCriteria),
      this.serverFilterAdapter.buildFilterParams(context.filters, context.filterMode),
    );

    const requestKey = this.pagedBookBrowserStateService.buildRequestKey(
      'ALL_BOOKS',
      null,
      'grid',
      params,
      context.filters,
    );
    const signature = this.buildSignature(requestKey);

    if (this.activeQuery?.signature === signature && this.pagedActive) {
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
    this.pagedBookBrowserStateService.setGuardrails({
      activeMode: 'paged-browse',
      fallbackMode: 'legacy-full-state',
      allowPagedGridView: true,
      allowPagedTableView: false,
      enabledEntities: ['ALL_BOOKS'],
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
      AllBooksPagedGridPilotService.LOAD_MORE_THRESHOLD_PX,
      clientHeight * AllBooksPagedGridPilotService.LOAD_MORE_THRESHOLD_VIEWPORTS,
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
  }

  private canUsePagedPilot(context: AllBooksPagedGridPilotContext): boolean {
    return context.isAllBooksRoute
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
      || (sortCriteria.length === 1 && sortCriteria[0].field === 'addedOn');
  }

  private fetchPage(query: ActivePagedQuery, page: number): void {
    if (this.requestSubscription || !this.activeQuery || this.activeQuery.signature !== query.signature) {
      return;
    }

    const params: PagedBooksParams = {
      ...query.params,
      page,
      size: AllBooksPagedGridPilotService.PAGE_SIZE,
    };

    const requestKey = this.pagedBookBrowserStateService.buildRequestKey(
      'ALL_BOOKS',
      null,
      'grid',
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

      const warmBooks = state.books?.slice(0, query.params.size ?? AllBooksPagedGridPilotService.PAGE_SIZE) ?? [];
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
    if (cachedPages.length === 0 || cachedPages.length >= AllBooksPagedGridPilotService.PREFETCHED_PAGE_COUNT) {
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