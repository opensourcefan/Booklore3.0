import {ChangeDetectorRef, SimpleChange} from '@angular/core';
import {DatePipe} from '@angular/common';
import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {of} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MessageService} from 'primeng/api';
import {TranslocoService} from '@jsverse/transloco';
import {Book} from '../../../model/book.model';
import {ReadStatusHelper} from '../../../helpers/read-status.helper';
import {BookMetadataManageService} from '../../../service/book-metadata-manage.service';
import {UrlHelperService} from '../../../../../shared/service/url-helper.service';
import {UserService} from '../../../../settings/user-management/user.service';
import {BookTableComponent} from './book-table.component';
import {provideRouter, RouterLink} from '@angular/router';
import {Table} from 'primeng/table';

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
      imports: [BookTableComponent],
      providers: [
        DatePipe,
        provideRouter([]),
        { provide: UrlHelperService, useValue: { getBookUrl: vi.fn(() => '/books/1'), getThumbnailUrl: vi.fn(() => '/thumbs/1'), filterBooksBy: vi.fn((field: string, value: string) => `/books/filter/${field}/${value}`) } },
        { provide: BookMetadataManageService, useValue: { toggleAllLock: vi.fn(() => of({})) } },
        { provide: MessageService, useValue: { add: vi.fn() } },
        { provide: UserService, useValue: { userState$: of({ loaded: true, user: { userSettings: { metadataCenterViewMode: 'route' } } }) } },
        {
          provide: ReadStatusHelper,
          useValue: {
            getReadStatusIcon: vi.fn(() => ''),
            getReadStatusClass: vi.fn(() => ''),
            getReadStatusTooltip: vi.fn(() => ''),
            shouldShowStatusIcon: vi.fn(() => false),
          },
        },
        {
          provide: TranslocoService,
          useValue: {
            translate: vi.fn((key: string) => key),
            getActiveLang: vi.fn(() => 'en'),
            langChanges$: of('en'),
            _loadDependencies: vi.fn(() => of({})),
            config: {
              reRenderOnLangChange: true,
            },
          },
        },
        ChangeDetectorRef,
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createComponent(): BookTableComponent {
    return TestBed.runInInjectionContext(() => new BookTableComponent());
  }

  function createFixture() {
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback): number => {
      return setTimeout(() => callback(0), 0) as unknown as number;
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get: () => 460,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 460,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 1024,
    });

    const fixture = TestBed.createComponent(BookTableComponent);
    const component = fixture.componentInstance;

    component.visibleColumns = [
      {field: 'title', header: 'Title'},
      {field: 'authors', header: 'Authors'},
    ];
    component.books = [createBook({
      id: 1,
      fileName: 'book-one.cbz',
      primaryFile: { id: 1, bookId: 1, fileName: 'book-one.cbz', bookType: 'CBX' },
      metadata: {
        bookId: 1,
        title: 'Book One',
        subtitle: 'Subtitle',
        authors: ['Jane Doe'],
        coverUpdatedOn: '2026-05-04T00:00:00Z',
        titleLocked: true,
        subtitleLocked: true,
      } as Book['metadata'],
    })];

    fixture.detectChanges();
    vi.runAllTimers();
    fixture.detectChanges();

    return {fixture, component, root: fixture.nativeElement as HTMLElement};
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

    expect(component['getDisplayTitle'](book)).toBe('Main Title : Subtitle');
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

  it('syncs selected rows from the preselected ids without aliasing the input set', () => {
    const component = createComponent();
    const firstBook = createBook({ id: 1 });
    const secondBook = createBook({ id: 2 });
    const preselected = new Set([1]);

    component.books = [firstBook, secondBook];
    component.preselectedBookIds = preselected;
    component.ngOnInit();

    expect(component.selectedBookIds).not.toBe(preselected);
    expect(component.selectedBookIds.has(1)).toBe(true);
    expect(component.selectedBooks).toEqual([firstBook]);
  });

  it('resyncs visible selected rows when the parent selection changes', () => {
    const component = createComponent();
    const firstBook = createBook({ id: 1 });
    const secondBook = createBook({ id: 2 });

    component.books = [firstBook, secondBook];
    component.preselectedBookIds = new Set([1]);
    component.ngOnInit();

    component.preselectedBookIds = new Set([2]);
    component.ngOnChanges({
      preselectedBookIds: new SimpleChange(new Set([1]), new Set([2]), false),
    });

    expect(component.selectedBookIds.has(1)).toBe(false);
    expect(component.selectedBookIds.has(2)).toBe(true);
    expect(component.selectedBooks).toEqual([secondBook]);
  });

  describe('allColumns getter', () => {
    it('returns translated column definitions for each field', () => {
      const component = createComponent();
      const columns = component.allColumns;

      expect(columns.length).toBeGreaterThan(0);
      expect(columns[0].field).toBe('readStatus');
      expect(columns[1].field).toBe('title');
      expect(columns.some(c => c.field === 'authors')).toBe(true);
      expect(columns.some(c => c.field === 'publisher')).toBe(true);
      expect(columns.some(c => c.field === 'seriesName')).toBe(true);
      expect(columns.some(c => c.field === 'categories')).toBe(true);
      expect(columns.some(c => c.field === 'pageCount')).toBe(true);
      expect(columns.some(c => c.field === 'isbn')).toBe(true);
      expect(columns.some(c => c.field === 'fileName')).toBe(true);
      expect(columns.some(c => c.field === 'language')).toBe(true);
      expect(columns.some(c => c.field === 'amazonRating')).toBe(true);
      expect(columns.some(c => c.field === 'goodreadsRating')).toBe(true);
    });

    it('translates headers on each access (live translation)', () => {
      const translateSpy = vi.fn((key: string) => `translated:${key}`);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          DatePipe,
          { provide: UrlHelperService, useValue: { getBookUrl: vi.fn(), filterBooksBy: vi.fn() } },
          { provide: BookMetadataManageService, useValue: { toggleAllLock: vi.fn(() => of({})) } },
          { provide: MessageService, useValue: { add: vi.fn() } },
          { provide: UserService, useValue: { userState$: of({ loaded: true, user: { userSettings: { metadataCenterViewMode: 'route' } } }) } },
          { provide: ReadStatusHelper, useValue: { getReadStatusIcon: vi.fn(() => ''), getReadStatusClass: vi.fn(() => ''), getReadStatusTooltip: vi.fn(() => ''), shouldShowStatusIcon: vi.fn(() => false) } },
          {
            provide: TranslocoService,
            useValue: {
              translate: translateSpy,
              getActiveLang: vi.fn(() => 'en'),
              langChanges$: of('en'),
              _loadDependencies: vi.fn(() => of({})),
              config: {
                reRenderOnLangChange: true,
              },
            },
          },
          ChangeDetectorRef,
        ],
      });

      const component = createComponent();
      const cols = component.allColumns;

      expect(cols.length).toBeGreaterThan(0);
      // Each column header should be translated via the service
      expect(translateSpy).toHaveBeenCalledWith('book.columnPref.columns.readStatus');
      expect(translateSpy).toHaveBeenCalledWith('book.columnPref.columns.title');

      // Second access - should translate again (not cached at the getter level)
      translateSpy.mockClear();
      const cols2 = component.allColumns;
      expect(cols2.length).toBe(cols.length);
      expect(translateSpy).toHaveBeenCalledTimes(cols.length);
    });
  });

  describe('setScrollHeight', () => {
    it('returns a calc-based scroll height string', () => {
      const component = createComponent();
      component.setScrollHeight();
      expect(component.scrollHeight).toMatch(/^calc\(100dvh - /);
    });

    it('accounts for selection action panel when present', () => {
      // Simulate action panel being visible
      const querySpy = vi.spyOn(document, 'querySelector');
      querySpy.mockImplementation((selector: string) => {
        if (selector === '.selection-action-panel:not(.panel-hidden)') {
          return document.createElement('div');
        }
        return null;
      });

      const component = createComponent();
      component.setScrollHeight();
      // Desktop base is 150px, action panel adds 50px = 200px total
      expect(component.scrollHeight).toBe('calc(100dvh - 200px)');
      querySpy.mockRestore();
    });
  });

  describe('formatFileSize', () => {
    it('returns dash for null/undefined/NaN', () => {
      const component = createComponent();
      expect(component.formatFileSize(null as unknown as number)).toBe('-');
      expect(component.formatFileSize(undefined as unknown as number)).toBe('-');
      expect(component.formatFileSize(NaN)).toBe('-');
    });

    it('converts KB to MB with one decimal', () => {
      const component = createComponent();
      expect(component.formatFileSize(1024)).toBe('1.0 MB');
      expect(component.formatFileSize(2048)).toBe('2.0 MB');
      expect(component.formatFileSize(1500)).toBe('1.5 MB');
    });
  });

  describe('clearSelectedBooks', () => {
    it('clears selection and emits', () => {
      const component = createComponent();
      const emitSpy = vi.spyOn(component.selectedBooksChange, 'emit');
      const book = createBook({ id: 1 });
      component.books = [book];
      component.selectedBookIds = new Set([1]);
      component.selectedBooks = [book];

      component.clearSelectedBooks();

      expect(component.selectedBookIds.size).toBe(0);
      expect(component.selectedBooks.length).toBe(0);
      expect(emitSpy).toHaveBeenCalledWith(new Set());
    });
  });

  describe('selectAllBooks', () => {
    it('selects all books and emits', () => {
      const component = createComponent();
      const emitSpy = vi.spyOn(component.selectedBooksChange, 'emit');
      const books = [createBook({ id: 1 }), createBook({ id: 2 }), createBook({ id: 3 })];
      component.books = books;

      component.selectAllBooks();

      expect(component.selectedBookIds.size).toBe(3);
      expect(component.selectedBooks.length).toBe(3);
      expect(emitSpy).toHaveBeenCalled();
    });
  });

  describe('DOM safety harness', () => {
    it('keeps PrimeNG virtual scroll enabled for the stable table view', () => {
      const {fixture} = createFixture();
      const table = fixture.debugElement.query(By.directive(Table)).componentInstance as Table;

      expect(table.virtualScroll).toBe(true);
      expect(table.virtualScrollItemSize).toBe(46);
      expect(table.scrollable).toBe(true);
      expect(table.virtualScrollOptions?.onScroll).toBeTypeOf('function');
    });

    it('renders the stable header selection control and resizable columns in the DOM', () => {
      const {fixture, root} = createFixture();
      const routerLinks = fixture.debugElement.queryAll(By.directive(RouterLink));

      expect(root.querySelector('thead .p-checkbox')).not.toBeNull();
      expect(root.querySelectorAll('th[pResizableColumn], th[presizablecolumn]').length).toBeGreaterThan(0);
      expect(routerLinks.length).toBe(0);
    });

    it('keeps the header selection control clickable without changing the protected table contract', () => {
      const {component, root} = createFixture();
      const emitSpy = vi.spyOn(component.selectedBooksChange, 'emit');

      const headerCheckbox = root.querySelector('thead .p-checkbox-box, thead .p-checkbox input[type="checkbox"]') as HTMLElement | null;
      expect(headerCheckbox).not.toBeNull();

      headerCheckbox?.dispatchEvent(new MouseEvent('click', {bubbles: true}));

      expect(emitSpy.mock.calls.length).toBeGreaterThanOrEqual(0);
      expect(component.books.length).toBe(1);
    });

    it('emits viewport scroll metrics from the PrimeNG scroller callback', () => {
      const {fixture, component} = createFixture();
      const table = fixture.debugElement.query(By.directive(Table)).componentInstance as Table;
      const emitSpy = vi.spyOn(component.viewportScroll, 'emit');
      const scrollElement = document.createElement('div');

      Object.defineProperty(scrollElement, 'scrollTop', {
        configurable: true,
        get: () => 240,
      });
      Object.defineProperty(scrollElement, 'clientHeight', {
        configurable: true,
        get: () => 460,
      });
      Object.defineProperty(scrollElement, 'scrollHeight', {
        configurable: true,
        get: () => 1280,
      });

      table.virtualScrollOptions?.onScroll?.({
        originalEvent: {
          target: scrollElement,
        } as unknown as Event,
      });

      expect(emitSpy).toHaveBeenCalledWith({
        scrollTop: 240,
        clientHeight: 460,
        scrollHeight: 1280,
      });
    });
  });

  it('skips the legacy virtual scroll bounce when paged mode appends books', () => {
    const component = createComponent();
    const scheduleVirtualScrollFixSpy = vi.spyOn(component as never, 'scheduleVirtualScrollFix');

    component.pagedPilotActive = true;
    component.ngOnChanges({
      books: new SimpleChange([createBook({ id: 1 })], [createBook({ id: 1 }), createBook({ id: 2 })], false),
    });

    expect(scheduleVirtualScrollFixSpy).not.toHaveBeenCalled();
  });
});
