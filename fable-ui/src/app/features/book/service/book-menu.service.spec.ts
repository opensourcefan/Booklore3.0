import {TestBed} from '@angular/core/testing';
import {of, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ConfirmationService, MessageService} from 'primeng/api';
import {BookMenuService} from './book-menu.service';
import {BookService} from './book.service';
import {BookMetadataManageService} from './book-metadata-manage.service';
import {PagedBookBrowserStateService} from './paged-book-browser-state.service';
import {WriteProgressService} from '../../../shared/service/write-progress.service';
import {TranslocoService} from '@jsverse/transloco';
import {Book} from '../model/book.model';

function createBook(id: number, shelfIds: number[]): Book {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    shelves: shelfIds.map(shelfId => ({id: shelfId, name: `Shelf ${shelfId}`})),
  } as Book;
}

describe('BookMenuService', () => {
  let confirmationService: { confirm: ReturnType<typeof vi.fn> };
  let messageService: { add: ReturnType<typeof vi.fn> };
  let bookService: { updateBookShelves: ReturnType<typeof vi.fn> };
  let pagedBookBrowserStateService: { resolveBooksByIds: ReturnType<typeof vi.fn> };
  let writeProgressService: { show: ReturnType<typeof vi.fn>; complete: ReturnType<typeof vi.fn>; fail: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    confirmationService = {confirm: vi.fn()};
    messageService = {add: vi.fn()};
    bookService = {
      updateBookShelves: vi.fn(() => of([])),
    };
    pagedBookBrowserStateService = {
      resolveBooksByIds: vi.fn(() => of([])),
    };
    writeProgressService = {
      show: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        BookMenuService,
        {provide: ConfirmationService, useValue: confirmationService},
        {provide: MessageService, useValue: messageService},
        {provide: BookService, useValue: bookService},
        {provide: BookMetadataManageService, useValue: {}},
        {provide: PagedBookBrowserStateService, useValue: pagedBookBrowserStateService},
        {provide: WriteProgressService, useValue: writeProgressService},
        {
          provide: TranslocoService,
          useValue: {
            translate: (key: string) => key,
          },
        },
      ],
    });
  });

  function createService(): BookMenuService {
    return TestBed.inject(BookMenuService);
  }

  function executeUnshelveCommand(service: BookMenuService, selectedBooks: Set<number>): void {
    const menuItems = service.getMoreActionsMenu(selectedBooks, {
      permissions: {
        canManageLibrary: true,
      },
    } as never);
    const unshelveItem = menuItems.find(item => item.label === 'book.menuService.menu.removeFromAllShelves');

    expect(unshelveItem?.command).toBeTypeOf('function');
    unshelveItem?.command?.({} as never);

    const confirmCall = confirmationService.confirm.mock.calls.at(-1)?.[0];
    expect(confirmCall?.accept).toBeTypeOf('function');
    confirmCall.accept();
  }

  it('resolves selected books through the paged state service before bulk unshelve', () => {
    const service = createService();
    pagedBookBrowserStateService.resolveBooksByIds.mockReturnValue(of([
      createBook(11, [5, 6]),
      createBook(22, [6, 7]),
    ]));

    executeUnshelveCommand(service, new Set([11, 22]));

    expect(pagedBookBrowserStateService.resolveBooksByIds).toHaveBeenCalledWith([11, 22]);
    expect(writeProgressService.show).toHaveBeenCalledWith('book.menuService.loading.removingFromShelves');
    expect(bookService.updateBookShelves).toHaveBeenCalledWith(new Set([11, 22]), new Set(), new Set([5, 6, 7]));
    expect(writeProgressService.complete).toHaveBeenCalledWith('book.menuService.toast.unshelveSuccessDetail');
  });

  it('shows an info toast when resolved books have no shelves to remove', () => {
    const service = createService();
    pagedBookBrowserStateService.resolveBooksByIds.mockReturnValue(of([
      createBook(11, []),
    ]));

    executeUnshelveCommand(service, new Set([11]));

    expect(bookService.updateBookShelves).not.toHaveBeenCalled();
    expect(messageService.add).toHaveBeenCalledWith({
      severity: 'info',
      summary: 'common.info',
      detail: 'book.menuService.toast.noBooksOnShelvesDetail'
    });
  });

  it('surfaces a failure when paged resolution fails before unshelve', () => {
    const service = createService();
    pagedBookBrowserStateService.resolveBooksByIds.mockReturnValue(throwError(() => new Error('network')));

    executeUnshelveCommand(service, new Set([11]));

    expect(bookService.updateBookShelves).not.toHaveBeenCalled();
    expect(writeProgressService.fail).toHaveBeenCalledWith('book.menuService.toast.unshelveFailedDetail');
    expect(messageService.add).toHaveBeenCalledWith({
      severity: 'error',
      summary: 'common.error',
      detail: 'book.menuService.toast.unshelveFailedDetail'
    });
  });
});