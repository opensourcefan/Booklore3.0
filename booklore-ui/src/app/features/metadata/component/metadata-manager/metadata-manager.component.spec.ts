import {TestBed} from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {Location} from '@angular/common';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MessageService} from 'primeng/api';
import {of} from 'rxjs';

import {PageTitleService} from '../../../../shared/service/page-title.service';
import {WriteProgressService} from '../../../../shared/service/write-progress.service';
import {BookService} from '../../../book/service/book.service';
import {BookMetadataManageService} from '../../../book/service/book-metadata-manage.service';

import {MetadataManagerComponent} from './metadata-manager.component';

class ResizeObserverMock {
  observe(): void {
    return;
  }

  unobserve(): void {
    return;
  }

  disconnect(): void {
    return;
  }
}

describe('MetadataManagerComponent route return button', () => {
  const navigate = vi.fn();
  const back = vi.fn();

  beforeEach(async () => {
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    navigate.mockReset();
    back.mockReset();

    await TestBed.configureTestingModule({
      imports: [
        MetadataManagerComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              common: {
                cancel: 'Cancel',
                save: 'Save',
              },
              metadata: {
                manager: {
                  title: 'Metadata Manager',
                  description: 'Manage metadata values.',
                  writeToFileWarning: 'Warning',
                  tabs: {
                    author: 'Author',
                    authors: 'Authors',
                    genre: 'Genre',
                    genres: 'Genres',
                    mood: 'Mood',
                    moods: 'Moods',
                    tag: 'Tag',
                    tags: 'Tags',
                    series: 'Series',
                    seriesPlural: 'Series',
                    publisher: 'Publisher',
                    publishers: 'Publishers',
                    language: 'Language',
                    languages: 'Languages',
                  },
                  placeholders: {
                    searchAuthors: 'Search authors',
                    searchGenres: 'Search genres',
                    searchMoods: 'Search moods',
                    searchTags: 'Search tags',
                    searchSeries: 'Search series',
                    searchPublishers: 'Search publishers',
                    searchLanguages: 'Search languages',
                  },
                  clearSelection: 'Clear selection',
                  deleteSelected: 'Delete selected',
                  mergeSplitSelected: 'Merge / split selected',
                  booksColumn: 'Books',
                  actionsColumn: 'Actions',
                  selectSimilarTooltip: 'Select similar',
                  renameSplitTooltip: 'Rename / split',
                  deleteTooltip: 'Delete',
                },
              },
            },
          },
          translocoConfig: {
            availableLangs: ['en'],
            defaultLang: 'en',
          },
        }),
      ],
      providers: [
        {
          provide: BookService,
          useValue: {
            bookState$: of({loaded: true, books: []}),
          },
        },
        {
          provide: BookMetadataManageService,
          useValue: {},
        },
        {
          provide: MessageService,
          useValue: {
            add: vi.fn(),
          },
        },
        {
          provide: Router,
          useValue: {
            navigate,
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: of({tab: 'authors'}),
          },
        },
        {
          provide: Location,
          useValue: {
            back,
          },
        },
        {
          provide: PageTitleService,
          useValue: {
            setPageTitle: vi.fn(),
          },
        },
        {
          provide: WriteProgressService,
          useValue: {
            show: vi.fn(),
            complete: vi.fn(),
            fail: vi.fn(),
          },
        },
      ],
    }).compileComponents();
  });

  it('renders the shared text-style back arrow button', () => {
    const fixture = TestBed.createComponent(MetadataManagerComponent);

    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector('.route-return-control button');

    expect(button).not.toBeNull();
    expect(button?.classList.contains('p-button-text')).toBe(true);
    expect(button?.classList.contains('p-button-outlined')).toBe(false);
  });

  it('navigates back when the route return button is clicked', () => {
    const fixture = TestBed.createComponent(MetadataManagerComponent);

    fixture.detectChanges();

    const button = (fixture.nativeElement as HTMLElement).querySelector('.route-return-control button') as HTMLButtonElement;
    button.click();

    expect(back).toHaveBeenCalledTimes(1);
  });
});