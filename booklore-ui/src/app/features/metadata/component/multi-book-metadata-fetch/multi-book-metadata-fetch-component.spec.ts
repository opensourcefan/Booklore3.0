import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {of} from 'rxjs';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {MessageService} from 'primeng/api';

import {MultiBookMetadataFetchComponent} from './multi-book-metadata-fetch-component';
import {BookService} from '../../../book/service/book.service';
import {AppSettingsService} from '../../../../shared/service/app-settings.service';
import {TaskHelperService} from '../../../settings/task-management/task-helper.service';
import {MetadataTaskService} from '../../../book/service/metadata-task';

describe('MultiBookMetadataFetchComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MultiBookMetadataFetchComponent, TranslocoTestingModule.forRoot({langs: {}})],
      providers: [
        {
          provide: DynamicDialogConfig,
          useValue: {
            data: {
              bookIds: [10, 20],
              metadataRefreshType: 'BOOKS',
            },
          },
        },
        {
          provide: DynamicDialogRef,
          useValue: {
            close: vi.fn(),
          },
        },
        {
          provide: BookService,
          useValue: {
            getBooksByIdsFromState: vi.fn().mockReturnValue([
              {id: 10, metadata: {title: 'Alpha'}},
              {id: 20, metadata: {title: 'Beta'}},
            ]),
          },
        },
        {
          provide: AppSettingsService,
          useValue: {
            appSettings$: of({
              defaultMetadataRefreshOptions: {
                libraryId: null,
                refreshCovers: false,
                replaceMode: 'REPLACE_MISSING',
                fieldOptions: {},
                enabledFields: {},
                sourceUrl: '',
                issueNumber: '',
                issueRange: '',
              },
            }),
          },
        },
        {
          provide: TaskHelperService,
          useValue: {
            refreshMetadataTask: vi.fn().mockReturnValue(of(void 0)),
          },
        },
        {
          provide: MetadataTaskService,
          useValue: {
            getLatestResumableTask: vi.fn().mockReturnValue(of(null)),
            resumeTask: vi.fn().mockReturnValue(of(void 0)),
          },
        },
        {
          provide: MessageService,
          useValue: {
            add: vi.fn(),
          },
        },
      ],
    }).compileComponents();
  });

  it('renders the selected books inside the shared content frame', () => {
    const fixture = TestBed.createComponent(MultiBookMetadataFetchComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const framedBookList = root.querySelector('.book-list-container.book-list-frame') as HTMLElement;
    const bookItems = Array.from(root.querySelectorAll('.book-list li'));

    expect(framedBookList).not.toBeNull();
    expect(bookItems).toHaveLength(2);
    expect(bookItems[0].textContent).toContain('#10');
    expect(bookItems[0].textContent).toContain('Alpha');
    expect(bookItems[1].textContent).toContain('#20');
    expect(bookItems[1].textContent).toContain('Beta');
  }, 15000);
});