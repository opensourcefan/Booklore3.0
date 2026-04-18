import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {SimpleChange} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {of} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ConfirmationService, MessageService} from 'primeng/api';
import {ActivatedRoute, Router} from '@angular/router';
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
  afterEach(() => {
    document.querySelectorAll('.book-card-mobile-preview-portal-host').forEach(host => host.remove());
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
    document.documentElement.style.overflow = '';
    document.documentElement.style.touchAction = '';
  });

  beforeEach(async () => {
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
    document.documentElement.style.overflow = '';
    document.documentElement.style.touchAction = '';

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

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
        { provide: ActivatedRoute, useValue: {} },
        {
          provide: UrlHelperService,
          useValue: {
            getThumbnailUrl: vi.fn(() => 'thumb'),
            getBookPrimaryReadingUrl: vi.fn(() => '/book/1/read'),
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
            getActiveLang: vi.fn(() => 'en'),
            langChanges$: of('en'),
            _loadDependencies: vi.fn(() => of({})),
            config: {
              reRenderOnLangChange: false,
            },
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

  function createFixture(): ComponentFixture<BookCardComponent> {
    return TestBed.createComponent(BookCardComponent);
  }

  function createTouchEvent(x: number, y: number): TouchEvent {
    const touchPoint = [{ clientX: x, clientY: y }] as unknown as TouchList;
    return {
      touches: touchPoint,
      changedTouches: touchPoint,
    } as unknown as TouchEvent;
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

  it('emits the book when the interactive title area is activated', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;
    const emitted = vi.fn();

    component.book = createBook({
      id: 22,
      metadata: { title: 'Interactive Mobile Title' } as Book['metadata'],
      primaryFile: { id: 1, bookId: 22, fileName: 'interactive-mobile-title.cbz', bookType: 'CBX' },
    });
    component.titleAreaInteractive = true;
    component.titleAreaActivated.subscribe(emitted);

    fixture.detectChanges();

    const titleContainer = fixture.nativeElement.querySelector('.book-title-container') as HTMLDivElement;
    titleContainer.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(emitted).toHaveBeenCalledOnce();
    expect(emitted).toHaveBeenCalledWith(component.book);
    expect(component.isInlineMobilePreviewOpen).toBe(false);
  });

  it('opens the inline mobile preview on mobile when no external title handler is attached', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;

    component.book = createBook({
      id: 24,
      metadata: {
        title: 'Landscape Mobile Title',
        subtitle: 'Issue One',
      } as Book['metadata'],
      primaryFile: { id: 1, bookId: 24, fileName: 'landscape-mobile-title.cbz', bookType: 'CBX' },
    });
    component.screenWidth = 915;
    component.screenHeight = 412;
    fixture.detectChanges();

    const titleContainer = fixture.nativeElement.querySelector('.book-title-container') as HTMLDivElement;
    expect(titleContainer.getAttribute('role')).toBe('button');

    titleContainer.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    const preview = document.body.querySelector('.book-card-mobile-preview') as HTMLElement;
    expect(preview).toBeTruthy();
    expect(preview.textContent).toContain('Landscape Mobile Title');
    expect(preview.textContent).toContain('Issue One');
    expect(preview.textContent).toContain('1 / 1');
    expect(fixture.nativeElement.querySelector('.book-card-mobile-preview')).toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    const overlayMenuButton = document.body.querySelector('.book-card-mobile-preview-menu') as HTMLElement;
    expect(overlayMenuButton).toBeTruthy();
    expect(document.body.querySelector('.book-card-mobile-preview-cover-controls .book-card-mobile-preview-menu')).toBeTruthy();

    const titleToggle = document.body.querySelector('.book-card-mobile-preview-title-toggle') as HTMLButtonElement;
    titleToggle.click();
    fixture.detectChanges();

    expect(document.body.querySelector('.book-card-mobile-preview')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('supports horizontal swipe navigation inside the inline mobile preview', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;

    const firstBook = createBook({
      id: 26,
      metadata: {
        title: 'First Swipe Title',
      } as Book['metadata'],
      primaryFile: { id: 1, bookId: 26, fileName: 'first-swipe-title.cbz', bookType: 'CBX' },
    });

    const secondBook = createBook({
      id: 27,
      metadata: {
        title: 'Second Swipe Title',
      } as Book['metadata'],
      primaryFile: { id: 2, bookId: 27, fileName: 'second-swipe-title.cbz', bookType: 'CBX' },
    });

    component.book = firstBook;
    component.mobileViewerBooksContext = [firstBook, secondBook];
    component.screenWidth = 915;
    component.screenHeight = 412;
    fixture.detectChanges();

    const titleContainer = fixture.nativeElement.querySelector('.book-title-container') as HTMLDivElement;
    titleContainer.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(component.inlineMobileViewerIndex).toBe(0);
    expect((document.body.querySelector('.book-card-mobile-preview') as HTMLElement).textContent).toContain('First Swipe Title');

    component.onInlineViewerTouchStart(createTouchEvent(320, 220));
    component.onInlineViewerTouchMove(createTouchEvent(240, 220));
    component.onInlineViewerTouchEnd(createTouchEvent(240, 220));
    fixture.detectChanges();

    expect(component.inlineMobileViewerIndex).toBe(1);
    expect((document.body.querySelector('.book-card-mobile-preview') as HTMLElement).textContent).toContain('Second Swipe Title');

    component.onInlineViewerTouchStart(createTouchEvent(220, 220));
    component.onInlineViewerTouchMove(createTouchEvent(320, 220));
    component.onInlineViewerTouchEnd(createTouchEvent(320, 220));
    fixture.detectChanges();

    expect(component.inlineMobileViewerIndex).toBe(0);
    expect((document.body.querySelector('.book-card-mobile-preview') as HTMLElement).textContent).toContain('First Swipe Title');
  });

  it('does not open the inline mobile preview outside mobile interaction mode', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;

    component.book = createBook({
      id: 25,
      metadata: {
        title: 'Desktop Title',
      } as Book['metadata'],
      primaryFile: { id: 1, bookId: 25, fileName: 'desktop-title.cbz', bookType: 'CBX' },
    });
    component.screenWidth = 1400;
    component.screenHeight = 900;
    fixture.detectChanges();

    const titleContainer = fixture.nativeElement.querySelector('.book-title-container') as HTMLDivElement;
    expect(titleContainer.getAttribute('role')).toBeNull();

    titleContainer.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(component.isInlineMobilePreviewOpen).toBe(false);
    expect(document.body.querySelector('.book-card-mobile-preview')).toBeNull();
  });

  it('reuses the original overlay badge classes inside the inline mobile preview', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;

    component.book = createBook({
      id: 31,
      hasAiPanelData: true,
      seriesCount: 3,
      metadata: {
        title: 'Badge Viewer Title',
        comicMetadata: { issueNumber: '7' },
      } as Book['metadata'],
      primaryFile: { id: 1, bookId: 31, fileName: 'badge-viewer-title.cbz', bookType: 'CBX', extension: 'cbz' },
    });
    component.screenWidth = 915;
    component.screenHeight = 412;
    fixture.detectChanges();

    const titleContainer = fixture.nativeElement.querySelector('.book-title-container') as HTMLDivElement;
    titleContainer.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    const preview = document.body.querySelector('.book-card-mobile-preview') as HTMLElement;
    expect(preview.querySelector('.book-type-pill-overlay.book-type-cbz')).toBeTruthy();
    expect(preview.querySelector('.ai-panel-overlay')).toBeTruthy();
    expect(preview.querySelector('.series-number-overlay')).toBeTruthy();
    expect(preview.querySelector('.series-items-count-overlay')).toBeTruthy();
    expect(preview.querySelector('.book-card-mobile-preview-badge--primary')).toBeNull();
  });

  it('renders the interactive title branch without a tooltip directive and keeps the passive tooltip branch', () => {
    const templatePath = join(process.cwd(), 'src/app/features/book/components/book-browser/book-card/book-card.component.html');
    const template = readFileSync(templatePath, 'utf8');
    const titleContainerBlock = template.match(/<div class="book-title-container"[\s\S]*?<\/div>\n\s{2}\}/);

    expect(titleContainerBlock?.[0]).toContain('@if (isTitleAreaInteractive) {');
    expect(titleContainerBlock?.[0]).toMatch(/@if \(isTitleAreaInteractive\) \{[\s\S]*?<h4 class="book-title"[\s\S]*?\{\{ displayTitle \}\}[\s\S]*?<\/h4>[\s\S]*?\} @else \{/);
    expect(titleContainerBlock?.[0]).toMatch(/\} @else \{[\s\S]*?\[pTooltip\]="titleTooltip"/);

    const interactiveOnly = titleContainerBlock?.[0].split('} @else {')[0] ?? '';
    expect(interactiveOnly).not.toContain('[pTooltip]');
  });

  it('renders title area bindings as attributes instead of leaking them into title text', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;

    component.book = createBook({
      id: 30,
      metadata: {
        title: 'Mobile Viewer Title',
      } as Book['metadata'],
      primaryFile: { id: 1, bookId: 30, fileName: 'mobile-viewer-title.cbz', bookType: 'CBX' },
    });
    component.titleAreaInteractive = true;

    fixture.detectChanges();

    const titleContainer = fixture.nativeElement.querySelector('.book-title-container') as HTMLElement;
    expect(titleContainer?.getAttribute('role')).toBe('button');
    expect(titleContainer?.getAttribute('tabindex')).toBe('0');
    expect(titleContainer?.textContent).not.toContain('[attr.role]');
    expect(titleContainer?.textContent).toContain('Mobile Viewer Title');
  });

  it('anchors the popup menu to the inner button element rather than the button host wrapper', () => {
    const component = createComponent();
    component.book = createBook({ id: 12, primaryFile: { id: 1, bookId: 12, bookType: 'CBX' } });
    component.ngOnInit();
    (component as unknown as { user: { permissions: { canDownload: boolean; canDeleteBook: boolean } } }).user = {
      permissions: {
        canDownload: false,
        canDeleteBook: false,
      },
    };

    const triggerHost = document.createElement('span');
    const trigger = document.createElement('button');
    const nestedTarget = document.createElement('span');
    triggerHost.appendChild(trigger);
    trigger.appendChild(nestedTarget);
    (component as unknown as { menuTriggerRef?: { nativeElement: HTMLElement } }).menuTriggerRef = { nativeElement: triggerHost };

    const toggle = vi.fn();
    const stopPropagation = vi.fn();

    component.onMenuToggle({
      target: nestedTarget,
      currentTarget: nestedTarget,
      stopPropagation,
    } as unknown as Event, { toggle } as unknown as never);

    expect(stopPropagation).toHaveBeenCalled();
    expect(toggle).toHaveBeenCalledWith(expect.objectContaining({
      currentTarget: trigger,
      target: trigger,
    }));
  });

  it('anchors the inline mobile preview menu to the popup trigger button', () => {
    const component = createComponent();
    component.book = createBook({ id: 32, primaryFile: { id: 1, bookId: 32, bookType: 'CBX' } });
    component.ngOnInit();
    (component as unknown as { user: { permissions: { canDownload: boolean; canDeleteBook: boolean } } }).user = {
      permissions: {
        canDownload: false,
        canDeleteBook: false,
      },
    };

    const triggerHost = document.createElement('span');
    const trigger = document.createElement('button');
    const nestedTarget = document.createElement('span');
    triggerHost.appendChild(trigger);
    trigger.appendChild(nestedTarget);
    (component as unknown as { mobilePreviewMenuTriggerRef?: { nativeElement: HTMLElement } }).mobilePreviewMenuTriggerRef = {
      nativeElement: triggerHost,
    };

    const toggle = vi.fn();
    const stopPropagation = vi.fn();

    component.onInlineViewerMenuToggle({
      target: nestedTarget,
      currentTarget: nestedTarget,
      stopPropagation,
    } as unknown as Event, { toggle } as unknown as never);

    expect(stopPropagation).toHaveBeenCalled();
    expect(toggle).toHaveBeenCalledWith(expect.objectContaining({
      currentTarget: trigger,
      target: trigger,
    }));
  });
});
