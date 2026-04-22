import {TestBed} from '@angular/core/testing';
import {BehaviorSubject, of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {MessageService} from 'primeng/api';

import {MetadataPickerComponent} from './metadata-picker.component';
import {BookService} from '../../../../book/service/book.service';
import {BookMetadataManageService} from '../../../../book/service/book-metadata-manage.service';
import {UrlHelperService} from '../../../../../shared/service/url-helper.service';
import {AppSettingsService} from '../../../../../shared/service/app-settings.service';
import {Book, BookMetadata} from '../../../../book/model/book.model';

describe('MetadataPickerComponent save button state', () => {
  const bookState$ = new BehaviorSubject({loaded: true, books: [] as Book[]});
  const updateBookMetadata = vi.fn(() => of({}));
  const uploadAudiobookCoverFromUrl = vi.fn(() => of(void 0));

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [
        MetadataPickerComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              metadata: {
                picker: {
                  saveChangesBtn: 'Save Changes',
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
          provide: MessageService,
          useValue: {
            add: vi.fn(),
          },
        },
        {
          provide: BookService,
          useValue: {
            bookState$,
          },
        },
        {
          provide: BookMetadataManageService,
          useValue: {
            updateBookMetadata,
            uploadAudiobookCoverFromUrl,
          },
        },
        {
          provide: UrlHelperService,
          useValue: {
            getThumbnailUrl: vi.fn(() => 'http://example.com/thumb.jpg'),
            getCoverUrl: vi.fn(() => 'http://example.com/cover.jpg'),
            getAudiobookCoverUrl: vi.fn(() => 'http://example.com/audio-cover.jpg'),
          },
        },
        {
          provide: AppSettingsService,
          useValue: {
            appSettings$: of(null),
          },
        },
      ],
    }).compileComponents();
  });

  function createMetadata(overrides: Partial<BookMetadata> = {}): BookMetadata {
    return {
      bookId: 1,
      title: 'Current Title',
      authors: [],
      categories: [],
      tags: [],
      moods: [],
      comicMetadata: {},
      ...overrides,
    } as BookMetadata;
  }

  function createComponent() {
    const fixture = TestBed.createComponent(MetadataPickerComponent);
    const component = fixture.componentInstance;

    component.reviewMode = false;
    component.fetchedMetadata = createMetadata({
      title: 'Fetched Title',
      provider: 'Google',
      thumbnailUrl: 'http://example.com/fetched.jpg',
    });
    component.book$ = of({
      id: 1,
      metadata: createMetadata(),
    } as Book);

    fixture.detectChanges();
    return {fixture, component};
  }

  function getSaveButton(fixture: {nativeElement: HTMLElement}): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.rail-right button[type="submit"]') as HTMLButtonElement;
  }

  it('shows Saved after successful save and resets to Save Changes on next edit', async () => {
    const {fixture, component} = createComponent();

    expect(getSaveButton(fixture).textContent).toContain('Save Changes');

    getSaveButton(fixture).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(updateBookMetadata).toHaveBeenCalledTimes(1);
    expect(getSaveButton(fixture).textContent).toContain('Saved');

    component.metadataForm.get('title')?.setValue('Edited title');
    fixture.detectChanges();

    expect(getSaveButton(fixture).textContent).toContain('Save Changes');
  });
});
