import {AsyncPipe} from '@angular/common';
import {Component, EventEmitter, Input, Output} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {By} from '@angular/platform-browser';
import {convertToParamMap, ActivatedRoute, Router} from '@angular/router';
import {TranslocoDirective, TranslocoTestingModule} from '@jsverse/transloco';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {of} from 'rxjs';
import {Button} from 'primeng/button';
import {InputText} from 'primeng/inputtext';
import {MultiSelect} from 'primeng/multiselect';
import {Tooltip} from 'primeng/tooltip';

import {Book, BookMetadata} from '../../../../book/model/book.model';
import {BookMetadataService} from '../../../../book/service/book-metadata.service';
import {BookNavigationService} from '../../../../book/service/book-navigation.service';
import {UserService} from '../../../../settings/user-management/user.service';
import {AppSettingsService} from '../../../../../shared/service/app-settings.service';
import {BookMetadataHostService} from '../../../../../shared/service/book-metadata-host.service';
import {UrlHelperService} from '../../../../../shared/service/url-helper.service';
import {Image} from 'primeng/image';

import {MetadataSearcherComponent} from './metadata-searcher.component';

@Component({
  selector: 'app-metadata-picker',
  standalone: true,
  template: `
    <div class="picker-proxy">
      <button class="picker-prev" type="button" (click)="navigatePreviousRequested.emit()">prev</button>
      <span class="picker-position">{{ navigationPosition }}</span>
      <button class="picker-next" type="button" (click)="navigateNextRequested.emit()">next</button>
    </div>
  `
})
class StubMetadataPickerComponent {
  @Input() fetchedMetadata!: BookMetadata;
  @Input() book$!: unknown;
  @Input() detailLoading = false;
  @Input() showNavigationControls = false;
  @Input() canNavigatePrevious = false;
  @Input() canNavigateNext = false;
  @Input() navigationPosition = '';
  @Input() previousNavigationTooltip = '';
  @Input() nextNavigationTooltip = '';

  @Output() goBack = new EventEmitter<boolean>();
  @Output() navigatePreviousRequested = new EventEmitter<void>();
  @Output() navigateNextRequested = new EventEmitter<void>();
}

describe('MetadataSearcherComponent control rail integration', () => {
  beforeEach(async () => {
    TestBed.overrideComponent(MetadataSearcherComponent, {
      set: {
        imports: [
          ReactiveFormsModule,
          FormsModule,
          Button,
          InputText,
          StubMetadataPickerComponent,
          MultiSelect,
          AsyncPipe,
          Tooltip,
          TranslocoDirective,
          Image,
        ],
      },
    });

    await TestBed.configureTestingModule({
      imports: [
        MetadataSearcherComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              metadata: {
                viewer: {
                  navigationPosition: '{{current}} / {{total}}',
                  goToPreviousBook: 'Previous',
                  goToNextBook: 'Next',
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
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({id: '1'})),
          },
        },
        {
          provide: Router,
          useValue: {
            navigate: vi.fn(),
          },
        },
        {
          provide: BookMetadataService,
          useValue: {
            fetchBookMetadata: vi.fn().mockReturnValue(of({} as BookMetadata)),
            fetchMetadataDetail: vi.fn().mockReturnValue(of({} as BookMetadata)),
          },
        },
        {
          provide: AppSettingsService,
          useValue: {
            appSettings$: of({
              autoBookSearch: false,
              metadataProviderSettings: {
                google: {enabled: true},
              },
            }),
          },
        },
        {
          provide: UserService,
          useValue: {
            userState$: of({
              loaded: true,
              user: {
                userSettings: {
                  metadataCenterViewMode: 'dialog',
                },
              },
            }),
          },
        },
        {
          provide: BookNavigationService,
          useValue: {
            getNavigationState: vi.fn(() => of({current: 2, total: 3})),
            canNavigatePrevious: vi.fn(() => true),
            canNavigateNext: vi.fn(() => true),
            getPreviousBookId: vi.fn(() => null),
            getNextBookId: vi.fn(() => null),
            getCurrentPosition: vi.fn(() => ({current: 2, total: 3})),
            updateCurrentBook: vi.fn(),
          },
        },
        {
          provide: BookMetadataHostService,
          useValue: {
            switchBook: vi.fn(),
          },
        },
        {
          provide: UrlHelperService,
          useValue: {
            getCoverUrl: vi.fn().mockReturnValue('test-cover.jpg'),
            getAudiobookCoverUrl: vi.fn().mockReturnValue('test-audiobook-cover.jpg'),
          },
        },
      ],
    }).compileComponents();
  });

  it('renders navigation via picker control rail and removes legacy navigation row', () => {
    const fixture = TestBed.createComponent(MetadataSearcherComponent);
    const component = fixture.componentInstance;

    component.book$ = of(createBook(1));
    component.showNavigationButtons = true;
    component.totalBooks = 3;
    component.currentBookPosition = 2;

    fixture.detectChanges();
    component.selectedFetchedMetadata$.next({title: 'Fetched Book'} as BookMetadata);
    fixture.detectChanges();

    const pickerDebug = fixture.debugElement.query(By.directive(StubMetadataPickerComponent));
    const pickerComponent = pickerDebug.componentInstance as StubMetadataPickerComponent;

    expect((fixture.nativeElement as HTMLElement).querySelector('.search-navigation-row')).toBeNull();
    expect(pickerComponent.showNavigationControls).toBe(true);
    expect(pickerComponent.navigationPosition).toBe('2 / 3');
  });

  it('emits previous-book navigation when picker previous button is clicked', () => {
    const fixture = TestBed.createComponent(MetadataSearcherComponent);
    const component = fixture.componentInstance;

    component.book$ = of(createBook(1));
    component.showNavigationButtons = true;

    fixture.detectChanges();
    component.selectedFetchedMetadata$.next({title: 'Fetched Book'} as BookMetadata);
    fixture.detectChanges();

    const emitSpy = vi.spyOn(component.previousBookClicked, 'emit');
    const prevButton = (fixture.nativeElement as HTMLElement).querySelector('.picker-prev') as HTMLButtonElement;

    prevButton.click();

    expect(emitSpy).toHaveBeenCalledTimes(1);
  });
});

function createBook(id: number): Book {
  return {
    id,
    metadata: {
      bookId: id,
      title: 'Book Title',
      authors: ['Author'],
      isbn13: '1234567890123',
      externalUrl: '',
    } as BookMetadata,
  } as Book;
}
