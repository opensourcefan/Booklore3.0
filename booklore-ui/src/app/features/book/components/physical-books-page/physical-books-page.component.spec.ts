import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {TestBed} from '@angular/core/testing';
import {BehaviorSubject, of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {Router} from '@angular/router';
import {TranslocoService} from '@jsverse/transloco';
import {BookService} from '../../service/book.service';
import {LibraryService} from '../../service/library.service';
import {LocalStorageService} from '../../../../shared/service/local-storage.service';
import {PageTitleService} from '../../../../shared/service/page-title.service';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {ReadStatusHelper} from '../../helpers/read-status.helper';
import {BookCardOverlayPreferenceService} from '../book-browser/book-card-overlay-preference.service';
import {PhysicalBooksPageComponent} from './physical-books-page.component';
import {Book} from '../../model/book.model';

function createBook(overrides: Partial<Book>): Book {
  return {
    id: overrides.id ?? 1,
    libraryId: overrides.libraryId ?? 1,
    libraryName: overrides.libraryName ?? 'Library',
    isPhysical: overrides.isPhysical ?? true,
    metadata: overrides.metadata ?? ({ bookId: overrides.id ?? 1, title: 'Physical Title' } as Book['metadata']),
    primaryFile: overrides.primaryFile ?? { id: 1, bookId: overrides.id ?? 1, fileName: 'physical-title.cbz', bookType: 'CBX' },
    ...overrides,
  } as Book;
}

describe('PhysicalBooksPageComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: BookService,
          useValue: {
            bookState$: new BehaviorSubject({ loaded: true, error: null, books: [] }),
          },
        },
        {
          provide: LibraryService,
          useValue: {
            libraryState$: new BehaviorSubject({ loaded: true, error: null, libraries: [] }),
          },
        },
        { provide: LocalStorageService, useValue: { get: vi.fn(() => null) } },
        { provide: PageTitleService, useValue: { setPageTitle: vi.fn() } },
        {
          provide: TranslocoService,
          useValue: {
            translate: vi.fn((key: string) => key),
            getActiveLang: vi.fn(() => 'en'),
            langChanges$: of('en'),
          },
        },
        {
          provide: UrlHelperService,
          useValue: {
            getThumbnailUrl: vi.fn(() => 'thumb'),
            getAudiobookThumbnailUrl: vi.fn(() => 'audio-thumb'),
            getCoverUrl: vi.fn(() => 'cover'),
            getAudiobookCoverUrl: vi.fn(() => 'audio-cover'),
          },
        },
        {
          provide: ReadStatusHelper,
          useValue: {
            getReadStatusIcon: vi.fn(() => ''),
            getReadStatusClass: vi.fn(() => 'status-unset'),
            shouldShowStatusIcon: vi.fn(() => false),
          },
        },
        {
          provide: BookCardOverlayPreferenceService,
          useValue: {
            showBookTypePill$: of(true),
            showAiPanelData$: of(true),
            showIssueNumber$: of(true),
          },
        },
        { provide: Router, useValue: { url: '/book/physical' } },
      ],
    });
  });

  function createComponent(): PhysicalBooksPageComponent {
    return TestBed.runInInjectionContext(() => new PhysicalBooksPageComponent());
  }

  it('opens and closes the mobile viewer when the same title is activated twice', () => {
    const component = createComponent();
    const first = createBook({ id: 11, metadata: { bookId: 11, title: 'Alpha' } as Book['metadata'] });
    const second = createBook({ id: 22, metadata: { bookId: 22, title: 'Beta' } as Book['metadata'] });

    component.screenWidth = 390;

    component.toggleMobileBookViewer([
      { key: 'library:1', libraryId: 1, libraryName: 'Main', books: [first, second] },
    ], first);

    expect(component.isMobileViewerOpen).toBe(true);
    expect(component.activeMobileViewerBook?.id).toBe(11);
    expect(component.mobileViewerBooks.map(book => book.id)).toEqual([11, 22]);

    component.toggleMobileBookViewer([
      { key: 'library:1', libraryId: 1, libraryName: 'Main', books: [first, second] },
    ], first);

    expect(component.isMobileViewerOpen).toBe(false);
    expect(component.activeMobileViewerBook).toBeNull();
  });

  it('closes the mobile viewer on popstate to match Android edge-swipe back behavior', () => {
    const component = createComponent();
    const first = createBook({ id: 66, metadata: { bookId: 66, title: 'Popstate Viewer' } as Book['metadata'] });
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;

    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 844 });

    try {
      component.screenWidth = 390;
      component.screenHeight = 844;
      component.toggleMobileBookViewer([
        { key: 'library:1', libraryId: 1, libraryName: 'Main', books: [first] },
      ], first);

      expect(component.isMobileViewerOpen).toBe(true);

      window.dispatchEvent(new PopStateEvent('popstate'));

      expect(component.isMobileViewerOpen).toBe(false);
      expect(component.activeMobileViewerBook).toBeNull();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: originalWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: originalHeight });
    }
  });

  it('opens the mobile viewer on compact landscape phone-sized viewports', () => {
    const component = createComponent();
    const first = createBook({ id: 33, metadata: { bookId: 33, title: 'Landscape Phone Asset' } as Book['metadata'] });

    component.screenWidth = 915;
    component.screenHeight = 412;

    component.toggleMobileBookViewer([
      { key: 'library:1', libraryId: 1, libraryName: 'Main', books: [first] },
    ], first);

    expect(component.isMobileInteractionMode).toBe(true);
    expect(component.isMobileViewerOpen).toBe(true);
    expect(component.activeMobileViewerBook?.id).toBe(33);
  });

  it('does not open the mobile viewer on wide desktop-like viewports', () => {
    const component = createComponent();
    const first = createBook({ id: 44, metadata: { bookId: 44, title: 'Desktop Asset' } as Book['metadata'] });

    component.screenWidth = 1280;
    component.screenHeight = 720;

    component.toggleMobileBookViewer([
      { key: 'library:1', libraryId: 1, libraryName: 'Main', books: [first] },
    ], first);

    expect(component.isMobileInteractionMode).toBe(false);
    expect(component.isMobileViewerOpen).toBe(false);
    expect(component.activeMobileViewerBook).toBeNull();
  });

  it('computes a dedicated mobile viewport height for the scroll shell', () => {
    const component = createComponent();

    component.screenWidth = 390;
    component.screenHeight = 844;
    expect(component.pageViewportHeight).toBe('calc(100dvh - 4.4rem)');

    component.screenWidth = 915;
    component.screenHeight = 412;
    expect(component.pageViewportHeight).toBe('calc(100dvh - 4.4rem)');

    component.screenWidth = 1280;
    component.screenHeight = 800;
    expect(component.pageViewportHeight).toBe('calc(100dvh - 6.25rem)');
  });

  it('keeps the title activation output inside the book card tag in the template', () => {
    const templatePath = join(process.cwd(), 'src/app/features/book/components/physical-books-page/physical-books-page.component.html');
    const template = readFileSync(templatePath, 'utf8');

    expect(template).toMatch(/<app-book-card[\s\S]*\(titleAreaActivated\)="toggleMobileBookViewer\(vm\.groups, \$event\)"[\s\S]*>\s*<\/app-book-card>/);
    expect(template).not.toMatch(/<app-book-card[\s\S]*>\s*\(titleAreaActivated\)="toggleMobileBookViewer\(vm\.groups, \$event\)"/);
    expect(template).toContain('[titleAreaInteractive]="isMobileInteractionMode"');
    expect(template).not.toContain('[titleAreaInteractive]="screenWidth < mobileBreakpoint"');
  });

  it('uses the full cover endpoint for enlarged mobile viewer images', () => {
    const component = createComponent();
    const regularBook = createBook({ id: 55, metadata: { bookId: 55, title: 'Regular Viewer' } as Book['metadata'] });
    const audiobook = createBook({
      id: 56,
      metadata: { bookId: 56, title: 'Audio Viewer' } as Book['metadata'],
      primaryFile: { id: 2, bookId: 56, fileName: 'audio-viewer.m4b', bookType: 'AUDIOBOOK' },
    });

    expect(component.getViewerCoverUrl(regularBook)).toBe('cover');
    expect(component.getViewerCoverUrl(audiobook)).toBe('audio-cover');
  });

  it('top-aligns shelf cards so cover rows stay level when titles wrap', () => {
    const stylesPath = join(process.cwd(), 'src/app/features/book/components/physical-books-page/physical-books-page.component.scss');
    const styles = readFileSync(stylesPath, 'utf8');
    const shelfGridBlock = styles.match(/\.physical-shelf-grid\s*\{[\s\S]*?\}/);

    expect(shelfGridBlock?.[0]).toContain('align-items: start;');
    expect(shelfGridBlock?.[0]).not.toContain('align-items: end;');
  });
});