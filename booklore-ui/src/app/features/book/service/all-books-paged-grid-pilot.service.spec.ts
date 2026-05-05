import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { filter, firstValueFrom, of, throwError } from 'rxjs';
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

  it('loads the All Books grid pilot from the paged endpoint and appends the next page on scroll', async () => {
    const service = createService();

    getBooksPaged.mockImplementation(({ page }: { page?: number }) => of({
      content: page === 1
        ? [createBook(3), createBook(4)]
        : [createBook(1), createBook(2)],
      page: page ?? 0,
      size: 100,
      totalElements: 4,
      totalPages: 2,
      hasNext: page !== 1,
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
    }, () => of(legacyState([createBook(99, 'Legacy')])));

    const firstLoadedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded)));

    expect(firstLoadedState.books?.map(book => book.id)).toEqual([1, 2]);
    expect(service.isPagedActive()).toBe(true);
    expect(getBooksPaged).toHaveBeenCalledWith(expect.objectContaining({
      page: 0,
      size: 100,
      sorts: ['addedOn,desc'],
      authors: ['Jane Doe'],
      filterMode: 'and',
    }));

    service.loadNextPageIfNeeded(550, 500, 1200);

    const secondLoadedState = await firstValueFrom(bookState$.pipe(filter(state => state.loaded && (state.books?.length ?? 0) === 4)));
    expect(secondLoadedState.books?.map(book => book.id)).toEqual([1, 2, 3, 4]);
    expect(getBooksPaged).toHaveBeenCalledTimes(2);
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