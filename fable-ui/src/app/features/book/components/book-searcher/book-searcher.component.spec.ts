import {ComponentFixture, TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {provideRouter} from '@angular/router';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {BookSearcherComponent} from './book-searcher.component';
import {BookService} from '../../service/book.service';
import {AppSettingsService} from '../../../../shared/service/app-settings.service';
import {AiSearchDialogService} from '../ai-search-dialog/ai-search-dialog.component';
import {AiSearchScanProgressService} from '../../../../shared/service/ai-search-scan-progress.service';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';

describe('BookSearcherComponent focusInput (DOM)', () => {
  let fixture: ComponentFixture<BookSearcherComponent>;
  let component: BookSearcherComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        BookSearcherComponent,
        TranslocoTestingModule.forRoot({
          langs: {en: {}},
          translocoConfig: {
            availableLangs: ['en'],
            defaultLang: 'en'
          }
        })
      ],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        {
          provide: BookService,
          useValue: {
            getBooksPaged: () => of({content: []})
          }
        },
        {
          provide: AppSettingsService,
          useValue: {
            appSettings$: of({aiSearchEnabled: false}),
            getAiSearchServiceStatus: () => of({status: 'READY'})
          }
        },
        {
          provide: AiSearchDialogService,
          useValue: {
            open: vi.fn(),
            searchActive$: of(false),
            searchError$: of(false)
          }
        },
        {
          provide: AiSearchScanProgressService,
          useValue: {progress$: of(null)}
        },
        {
          provide: UrlHelperService,
          useValue: {getThumbnailUrl: () => ''}
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(BookSearcherComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('focusInput makes the search input document.activeElement', () => {
    const input = fixture.nativeElement.querySelector('input.search-input') as HTMLInputElement;
    expect(input).toBeTruthy();

    component.focusInput();

    expect(document.activeElement).toBe(input);
    expect(component.isSearchFocused).toBe(true);
  });

  it('blurInput removes focus from the search input', () => {
    const input = fixture.nativeElement.querySelector('input.search-input') as HTMLInputElement;
    component.focusInput();
    expect(document.activeElement).toBe(input);

    component.blurInput();

    expect(document.activeElement).not.toBe(input);
    expect(component.isSearchFocused).toBe(false);
  });
});
