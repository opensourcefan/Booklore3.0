import {HttpClient} from '@angular/common/http';
import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {firstValueFrom, of} from 'rxjs';
import {Book} from '../model/book.model';
import {BookPatchService} from './book-patch.service';
import {BookStateService} from './book-state.service';
import {PagedBookBrowserStateService} from './paged-book-browser-state.service';
import {PagedGridPilotService} from './paged-grid-pilot.service';
import {SidebarBadgeRefreshService} from './sidebar-badge-refresh.service';

function createBook(id: number, shelfIds: number[] = []): Book {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    shelves: shelfIds.map(shelfId => ({id: shelfId, name: `Shelf ${shelfId}`})),
  } as Book;
}

describe('BookPatchService', () => {
  let httpPostSpy: ReturnType<typeof vi.fn>;
  let syncCacheFromSharedStateSpy: ReturnType<typeof vi.fn>;
  let refreshActiveStateSpy: ReturnType<typeof vi.fn>;
  let requestRefreshSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    httpPostSpy = vi.fn();
    syncCacheFromSharedStateSpy = vi.fn();
    refreshActiveStateSpy = vi.fn();
    requestRefreshSpy = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        BookPatchService,
        BookStateService,
        {
          provide: HttpClient,
          useValue: {
            post: httpPostSpy,
            put: vi.fn(),
          },
        },
        {
          provide: PagedBookBrowserStateService,
          useValue: {
            syncCacheFromSharedState: syncCacheFromSharedStateSpy,
          },
        },
        {
          provide: PagedGridPilotService,
          useValue: {
            refreshActiveState: refreshActiveStateSpy,
          },
        },
        {
          provide: SidebarBadgeRefreshService,
          useValue: {
            requestRefresh: requestRefreshSpy,
          },
        },
      ],
    });
  });

  function createService(): BookPatchService {
    return TestBed.inject(BookPatchService);
  }

  function getBookStateService(): BookStateService {
    return TestBed.inject(BookStateService);
  }

  it('refreshes paged browsers after shelf updates clear the shared paged cache', async () => {
    const service = createService();
    const bookStateService = getBookStateService();

    bookStateService.updateBookState({
      books: [createBook(51)],
      loaded: true,
      error: null,
      pagedCache: {
        unshelved: {
          key: {
            entity: 'NOT_SHELFED',
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
            content: [createBook(51)],
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
        },
      },
    });

    httpPostSpy.mockReturnValue(of([createBook(51, [9])]));

    await firstValueFrom(service.updateBookShelves(new Set([51]), new Set([9]), new Set()));

    expect(bookStateService.getCurrentBookState().books?.[0]?.shelves?.map(shelf => shelf.id)).toEqual([9]);
    expect(bookStateService.getCurrentBookState().pagedCache).toBeDefined();
    expect(Object.keys(bookStateService.getCurrentBookState().pagedCache ?? {}).length).toBeGreaterThan(0);
    expect(syncCacheFromSharedStateSpy).toHaveBeenCalledTimes(1);
    expect(refreshActiveStateSpy).toHaveBeenCalledTimes(1);
    expect(requestRefreshSpy).toHaveBeenCalledTimes(1);
  });

  it('requests a sidebar badge refresh after media type updates', async () => {
    const service = createService();
    const bookStateService = getBookStateService();

    bookStateService.updateBookState({
      books: [createBook(99)],
      loaded: true,
      error: null,
    });

    httpPostSpy.mockReturnValue(of([{
      ...createBook(99),
      fileType: 'CBZ',
    }]));

    await firstValueFrom(service.updateFileType(new Set([99]), 'CBZ'));

    expect(requestRefreshSpy).toHaveBeenCalledTimes(1);
  });
});