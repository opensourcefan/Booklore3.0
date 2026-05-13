import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { filter, firstValueFrom, of, Subject, throwError } from 'rxjs';
import { Book } from '../model/book.model';
import { BookState } from '../model/state/book-state.model';
import { SortDirection } from '../model/sort.model';
import { BookService } from './book.service';
import { PagedBookBrowserStateService } from './paged-book-browser-state.service';
import { ServerFilterAdapter } from './server-filter-adapter.service';
import { PagedGridPilotService } from './paged-grid-pilot.service';

function createBook(id: number, title = `Book ${id}`): Book {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    metadata: {
      title,
    },
  } as Book;
}

describe('PagedGridPilotService', () => {
  let getBooksPaged: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getBooksPaged = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        PagedGridPilotService,
        PagedBookBrowserStateService,
        ServerFilterAdapter,
        {
          provide: BookService,
          useValue: {
            getBooksPaged,
            getBookByIdFromState: vi.fn(),
            getBooksByIdsFromState: vi.fn(() => []),
            getBookByIdFromAPI: vi.fn(),
          },
        },
      ],
    });
  });

  function createService(): PagedGridPilotService {
    return TestBed.inject(PagedGridPilotService);
  }

  function getPagedStateService(): PagedBookBrowserStateService {
    return TestBed.inject(PagedBookBrowserStateService);
  }

  function legacyState(books: Book[]): BookState {
    return {
      books,
      loaded: true,
      error: null,
    };
  }

  it('warms the All Books grid pilot from legacy state while the first paged response is loading', async () => {
    const service = createService();
    const pagedResponse$ = new Subject<{
      content: Book[];
      page: number;
      size: number;
      totalElements: number;
      totalPages: number;
      hasNext: boolean;
      hasPrevious: boolean;
    }>();

    getBooksPaged.mockReturnValue(pagedResponse$);

    const bookState$ = service.connect({
      entity: 'ALL_BOOKS',
      entityId: null,
      viewMode: 'grid',
      sortCriteria: [{ field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING }],
      filters: {},
      filterMode: 'and',
      isDirectoryScopedView: false,
      isSeriesCollapsed: false,
      searchTerm: '',
    }, () => of(legacyState([createBook(90, 'Warm 90'), createBook(91, 'Warm 91')])));

    const warmState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded)));
    expect(warmState.books?.map(book => book.id)).toEqual([90, 91]);
    expect(service.isPagedActive()).toBe(true);
    expect(service.getStatus()).toMatchObject({
      mode: 'paged',
      summary: 'Paged grid active',
    });
    expect(getBooksPaged).toHaveBeenCalledWith(expect.objectContaining({
      page: 0,
      size: 80,
      sorts: ['addedOn,desc'],
    }));

    pagedResponse$.next({
      content: [createBook(1), createBook(2)],
      page: 0,
      size: 100,
      totalElements: 2,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    });
    pagedResponse$.complete();

    const pagedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded && state.books?.[0]?.id === 1)));
    expect(pagedState.books?.map(book => book.id)).toEqual([1, 2]);
  });

  it('keeps a larger runway prefetched and appends another page on scroll', async () => {
    const service = createService();

    getBooksPaged.mockImplementation(({ page }: { page?: number }) => of({
      content: page === 4
        ? [createBook(9), createBook(10)]
        : page === 3
          ? [createBook(7), createBook(8)]
          : page === 2
            ? [createBook(5), createBook(6)]
            : page === 1
              ? [createBook(3), createBook(4)]
              : [createBook(1), createBook(2)],
      page: page ?? 0,
      size: 80,
      totalElements: 10,
      totalPages: 5,
      hasNext: page !== 4,
      hasPrevious: (page ?? 0) > 0,
    }));

    const bookState$ = service.connect({
      entity: 'ALL_BOOKS',
      entityId: null,
      viewMode: 'grid',
      sortCriteria: [{ field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING }],
      filters: { author: ['Jane Doe'] },
      filterMode: 'and',
      isDirectoryScopedView: false,
      isSeriesCollapsed: false,
      searchTerm: '',
    }, () => of({ books: null, loaded: false, error: null }));

    const firstLoadedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded)));

    expect(firstLoadedState.books?.slice(0, 2).map(book => book.id)).toEqual([1, 2]);
    expect(service.isPagedActive()).toBe(true);
    expect(getBooksPaged).toHaveBeenCalledWith(expect.objectContaining({
      page: 0,
      size: 80,
      sorts: ['addedOn,desc'],
      authors: ['Jane Doe'],
      filterMode: 'and',
    }));
    expect(getBooksPaged).toHaveBeenCalledTimes(4);

    const prefetchedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded && (state.books?.length ?? 0) === 8)));
    expect(prefetchedState.books?.map(book => book.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    service.loadNextPageIfNeeded(1900, 500, 2800);

    const secondLoadedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded && (state.books?.length ?? 0) === 10)));
    expect(secondLoadedState.books?.map(book => book.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(getBooksPaged).toHaveBeenCalledTimes(5);
  });

  it('does not drop back to loading when the same query reconnects before page zero returns', async () => {
    const service = createService();
    const pagedResponse$ = new Subject<{
      content: Book[];
      page: number;
      size: number;
      totalElements: number;
      totalPages: number;
      hasNext: boolean;
      hasPrevious: boolean;
    }>();

    getBooksPaged.mockReturnValue(pagedResponse$);

    const context = {
      entity: 'ALL_BOOKS' as const,
      entityId: null,
      viewMode: 'grid' as const,
      sortCriteria: [{ field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING }],
      filters: {},
      filterMode: 'and',
      isDirectoryScopedView: false,
      isSeriesCollapsed: false,
      searchTerm: '',
    };

    const bookState$ = service.connect(context, () => of(legacyState([createBook(90, 'Warm 90'), createBook(91, 'Warm 91')])));
    const warmState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded)));
    expect(warmState.books?.map(book => book.id)).toEqual([90, 91]);

    const sameQueryState$ = service.connect(context, () => of(legacyState([createBook(90, 'Warm 90'), createBook(91, 'Warm 91')])));
    const reconnectedState = await firstValueFrom(sameQueryState$);
    expect(reconnectedState.loaded).toBe(true);
    expect(reconnectedState.books?.map(book => book.id)).toEqual([90, 91]);
    expect(getBooksPaged).toHaveBeenCalledTimes(1);
  });

  it('refetches page zero after the All Books cache is invalidated', async () => {
    const service = createService();

    getBooksPaged
      .mockReturnValueOnce(of({
        content: [createBook(1), createBook(2)],
        page: 0,
        size: 80,
        totalElements: 2,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      }))
      .mockReturnValueOnce(of({
        content: [createBook(10), createBook(11)],
        page: 0,
        size: 80,
        totalElements: 2,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      }));

    const context = {
      entity: 'ALL_BOOKS' as const,
      entityId: null,
      viewMode: 'grid' as const,
      sortCriteria: [{ field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING }],
      filters: {},
      filterMode: 'and',
      isDirectoryScopedView: false,
      isSeriesCollapsed: false,
      searchTerm: '',
    };

    const bookState$ = service.connect(context, () => of(legacyState([createBook(90, 'Warm 90')])));
    const initialState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded)));
    expect(initialState.books?.map(book => book.id)).toEqual([1, 2]);

    service.invalidateAllBooksCache();

    const refreshedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded && state.books?.[0]?.id === 10)));
    expect(refreshedState.books?.map(book => book.id)).toEqual([10, 11]);
    expect(getBooksPaged).toHaveBeenCalledTimes(2);
  });

  it('surfaces explicit legacy status for legacy-only routes', () => {
    const service = createService();

    service.setExplicitLegacyStatus(
      'Shelf routes currently use the legacy full-state path.',
      ['shelf route stays on legacy full-state mode'],
    );

    expect(service.isPagedActive()).toBe(false);
    expect(service.getStatus()).toEqual({
      mode: 'legacy',
      summary: 'Legacy full-state mode',
      detail: 'Shelf routes currently use the legacy full-state path.',
      blockers: ['shelf route stays on legacy full-state mode'],
    });
  });

  it('uses library-specific request keys and refetches the active library query after invalidation', async () => {
    const service = createService();
    const pagedStateService = getPagedStateService();

    getBooksPaged
      .mockReturnValueOnce(of({
        content: [createBook(31, 'Library One')],
        page: 0,
        size: 80,
        totalElements: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      }))
      .mockReturnValueOnce(of({
        content: [createBook(41, 'Library Refetch')],
        page: 0,
        size: 80,
        totalElements: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      }));

    const context = {
      entity: 'LIBRARY' as const,
      entityId: 7,
      viewMode: 'grid' as const,
      sortCriteria: [{ field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING }],
      filters: {},
      filterMode: 'and',
      isDirectoryScopedView: false,
      isSeriesCollapsed: false,
      searchTerm: '',
    };

    const bookState$ = service.connect(context, () => of(legacyState([createBook(90, 'Warm 90')])));
    const initialState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded)));

    expect(initialState.books?.map(book => book.id)).toEqual([31]);
    expect(getBooksPaged).toHaveBeenCalledWith(expect.objectContaining({
      libraryId: 7,
      page: 0,
      size: 80,
      sorts: ['addedOn,desc'],
    }));

    const cachedEntries = Object.values(pagedStateService.getCurrentState().cache);
    expect(cachedEntries).toHaveLength(1);
    expect(cachedEntries[0]?.key.entity).toBe('LIBRARY');
    expect(cachedEntries[0]?.key.entityId).toBe(7);

    service.invalidateAllBooksCache();

    const refreshedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded && state.books?.[0]?.id === 41)));
    expect(refreshedState.books?.map(book => book.id)).toEqual([41]);
    expect(getBooksPaged).toHaveBeenCalledTimes(2);
  });

  it('uses unshelved request keys and refetches the active Not Shelfed query after invalidation', async () => {
    const service = createService();
    const pagedStateService = getPagedStateService();

    getBooksPaged
      .mockReturnValueOnce(of({
        content: [createBook(51, 'Unshelved One')],
        page: 0,
        size: 80,
        totalElements: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      }))
      .mockReturnValueOnce(of({
        content: [createBook(61, 'Unshelved Refetch')],
        page: 0,
        size: 80,
        totalElements: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      }));

    const context = {
      entity: 'NOT_SHELFED' as const,
      entityId: null,
      viewMode: 'grid' as const,
      sortCriteria: [{ field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING }],
      filters: {},
      filterMode: 'and',
      isDirectoryScopedView: false,
      isSeriesCollapsed: false,
      searchTerm: '',
    };

    const bookState$ = service.connect(context, () => of(legacyState([createBook(90, 'Warm 90')])));
    const initialState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded)));

    expect(initialState.books?.map(book => book.id)).toEqual([51]);
    expect(getBooksPaged).toHaveBeenCalledWith(expect.objectContaining({
      unshelved: true,
      page: 0,
      size: 80,
      sorts: ['addedOn,desc'],
    }));

    const cachedEntries = Object.values(pagedStateService.getCurrentState().cache);
    expect(cachedEntries).toHaveLength(1);
    expect(cachedEntries[0]?.key.entity).toBe('NOT_SHELFED');
    expect(cachedEntries[0]?.key.entityId).toBeNull();

    service.invalidateAllBooksCache();

    const refreshedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded && state.books?.[0]?.id === 61)));
    expect(refreshedState.books?.map(book => book.id)).toEqual([61]);
    expect(getBooksPaged).toHaveBeenCalledTimes(2);
  });

  it('uses shelf-specific request keys and refetches the active shelf query after invalidation', async () => {
    const service = createService();
    const pagedStateService = getPagedStateService();

    getBooksPaged
      .mockReturnValueOnce(of({
        content: [createBook(71, 'Shelf One')],
        page: 0,
        size: 80,
        totalElements: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      }))
      .mockReturnValueOnce(of({
        content: [createBook(81, 'Shelf Refetch')],
        page: 0,
        size: 80,
        totalElements: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      }));

    const context = {
      entity: 'SHELF' as const,
      entityId: 12,
      viewMode: 'grid' as const,
      sortCriteria: [{ field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING }],
      filters: {},
      filterMode: 'and',
      isDirectoryScopedView: false,
      isSeriesCollapsed: false,
      searchTerm: '',
    };

    const bookState$ = service.connect(context, () => of(legacyState([createBook(90, 'Warm 90')])));
    const initialState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded)));

    expect(initialState.books?.map(book => book.id)).toEqual([71]);
    expect(getBooksPaged).toHaveBeenCalledWith(expect.objectContaining({
      shelfId: 12,
      page: 0,
      size: 80,
      sorts: ['addedOn,desc'],
    }));

    const cachedEntries = Object.values(pagedStateService.getCurrentState().cache);
    expect(cachedEntries).toHaveLength(1);
    expect(cachedEntries[0]?.key.entity).toBe('SHELF');
    expect(cachedEntries[0]?.key.entityId).toBe(12);

    service.invalidateAllBooksCache();

    const refreshedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded && state.books?.[0]?.id === 81)));
    expect(refreshedState.books?.map(book => book.id)).toEqual([81]);
    expect(getBooksPaged).toHaveBeenCalledTimes(2);
  });

  it('uses the paged path for title sorting when the server contract supports it', async () => {
    const service = createService();

    getBooksPaged.mockReturnValueOnce(of({
      content: [createBook(11, 'Alpha'), createBook(12, 'Bravo')],
      page: 0,
      size: 80,
      totalElements: 2,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    }));

    const bookState$ = service.connect({
      entity: 'ALL_BOOKS',
      entityId: null,
      viewMode: 'grid',
      sortCriteria: [{ field: 'title', label: 'Title', direction: SortDirection.ASCENDING }],
      filters: {},
      filterMode: 'and',
      isDirectoryScopedView: false,
      isSeriesCollapsed: false,
      searchTerm: '',
    }, () => of(legacyState([createBook(90, 'Warm 90'), createBook(91, 'Warm 91')])));

    const pagedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded)));
    expect(pagedState.books?.map(book => book.id)).toEqual([11, 12]);
    expect(service.isPagedActive()).toBe(true);
    expect(getBooksPaged).toHaveBeenCalledWith(expect.objectContaining({
      sorts: ['metadata.title,asc'],
    }));
  });

  it('uses the paged path for file name sorting when the server contract supports primary-file ordering', async () => {
    const service = createService();

    getBooksPaged.mockReturnValueOnce(of({
      content: [createBook(21, 'Alpha File'), createBook(22, 'Bravo File')],
      page: 0,
      size: 80,
      totalElements: 2,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    }));

    const bookState$ = service.connect({
      entity: 'ALL_BOOKS',
      entityId: null,
      viewMode: 'grid',
      sortCriteria: [{ field: 'fileName', label: 'File Name', direction: SortDirection.ASCENDING }],
      filters: {},
      filterMode: 'and',
      isDirectoryScopedView: false,
      isSeriesCollapsed: false,
      searchTerm: '',
    }, () => of(legacyState([createBook(90, 'Warm 90'), createBook(91, 'Warm 91')])));

    const pagedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded)));
    expect(pagedState.books?.map(book => book.id)).toEqual([21, 22]);
    expect(service.isPagedActive()).toBe(true);
    expect(getBooksPaged).toHaveBeenCalledWith(expect.objectContaining({
      sorts: ['fileName,asc'],
    }));
  });

  it('uses the paged path for supported user-progress sorting', async () => {
    const service = createService();

    getBooksPaged.mockReturnValueOnce(of({
      content: [createBook(2, 'Older'), createBook(1, 'Oldest')],
      page: 0,
      size: 80,
      totalElements: 2,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    }));

    const bookState$ = service.connect({
      entity: 'ALL_BOOKS',
      entityId: null,
      viewMode: 'grid',
      sortCriteria: [{ field: 'personalRating', label: 'Personal Rating', direction: SortDirection.ASCENDING }],
      filters: {},
      filterMode: 'and',
      isDirectoryScopedView: false,
      isSeriesCollapsed: false,
      searchTerm: '',
    }, () => of(legacyState([createBook(2, 'Older'), createBook(1, 'Oldest')])));

    const pagedLoadedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded)));

    expect(pagedLoadedState.books?.map(book => book.id)).toEqual([2, 1]);
    expect(service.isPagedActive()).toBe(true);
    expect(getBooksPaged).toHaveBeenCalledWith(expect.objectContaining({
      sorts: ['personalRating,asc'],
    }));
  });

  it('falls back to the legacy path for unsupported computed sorting', async () => {
    const service = createService();

    const bookState$ = service.connect({
      entity: 'ALL_BOOKS',
      entityId: null,
      viewMode: 'grid',
      sortCriteria: [{ field: 'readingProgress', label: 'Reading Progress', direction: SortDirection.ASCENDING }],
      filters: {},
      filterMode: 'and',
      isDirectoryScopedView: false,
      isSeriesCollapsed: false,
      searchTerm: '',
    }, () => of(legacyState([createBook(2, 'Older'), createBook(1, 'Oldest')])));

    const legacyLoadedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded)));

    expect(legacyLoadedState.books?.map(book => book.id)).toEqual([2, 1]);
    expect(service.isPagedActive()).toBe(false);
    expect(service.getStatus()).toMatchObject({
      mode: 'legacy',
      blockers: ['unsupported sort fields: readingProgress'],
    });
    expect(getBooksPaged).not.toHaveBeenCalled();
  });

  it('falls back to the legacy path when the request uses unsupported filter keys', async () => {
    const service = createService();

    const bookState$ = service.connect({
      entity: 'ALL_BOOKS',
      entityId: null,
      viewMode: 'grid',
      sortCriteria: [{ field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING }],
      filters: { tag: ['favorite'] },
      filterMode: 'and',
      isDirectoryScopedView: false,
      isSeriesCollapsed: false,
      searchTerm: '',
    }, () => of(legacyState([createBook(42, 'Legacy Fallback')])));

    const legacyLoadedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded)));

    expect(legacyLoadedState.books?.map(book => book.id)).toEqual([42]);
    expect(service.isPagedActive()).toBe(false);
    expect(service.getStatus()).toMatchObject({
      mode: 'legacy',
      summary: 'Legacy full-state mode',
      blockers: ['unsupported filters: tag'],
    });
    expect(getBooksPaged).not.toHaveBeenCalled();
  });

  it('uses the paged path for custom media type filtering when the request stays within contract', async () => {
    const service = createService();

    getBooksPaged.mockReturnValueOnce(of({
      content: [createBook(55, 'Paged Media Type')],
      page: 0,
      size: 80,
      totalElements: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    }));

    const bookState$ = service.connect({
      entity: 'ALL_BOOKS',
      entityId: null,
      viewMode: 'grid',
      sortCriteria: [{ field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING }],
      filters: { customMediaType: ['Magazine'] },
      filterMode: 'and',
      isDirectoryScopedView: false,
      isSeriesCollapsed: false,
      searchTerm: '',
    }, () => of(legacyState([createBook(95, 'Legacy Media Type')])));

    const pagedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded)));

    expect(pagedState.books?.map(book => book.id)).toEqual([55]);
    expect(service.isPagedActive()).toBe(true);
    expect(getBooksPaged).toHaveBeenCalledWith(expect.objectContaining({
      sorts: ['addedOn,desc'],
      mediaTypes: ['Magazine'],
    }));
  });

  it('uses the paged path for guarded table view and active search terms', async () => {
    const service = createService();

    getBooksPaged.mockReturnValueOnce(of({
      content: [createBook(5, 'Paged Table')],
      page: 0,
      size: 80,
      totalElements: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    }));

    const tableState$ = service.connect({
      entity: 'ALL_BOOKS',
      entityId: null,
      viewMode: 'table',
      sortCriteria: [{ field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING }],
      filters: {},
      filterMode: 'and',
      isDirectoryScopedView: false,
      isSeriesCollapsed: false,
      searchTerm: '',
    }, () => of(legacyState([createBook(5, 'Legacy Table')])));

    const tableState = await firstValueFrom(tableState$.pipe(filter(state => state.loaded)));
    expect(tableState.books?.map(book => book.id)).toEqual([5]);
    expect(service.isPagedActive()).toBe(true);
    expect(service.getStatus()).toMatchObject({
      mode: 'paged',
      summary: 'Paged list active',
    });
    expect(getBooksPaged).toHaveBeenCalledWith(expect.objectContaining({
      page: 0,
      size: 80,
      sorts: ['addedOn,desc'],
    }));

    getBooksPaged.mockReturnValueOnce(of({
      content: [createBook(6, 'Paged Search')],
      page: 0,
      size: 80,
      totalElements: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    }));

    const searchState$ = service.connect({
      entity: 'ALL_BOOKS',
      entityId: null,
      viewMode: 'grid',
      sortCriteria: [{ field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING }],
      filters: {},
      filterMode: 'and',
      isDirectoryScopedView: false,
      isSeriesCollapsed: false,
      searchTerm: 'batman',
    }, () => of(legacyState([createBook(6, 'Legacy Search')])));

    const searchState = await firstValueFrom(searchState$.pipe(filter(state => state.loaded)));
    expect(searchState.books?.map(book => book.id)).toEqual([6]);
    expect(service.isPagedActive()).toBe(true);
    expect(service.getStatus()).toMatchObject({
      mode: 'paged',
    });
    expect(getBooksPaged).toHaveBeenCalledTimes(2);
    expect(getBooksPaged).toHaveBeenLastCalledWith(expect.objectContaining({
      search: 'batman',
    }));
  });

  it('uses the paged path for shelf and unshelved routes when the request stays within contract', async () => {
    const service = createService();

    getBooksPaged
      .mockReturnValueOnce(of({
        content: [createBook(21, 'Shelf Book')],
        page: 0,
        size: 80,
        totalElements: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      }))
      .mockReturnValueOnce(of({
        content: [createBook(31, 'Unshelved Book')],
        page: 0,
        size: 80,
        totalElements: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      }));

    const shelfState$ = service.connect({
      entity: 'SHELF',
      entityId: 9,
      viewMode: 'grid',
      sortCriteria: [{ field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING }],
      filters: {},
      filterMode: 'and',
      isDirectoryScopedView: false,
      isSeriesCollapsed: false,
      searchTerm: '',
    }, () => of(legacyState([createBook(91, 'Legacy Shelf')])));

    const shelfState = await firstValueFrom(shelfState$.pipe(filter(state => state.loaded)));
    expect(shelfState.books?.map(book => book.id)).toEqual([21]);
    expect(getBooksPaged).toHaveBeenNthCalledWith(1, expect.objectContaining({
      shelfId: 9,
      sorts: ['addedOn,desc'],
    }));

    const unshelvedState$ = service.connect({
      entity: 'NOT_SHELFED',
      entityId: null,
      viewMode: 'grid',
      sortCriteria: [{ field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING }],
      filters: {},
      filterMode: 'and',
      isDirectoryScopedView: false,
      isSeriesCollapsed: false,
      searchTerm: '',
    }, () => of(legacyState([createBook(92, 'Legacy Unshelved')])));

    const unshelvedState = await firstValueFrom(unshelvedState$.pipe(filter(state => state.loaded)));
    expect(unshelvedState.books?.map(book => book.id)).toEqual([31]);
    expect(getBooksPaged).toHaveBeenNthCalledWith(2, expect.objectContaining({
      unshelved: true,
      sorts: ['addedOn,desc'],
    }));
  });

  it('falls back to the legacy path when the paged request fails', async () => {
    const service = createService();

    getBooksPaged.mockReturnValue(throwError(() => new Error('paged request failed')));

    const bookState$ = service.connect({
      entity: 'ALL_BOOKS',
      entityId: null,
      viewMode: 'grid',
      sortCriteria: [{ field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING }],
      filters: {},
      filterMode: 'and',
      isDirectoryScopedView: false,
      isSeriesCollapsed: false,
      searchTerm: '',
    }, () => of(legacyState([createBook(7, 'Legacy Recovery')])));

    const legacyLoadedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded)));

    expect(legacyLoadedState.books?.map(book => book.id)).toEqual([7]);
    expect(service.isPagedActive()).toBe(false);
    expect(getBooksPaged).toHaveBeenCalledWith(expect.objectContaining({
      page: 0,
      size: 80,
      sorts: ['addedOn,desc'],
    }));
  });
});