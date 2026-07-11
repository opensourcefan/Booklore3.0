import {TestBed} from '@angular/core/testing';
import {BehaviorSubject, of, Subject} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {MessageService} from 'primeng/api';

import {MetadataPickerComponent} from './metadata-picker.component';
import {BookService} from '../../../../book/service/book.service';
import {BookMetadataManageService} from '../../../../book/service/book-metadata-manage.service';
import {UrlHelperService} from '../../../../../shared/service/url-helper.service';
import {AppSettingsService} from '../../../../../shared/service/app-settings.service';
import {WriteProgressService} from '../../../../../shared/service/write-progress.service';
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
    component.metadataFieldsTop = [];
    component.metadataChips = [];
    component.metadataDescription = [];
    component.metadataSeriesFields = [];
    component.metadataBookDetailsFields = [];
    component.metadataProviderFields = [];
    component.metadataFieldsBottom = [];
    component.audiobookMetadataFields = [];
    component.comicTextFields = [];
    component.comicArrayFields = [];
    component.comicTextareaFields = [];
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

  it('shows Saved after successful save and resets to Save Changes on next edit', () => {
    const {fixture, component} = createComponent();

    expect(getSaveButton(fixture).textContent).toContain('Save Changes');
    expect(getSaveButton(fixture).disabled).toBe(false);
    expect(getSaveButton(fixture).getAttribute('data-p-severity')).toBe('secondary');

    const titleControl = component.metadataForm.get('title');
    expect(titleControl).toBeTruthy();
    titleControl!.enable({emitEvent: false});
    titleControl!.setValue('Edited before save');
    titleControl!.markAsDirty();
    component.saveStatus.onUserEdit(true);
    fixture.detectChanges();

    expect(component.saveSeverity).toBe('warn');
    expect(getSaveButton(fixture).disabled).toBe(false);
    expect(getSaveButton(fixture).getAttribute('data-p-severity')).toBe('warn');

    getSaveButton(fixture).click();
    fixture.detectChanges();

    expect(updateBookMetadata).toHaveBeenCalledTimes(1);
    expect(getSaveButton(fixture).textContent).toContain('Saved');
    expect(getSaveButton(fixture).getAttribute('data-p-severity')).toBe('success');

    titleControl!.setValue('Edited title');
    titleControl!.markAsDirty();
    component.saveStatus.onUserEdit(true);
    fixture.detectChanges();

    expect(component.showSavedState).toBe(false);
    expect(getSaveButton(fixture).getAttribute('data-p-severity')).toBe('warn');
  }, 10000);

  it('renders a loading icon and loading state while a save is in progress', () => {
    const pendingSave = new Subject<object>();
    updateBookMetadata.mockReturnValueOnce(pendingSave);

    const {fixture, component} = createComponent();
    const titleControl = component.metadataForm.get('title');
    titleControl!.enable({emitEvent: false});
    titleControl!.setValue('Dirty for save');
    titleControl!.markAsDirty();
    component.saveStatus.onUserEdit(true);
    fixture.detectChanges();
    const saveButton = getSaveButton(fixture);

    saveButton.click();
    fixture.detectChanges();

    const loadingIcon = saveButton.querySelector('.p-button-loading-icon.pi.pi-spin.pi-spinner');
    const svgSpinner = saveButton.querySelector('svg[data-p-icon="spinner"]');

    expect(loadingIcon).not.toBeNull();
    expect(svgSpinner).toBeNull();
    expect(saveButton.classList.contains('p-button-loading')).toBe(true);

    pendingSave.complete();
  });
});
