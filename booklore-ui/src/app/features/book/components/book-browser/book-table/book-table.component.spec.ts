import {DatePipe} from '@angular/common';
import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MessageService} from 'primeng/api';
import {TranslocoService} from '@jsverse/transloco';
import {Book} from '../../../model/book.model';
import {ReadStatusHelper} from '../../../helpers/read-status.helper';
import {BookMetadataManageService} from '../../../service/book-metadata-manage.service';
import {BookService} from '../../../service/book.service';
import {UrlHelperService} from '../../../../../shared/service/url-helper.service';
import {UserService} from '../../../../settings/user-management/user.service';
import {BookTableComponent} from './book-table.component';

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
        { provide: BookService, useValue: { getBooksByIdsFromState: vi.fn(() => []) } },
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

    expect(component['getDisplayTitle'](book)).toBe('Main Title: Subtitle');
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
});
