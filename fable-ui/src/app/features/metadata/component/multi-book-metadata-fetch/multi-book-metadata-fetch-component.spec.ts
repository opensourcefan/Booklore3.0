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
    const bookListSection = root.querySelector('.book-list-section.metadata-section-panel') as HTMLElement;
    const framedBookList = root.querySelector('.book-list-container.book-list-frame') as HTMLElement;
    const bookItems = Array.from(root.querySelectorAll('.book-list li'));

    expect(bookListSection).not.toBeNull();
    expect(framedBookList).not.toBeNull();
    expect(bookItems).toHaveLength(2);
    expect(bookItems[0].textContent).toContain('#10');
    expect(bookItems[0].textContent).toContain('Alpha');
    expect(bookItems[1].textContent).toContain('#20');
    expect(bookItems[1].textContent).toContain('Beta');
  }, 15000);

  it('anchors the controls rail directly below the header and keeps scroll content underneath it', () => {
    const fixture = TestBed.createComponent(MultiBookMetadataFetchComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const header = root.querySelector('.panel-header') as HTMLElement;
    const railShell = root.querySelector('.dialog-top-control-rail-shell') as HTMLElement;
    const dialogContent = root.querySelector('.dialog-content') as HTMLElement;
    const scrollContent = root.querySelector('.dialog-scroll-content') as HTMLElement;
    const rail = railShell.querySelector('.top-control-rail') as HTMLElement;
    const childRail = scrollContent.querySelector('app-metadata-fetch-options .top-control-rail') as HTMLElement | null;

    expect(railShell).not.toBeNull();
    expect(rail).not.toBeNull();
    expect(header.nextElementSibling).toBe(railShell);
    expect(railShell.nextElementSibling).toBe(dialogContent);
    expect(scrollContent.firstElementChild?.classList.contains('book-list-section')).toBe(true);
    expect(childRail).toBeNull();
  }, 15000);
});