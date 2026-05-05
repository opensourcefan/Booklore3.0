import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {of, firstValueFrom} from 'rxjs';
import {BookService} from './book.service';
import {PagedBookBrowserStateService} from './paged-book-browser-state.service';
import {Book} from '../model/book.model';
import {BookStateService} from './book-state.service';

function createBook(overrides: Partial<Book>): Book {
  return {
    id: overrides.id ?? 1,
    libraryId: overrides.libraryId ?? 1,
    libraryName: overrides.libraryName ?? 'Library',
    ...overrides,
  } as Book;
}

describe('PagedBookBrowserStateService', () => {
  let getBookByIdFromState: ReturnType<typeof vi.fn>;
  let getBooksByIdsFromState: ReturnType<typeof vi.fn>;
  let getBookByIdFromAPI: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getBookByIdFromState = vi.fn();
    getBooksByIdsFromState = vi.fn(() => []);
    getBookByIdFromAPI = vi.fn((id: number) => of(createBook({id, fileName: `api-${id}.cbz`})));

    TestBed.configureTestingModule({
      providers: [
        PagedBookBrowserStateService,
        {
          provide: BookService,
          useValue: {
            getBookByIdFromState,
            getBooksByIdsFromState,
            getBookByIdFromAPI,
          },
        },
      ],
    });
  });

  function createService(): PagedBookBrowserStateService {
    return TestBed.inject(PagedBookBrowserStateService);
  }

  function getBookStateService(): BookStateService {
    return TestBed.inject(BookStateService);
  }

  it('starts in legacy mode with an empty cache', () => {
    const service = createService();
    const state = service.getCurrentState();

    expect(state.guardrails.activeMode).toBe('legacy-full-state');
    expect(state.guardrails.allowPagedGridView).toBe(false);
    expect(state.guardrails.allowPagedTableView).toBe(false);
    expect(state.cache).toEqual({});
  });

  it('builds a stable request key and cache key from paged params', () => {
    const service = createService();
    const requestKey = service.buildRequestKey('ALL_BOOKS', null, 'grid', {
      page: 2,
      size: 100,
      sorts: ['title,asc'],
      filterMode: 'or',
      search: 'dune',
    }, {
      category: ['Science Fiction'],
      author: ['Frank Herbert'],
    });

    expect(requestKey).toEqual({
      entity: 'ALL_BOOKS',
      entityId: null,
      viewMode: 'grid',
      page: 2,
      size: 100,
      sorts: ['title,asc'],
      filterMode: 'or',
      search: 'dune',
      filters: {
        author: ['Frank Herbert'],
        category: ['Science Fiction'],
      },
    });
    expect(service.toCacheKey(requestKey)).toContain('ALL_BOOKS');
  });

  it('stores pages, marks loading, and invalidates by entity and book ids', () => {
    const service = createService();
    const bookStateService = getBookStateService();
    const requestKey = service.buildRequestKey('LIBRARY', 10, 'grid', {
      page: 0,
      size: 50,
      sorts: ['title,asc'],
    });

    service.markLoading(requestKey);
    expect(service.getCachedEntry(requestKey)?.status).toBe('loading');

    service.storePage(requestKey, {
      content: [createBook({id: 11}), createBook({id: 22})],
      page: 0,
      size: 50,
      totalElements: 2,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    });

    expect(service.getCachedPage(requestKey)?.content.map(book => book.id)).toEqual([11, 22]);
    expect(Object.keys(bookStateService.getCurrentBookState().pagedCache ?? {})).toHaveLength(1);
    expect(bookStateService.getCurrentBookState().totalCount).toBe(2);

    service.invalidateBooks([22]);
    expect(service.getCachedPage(requestKey)).toBeNull();
    expect(bookStateService.getCurrentBookState().pagedCache).toEqual({});

    service.storePage(requestKey, {
      content: [createBook({id: 11})],
      page: 0,
      size: 50,
      totalElements: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    });

    service.invalidateEntity('LIBRARY', 10);
    expect(service.getCachedPage(requestKey)).toBeNull();
    expect(bookStateService.getCurrentBookState().pagedCache).toEqual({});
  });

  it('patches cached books in place and keeps the shared paged cache synchronized', () => {
    const service = createService();
    const bookStateService = getBookStateService();
    const requestKey = service.buildRequestKey('ALL_BOOKS', null, 'grid', {
      page: 0,
      size: 50,
      sorts: ['title,asc'],
    });

    service.storePage(requestKey, {
      content: [createBook({id: 11, metadata: {title: 'Old Title'} as never})],
      page: 0,
      size: 50,
      totalElements: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    });

    service.patchBook(createBook({id: 11, metadata: {title: 'New Title'} as never}));

    expect(service.getCachedPage(requestKey)?.content[0]?.metadata?.title).toBe('New Title');
    const syncedEntry = Object.values(bookStateService.getCurrentBookState().pagedCache ?? {})[0];
    expect(syncedEntry?.page?.content[0]?.metadata?.title).toBe('New Title');
  });

  it('resolves books by preferring cache, then full state, then API', async () => {
    const service = createService();
    const requestKey = service.buildRequestKey('ALL_BOOKS', null, 'grid', {page: 0, size: 50});

    service.storePage(requestKey, {
      content: [createBook({id: 11, fileName: 'cached-11.cbz'})],
      page: 0,
      size: 50,
      totalElements: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    });

    getBookByIdFromState.mockImplementation((id: number) => id === 22 ? createBook({id: 22, fileName: 'state-22.cbz'}) : undefined);
    getBooksByIdsFromState.mockReturnValue([createBook({id: 22, fileName: 'state-22.cbz'})]);

    const resolvedSingle = await firstValueFrom(service.resolveBookById(11));
    expect(resolvedSingle?.fileName).toBe('cached-11.cbz');

    const resolvedBatch = await firstValueFrom(service.resolveBooksByIds([11, 22, 33]));
    expect(resolvedBatch.map(book => book.fileName)).toEqual(['cached-11.cbz', 'state-22.cbz', 'api-33.cbz']);
    expect(getBookByIdFromAPI).toHaveBeenCalledTimes(1);
    expect(getBookByIdFromAPI).toHaveBeenCalledWith(33, false);
  });
});