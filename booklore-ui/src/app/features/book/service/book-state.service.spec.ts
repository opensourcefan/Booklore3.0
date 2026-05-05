import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {BookStateService} from './book-state.service';
import {Book} from '../model/book.model';
import {PagedBookBrowserCacheEntry} from '../model/state/paged-book-browser-state.model';

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

describe('BookStateService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BookStateService],
    });
  });

  function createService(): BookStateService {
    return TestBed.inject(BookStateService);
  }

  it('stores paged cache separately and clears it when the legacy books array changes', () => {
    const service = createService();
    const cacheEntry: PagedBookBrowserCacheEntry = {
      key: {
        entity: 'ALL_BOOKS',
        entityId: null,
        viewMode: 'grid',
        page: 0,
        size: 80,
        sorts: ['addedOn,desc'],
        filterMode: 'and',
        search: null,
        filters: {},
      },
      status: 'loaded',
      page: {
        content: [createBook(11)],
        page: 0,
        size: 80,
        totalElements: 1,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      },
      error: null,
      loadedAt: Date.now(),
      fallbackReason: null,
    };

    service.setPagedCache({page0: cacheEntry});

    expect(service.getCachedPagedBookById(11)?.id).toBe(11);
    expect(service.getCurrentBookState().totalCount).toBe(1);

    service.updateBookState({
      books: [createBook(99)],
      loaded: true,
      error: null,
    });

    expect(service.getCurrentBookState().pagedCache).toEqual({});
    expect(service.getCurrentBookState().totalCount).toBe(1);
    expect(service.getCurrentBookState().books?.map(book => book.id)).toEqual([99]);
  });

  it('resolves ordered book ids from the paged cache', () => {
    const service = createService();

    service.setPagedCache({
      page0: {
        key: {
          entity: 'ALL_BOOKS',
          entityId: null,
          viewMode: 'grid',
          page: 0,
          size: 80,
          sorts: ['addedOn,desc'],
          filterMode: 'and',
          search: null,
          filters: {},
        },
        status: 'loaded',
        page: {
          content: [createBook(22), createBook(33)],
          page: 0,
          size: 80,
          totalElements: 2,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
        error: null,
        loadedAt: Date.now(),
        fallbackReason: null,
      },
    });

    expect(service.getCachedPagedBooksByIds([33, 22, 33]).map(book => book.id)).toEqual([33, 22]);
  });

  it('patches paged cache books in place and keeps derived total count', () => {
    const service = createService();

    service.setPagedCache({
      page0: {
        key: {
          entity: 'ALL_BOOKS',
          entityId: null,
          viewMode: 'grid',
          page: 0,
          size: 80,
          sorts: ['addedOn,desc'],
          filterMode: 'and',
          search: null,
          filters: {},
        },
        status: 'loaded',
        page: {
          content: [createBook(44, 'Old Title')],
          page: 0,
          size: 80,
          totalElements: 5,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
        error: null,
        loadedAt: Date.now(),
        fallbackReason: null,
      },
    });

    expect(service.patchPagedCacheBook(createBook(44, 'New Title'))).toBe(true);
    expect(service.getCachedPagedBookById(44)?.metadata?.title).toBe('New Title');
    expect(service.getCurrentBookState().totalCount).toBe(5);
  });

  it('invalidates paged cache by entity and by book ids using the shared state cache', () => {
    const service = createService();

    service.setPagedCache({
      allBooks: {
        key: {
          entity: 'ALL_BOOKS',
          entityId: null,
          viewMode: 'grid',
          page: 0,
          size: 80,
          sorts: ['addedOn,desc'],
          filterMode: 'and',
          search: null,
          filters: {},
        },
        status: 'loaded',
        page: {
          content: [createBook(11)],
          page: 0,
          size: 80,
          totalElements: 4,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
        error: null,
        loadedAt: Date.now(),
        fallbackReason: null,
      },
      library: {
        key: {
          entity: 'LIBRARY',
          entityId: 7,
          viewMode: 'grid',
          page: 0,
          size: 50,
          sorts: ['title,asc'],
          filterMode: 'and',
          search: null,
          filters: {},
        },
        status: 'loaded',
        page: {
          content: [createBook(22)],
          page: 0,
          size: 50,
          totalElements: 2,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        },
        error: null,
        loadedAt: Date.now(),
        fallbackReason: null,
      },
    });

    service.invalidatePagedCacheByBookIds([22]);
    expect(Object.keys(service.getCurrentBookState().pagedCache ?? {})).toEqual(['allBooks']);
    expect(service.getCurrentBookState().totalCount).toBe(4);

    service.invalidatePagedCacheByEntity('ALL_BOOKS');
    expect(service.getCurrentBookState().pagedCache).toEqual({});
    expect(service.getCurrentBookState().totalCount).toBeNull();
  });
});