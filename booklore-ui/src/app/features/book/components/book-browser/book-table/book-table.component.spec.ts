import {ChangeDetectorRef} from '@angular/core';
import {DatePipe} from '@angular/common';
import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MessageService} from 'primeng/api';
import {TranslocoService} from '@jsverse/transloco';
import {Book} from '../../../model/book.model';
import {ReadStatusHelper} from '../../../helpers/read-status.helper';
import {BookMetadataManageService} from '../../../service/book-metadata-manage.service';
import {UrlHelperService} from '../../../../../shared/service/url-helper.service';
import {UserService} from '../../../../settings/user-management/user.service';
import {BookTableComponent} from './book-table.component';
import {SimpleChange} from '@angular/core';

function createBook(overrides: Partial<Book>): Book {
  return {
    id: overrides.id ?? 1,
    libraryId: overrides.libraryId ?? 1,
    libraryName: overrides.libraryName ?? 'Library',
    ...overrides,
  } as Book;
}

describe('BookTableComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DatePipe,
        { provide: UrlHelperService, useValue: {} },
        { provide: BookMetadataManageService, useValue: {} },
        { provide: MessageService, useValue: { add: vi.fn() } },
        { provide: UserService, useValue: { userState$: of({ loaded: true, user: { userSettings: {} } }) } },
        {
          provide: ReadStatusHelper,
          useValue: {
            getReadStatusIcon: vi.fn(() => ''),
            getReadStatusClass: vi.fn(() => ''),
            getReadStatusTooltip: vi.fn(() => ''),
            shouldShowStatusIcon: vi.fn(() => false),
          },
        },
        { provide: TranslocoService, useValue: { translate: vi.fn((key: string) => key) } },
        ChangeDetectorRef,
      ],
    });
  });

  function createComponent(): BookTableComponent {
    return TestBed.runInInjectionContext(() => new BookTableComponent());
  }

  it('formats titles with subtitles when enabled', () => {
    const component = createComponent();
    const book = createBook({
      metadata: {
        title: 'Main Title',
        subtitle: 'Subtitle',
      } as Book['metadata'],
      primaryFile: { id: 1, bookId: 1, fileName: 'main-title.cbz', bookType: 'CBX' },
    });
    component.showSubtitle = true;

    expect(component['getDisplayTitle'](book)).toBe('Main Title : Subtitle');
  });

  it('uses the filename in directory-scoped mode', () => {
    const component = createComponent();
    const book = createBook({
      metadata: {
        title: 'Main Title',
        subtitle: 'Subtitle',
      } as Book['metadata'],
      fileName: 'folder-title.cbz',
      primaryFile: { id: 1, bookId: 1, fileName: 'folder-title.cbz', bookType: 'CBX' },
    });
    component.showSubtitle = true;
    component.forceFileNameTitle = true;

    expect(component['getDisplayTitle'](book)).toBe('folder-title.cbz');
  });

  it('syncs selected rows from the preselected ids without aliasing the input set', () => {
    const component = createComponent();
    const firstBook = createBook({ id: 1 });
    const secondBook = createBook({ id: 2 });
    const preselected = new Set([1]);

    component.books = [firstBook, secondBook];
    component.preselectedBookIds = preselected;
    component.ngOnInit();

    expect(component.selectedBookIds).not.toBe(preselected);
    expect(component.selectedBookIds.has(1)).toBe(true);
    expect(component.selectedBooks).toEqual([firstBook]);
  });

  it('resyncs visible selected rows when the parent selection changes', () => {
    const component = createComponent();
    const firstBook = createBook({ id: 1 });
    const secondBook = createBook({ id: 2 });

    component.books = [firstBook, secondBook];
    component.preselectedBookIds = new Set([1]);
    component.ngOnInit();

    component.preselectedBookIds = new Set([2]);
    component.ngOnChanges({
      preselectedBookIds: new SimpleChange(new Set([1]), new Set([2]), false),
    });

    expect(component.selectedBookIds.has(1)).toBe(false);
    expect(component.selectedBookIds.has(2)).toBe(true);
    expect(component.selectedBooks).toEqual([secondBook]);
  });
});
