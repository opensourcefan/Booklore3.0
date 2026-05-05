import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { filter, firstValueFrom, of, Subject, throwError } from 'rxjs';
import { Book } from '../model/book.model';
import { BookState } from '../model/state/book-state.model';
import { SortDirection } from '../model/sort.model';
import { BookService } from './book.service';
import { PagedBookBrowserStateService } from './paged-book-browser-state.service';
import { ServerFilterAdapter } from './server-filter-adapter.service';
import { AllBooksPagedGridPilotService } from './all-books-paged-grid-pilot.service';

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

describe('AllBooksPagedGridPilotService', () => {
  let getBooksPaged: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getBooksPaged = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        AllBooksPagedGridPilotService,
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

  function createService(): AllBooksPagedGridPilotService {
    return TestBed.inject(AllBooksPagedGridPilotService);
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
      isAllBooksRoute: true,
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
    expect(getBooksPaged).toHaveBeenCalledWith(expect.objectContaining({
      page: 0,
      size: 100,
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

  it('loads the All Books grid pilot, prefetches the next page, and appends another page on scroll', async () => {
    const service = createService();

    getBooksPaged.mockImplementation(({ page }: { page?: number }) => of({
      content: page === 2
        ? [createBook(5), createBook(6)]
        : page === 1
          ? [createBook(3), createBook(4)]
          : [createBook(1), createBook(2)],
      page: page ?? 0,
      size: 100,
      totalElements: 6,
      totalPages: 3,
      hasNext: page !== 2,
      hasPrevious: (page ?? 0) > 0,
    }));

    const bookState$ = service.connect({
      isAllBooksRoute: true,
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
      size: 100,
      sorts: ['addedOn,desc'],
      authors: ['Jane Doe'],
      filterMode: 'and',
    }));
    expect(getBooksPaged).toHaveBeenCalledTimes(2);

    const prefetchedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded && (state.books?.length ?? 0) === 4)));
    expect(prefetchedState.books?.map(book => book.id)).toEqual([1, 2, 3, 4]);

    service.loadNextPageIfNeeded(1500, 500, 2200);

    const secondLoadedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded && (state.books?.length ?? 0) === 6)));
    expect(secondLoadedState.books?.map(book => book.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(getBooksPaged).toHaveBeenCalledTimes(3);
  });

  it('falls back to the legacy path when the request uses unsupported filter keys', async () => {
    const service = createService();

    const bookState$ = service.connect({
      isAllBooksRoute: true,
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
    expect(getBooksPaged).not.toHaveBeenCalled();
  });

  it('falls back to the legacy path for table view and active search terms', async () => {
    const service = createService();

    const tableState$ = service.connect({
      isAllBooksRoute: true,
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
    expect(service.isPagedActive()).toBe(false);

    const searchState$ = service.connect({
      isAllBooksRoute: true,
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
    expect(service.isPagedActive()).toBe(false);
    expect(getBooksPaged).not.toHaveBeenCalled();
  });

  it('falls back to the legacy path when the paged request fails', async () => {
    const service = createService();

    getBooksPaged.mockReturnValue(throwError(() => new Error('paged request failed')));

    const bookState$ = service.connect({
      isAllBooksRoute: true,
      viewMode: 'grid',
      sortCriteria: [{ field: 'title', label: 'Title', direction: SortDirection.ASCENDING }],
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
      size: 100,
      sorts: ['metadata.title,asc'],
    }));
  });
});