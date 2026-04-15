import {SimpleChange} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ConfirmationService, MessageService} from 'primeng/api';
import {Router} from '@angular/router';
import {TranslocoService} from '@jsverse/transloco';
import {BookCardComponent} from './book-card.component';
import {Book} from '../../../model/book.model';
import {BookService} from '../../../service/book.service';
import {BookFileService} from '../../../service/book-file.service';
import {BookMetadataManageService} from '../../../service/book-metadata-manage.service';
import {UserService} from '../../../../settings/user-management/user.service';
import {EmailService} from '../../../../settings/email-v2/email.service';
import {UrlHelperService} from '../../../../../shared/service/url-helper.service';
import {BookDialogHelperService} from '../book-dialog-helper.service';
import {TaskHelperService} from '../../../../settings/task-management/task-helper.service';
import {BookNavigationService} from '../../../service/book-navigation.service';
import {AppSettingsService} from '../../../../../shared/service/app-settings.service';
import {ReadStatusHelper} from '../../../helpers/read-status.helper';

function createBook(overrides: Partial<Book>): Book {
  return {
    id: overrides.id ?? 1,
    libraryId: overrides.libraryId ?? 1,
    libraryName: overrides.libraryName ?? 'Library',
    ...overrides,
  } as Book;
}

describe('BookCardComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookCardComponent],
      providers: [
        { provide: BookService, useValue: { updateBookReadStatus: vi.fn(() => of(null)), readBook: vi.fn() } },
        { provide: BookFileService, useValue: {} },
        { provide: BookMetadataManageService, useValue: {} },
        { provide: TaskHelperService, useValue: {} },
        { provide: UserService, useValue: { userState$: of({ loaded: true, user: { userSettings: {} } }) } },
        { provide: EmailService, useValue: {} },
        { provide: MessageService, useValue: { add: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: UrlHelperService,
          useValue: {
            getThumbnailUrl: vi.fn(() => 'thumb'),
            getAudiobookThumbnailUrl: vi.fn(() => 'audio-thumb'),
          },
        },
        { provide: ConfirmationService, useValue: { confirm: vi.fn() } },
        { provide: BookDialogHelperService, useValue: {} },
        { provide: BookNavigationService, useValue: {} },
        { provide: AppSettingsService, useValue: { appSettings$: of({ diskType: 'LOCAL' }) } },
        {
          provide: TranslocoService,
          useValue: {
            translate: vi.fn((key: string, params?: Record<string, unknown>) => params?.['title'] ? `${key}:${params['title']}` : key),
          },
        },
        {
          provide: ReadStatusHelper,
          useValue: {
            getReadStatusIcon: vi.fn(() => ''),
            getReadStatusClass: vi.fn(() => ''),
            getReadStatusTooltip: vi.fn(() => ''),
            shouldShowStatusIcon: vi.fn(() => false),
          },
        },
      ],
    }).compileComponents();
  });

  function createComponent(): BookCardComponent {
    const fixture = TestBed.createComponent(BookCardComponent);
    return fixture.componentInstance;
  }

  it('recomputes the displayed title when showSubtitle changes', () => {
    const component = createComponent();
    component.book = createBook({
      metadata: {
        title: 'Main Title',
        subtitle: 'Subtitle',
      } as Book['metadata'],
      primaryFile: { id: 1, bookId: 1, fileName: 'main-title.cbz', bookType: 'CBX' },
    });
    component.showSubtitle = false;
    component.ngOnInit();

    expect(component.displayTitle).toBe('Main Title');

    component.showSubtitle = true;
    component.ngOnChanges({
      showSubtitle: new SimpleChange(false, true, false),
    });

    expect(component.displayTitle).toBe('Main Title : Subtitle');
  });

  it('emits a single checkbox selection event when toggled', () => {
    const component = createComponent();
    const emitted = vi.fn();

    component.book = createBook({ id: 12 });
    component.index = 4;
    component.isCheckboxEnabled = true;
    component.checkboxClick.subscribe(emitted);

    component.toggleCardSelection(true);

    expect(emitted).toHaveBeenCalledOnce();
    expect(emitted).toHaveBeenCalledWith({
      index: 4,
      book: component.book,
      selected: true,
      shiftKey: false,
    });
  });
});
