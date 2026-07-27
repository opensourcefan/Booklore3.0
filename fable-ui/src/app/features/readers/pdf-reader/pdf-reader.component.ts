import {Component, ElementRef, inject, NgZone, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {EditorAnnotation, NgxExtendedPdfViewerModule, NgxExtendedPdfViewerService, PageViewModeType, PDFNotificationService, pdfDefaultOptions, ScrollModeType, ZoomType} from 'ngx-extended-pdf-viewer';
import {PageTitleService} from "../../../shared/service/page-title.service";
import {BookService} from '../../book/service/book.service';
import {forkJoin, Subject, Subscription} from 'rxjs';
import {debounceTime, map, switchMap} from 'rxjs/operators';
import {BookSetting} from '../../book/model/book.model';
import {UserService} from '../../settings/user-management/user.service';
import {AuthService} from '../../../shared/service/auth.service';
import {API_CONFIG} from '../../../core/config/api-config';
import {PdfAnnotationService} from '../../../shared/service/pdf-annotation.service';
import {BookMarkService, BookMark, CreateBookMarkRequest} from '../../../shared/service/book-mark.service';
import {UrlHelperService} from '../../../shared/service/url-helper.service';
import {sortBookmarksChronological} from '../../../shared/util/sort-bookmarks.util';
import {BookmarkTitleDialogComponent} from '../../../shared/components/bookmark-title-dialog/bookmark-title-dialog.component';
import {
  PdfSidebarBookInfo,
  PdfSidebarComponent,
  PdfSidebarPage,
  PdfSidebarTab
} from './layout/pdf-sidebar.component';

import {ProgressSpinner} from 'primeng/progressspinner';
import {MessageService} from 'primeng/api';
import {FailureNotificationService} from '../../../shared/service/failure-notification.service';
import {TranslocoService, TranslocoPipe} from '@jsverse/transloco';
import {ReadingSessionService} from '../../../shared/service/reading-session.service';
import {WriteProgressService} from '../../../shared/service/write-progress.service';
import {Location} from '@angular/common';
import {MobileUxService} from '../../../core/services/mobile-ux.service';
import {MobileBackHandle, MobileBackNavigationService} from '../../../shared/service/mobile-back-navigation.service';
import {
  acquireReaderBrowserZoomLock,
  releaseReaderBrowserZoomLock,
  shouldLockReaderBrowserZoom
} from '../../../shared/util/visual-viewport.util';
import {GhostClickGuard} from '../../../shared/util/overlay-dismiss.util';
import {PdfScrollMode, PdfTouchNavigationHandler} from './pdf-touch-navigation.handler';
import {needsRelayoutForPageViewModeTransition, resolvePdfViewerTopPx, PDF_TOOLBAR_HEIGHT_FALLBACK_PX} from './pdf-mode-transition.util';

/** Mirrors pdf.js AnnotationEditorType for toolbar annotate actions. */
const PDF_ANNOTATION_EDITOR_MODE = {
  NONE: 0,
  FREETEXT: 3,
  HIGHLIGHT: 9,
  INK: 15,
} as const;

/** Mirrors pdf.js CursorTool / ngx PdfCursorTools. */
const PDF_CURSOR_TOOL = {
  SELECT: 0,
  HAND: 1,
} as const;

@Component({
  selector: 'app-pdf-reader',
  standalone: true,
  imports: [
    NgxExtendedPdfViewerModule,
    ProgressSpinner,
    TranslocoPipe,
    BookmarkTitleDialogComponent,
    PdfSidebarComponent,
  ],
  templateUrl: './pdf-reader.component.html',
  styleUrl: './pdf-reader.component.scss',
  host: {
    class: 'pdf-reader-host',
  },
})
export class PdfReaderComponent implements OnInit, OnDestroy {
  constructor() {
    pdfDefaultOptions.rangeChunkSize = 512 * 1024;
    pdfDefaultOptions.disableAutoFetch = true;
  }

  isLoading = true;
  totalPages = 0;
  isDarkTheme = true;
  canPrint = false;
  disableExternalLinks = false;

  rotation: 0 | 90 | 180 | 270 = 0;
  authorization = '';

  page!: number;
  spread!: 'off' | 'even' | 'odd';
  zoom!: ZoomType;
  /**
   * PDF.js "page view mode". Bound both to `<ngx-extended-pdf-viewer>` and to
   * the mode toolbar buttons. Without this wiring the buttons emit
   * `pageViewModeChange` events into the void, so:
   *   - `pdf-book-mode` looks toggleable but does nothing (its only exit path
   *     is the Angular emitter — it never touches the pdf.js event bus).
   *   - The scroll-mode buttons visually stick because their `[toggled]`
   *     expressions depend on `pageViewMode` (`'book'`, `'infinite-scroll'`)
   *     which never updates.
   */
  pageViewMode: PageViewModeType = 'multiple';
  /**
   * Mirror of pdf.js `scrollMode`, kept in sync via `scrollmodechanged`
   * eventBus. Passed to the toolbar mode buttons so their `[toggled]`
   * expressions render correctly (single-page = 3, vertical = 0, etc.).
   */
  scrollMode: ScrollModeType = ScrollModeType.vertical;

  bookData!: string;
  bookId!: number;
  bookFileId?: number;
  private altBookType?: string;
  private appSettingsSubscription!: Subscription;
  private annotationSaveSubject = new Subject<void>();
  private annotationSaveSubscription!: Subscription;
  private annotationsLoaded = false;

  // Bookmark state
  isCurrentPageBookmarked = false;
  showBookmarkDialog = false;
  bookmarkTitle = '';
  bookmarkDefaultTitle = '';
  bookmarks: BookMark[] = [];

  // Fable left sidebar
  sidebarOpen = false;
  sidebarClosing = false;
  sidebarTab: PdfSidebarTab = 'bookmarks';
  sidebarBookInfo: PdfSidebarBookInfo = {title: '', authors: '', coverUrl: null};
  sidebarPages: PdfSidebarPage[] = [];
  pdfJsSidebarOpen = false;
  @ViewChild(PdfSidebarComponent) pdfSidebar?: PdfSidebarComponent;
  private sidebarBackHandle: MobileBackHandle | null = null;
  private sidebarCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private pdfJsSidebarListener: ((evt: unknown) => void) | null = null;

  // Touch navigation
  showTouchZones = false;
  touchZonesFading = false;
  private touchHandler: PdfTouchNavigationHandler | null = null;
  private touchZoneTimer: ReturnType<typeof setTimeout> | null = null;
  private touchZoneFadeTimer: ReturnType<typeof setTimeout> | null = null;
  private currentScrollMode: PdfScrollMode = PdfScrollMode.Vertical;
  private scrollModeListener: ((evt: unknown) => void) | null = null;
  private resizeListener: (() => void) | null = null;
  private resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private modeTransitionRafHandles: number[] = [];
  private modeTransitionTimers: ReturnType<typeof setTimeout>[] = [];

  // Primary-toolbar overflow menus (Annotate / More / Phone zoom-fit)
  annotateMenuOpen = false;
  moreMenuOpen = false;
  zoomMenuOpen = false;
  /** Viewport-anchored placement for fixed dropdowns (avoids toolbar clip). */
  toolbarMenuTop = '36px';
  toolbarMenuRight = '8px';
  readonly annotationModes = PDF_ANNOTATION_EDITOR_MODE;
  readonly cursorTools = PDF_CURSOR_TOOL;
  annotationEditorMode: number = PDF_ANNOTATION_EDITOR_MODE.NONE;
  cursorTool: number = PDF_CURSOR_TOOL.SELECT;
  private readonly toolbarMenuDismissGuard = new GhostClickGuard();
  private annotationModeListener: ((evt: unknown) => void) | null = null;
  private cursorToolListener: ((evt: unknown) => void) | null = null;
  private toolbarMenuOutsideListener: ((event: Event) => void) | null = null;

  get annotationEditorActive(): boolean {
    return this.annotationEditorMode !== PDF_ANNOTATION_EDITOR_MODE.NONE;
  }

  /** Phone layout Mode — drives the − / ⋯ / + zoom cluster. */
  get isPhone(): boolean {
    return this.mobileUx.isPhone;
  }

  /** True when zoom is a named fit mode (highlights the phone zoom-fit trigger). */
  get isFitZoomMode(): boolean {
    return this.zoom === 'page-fit'
      || this.zoom === 'page-width'
      || this.zoom === 'auto'
      || this.zoom === 'page-actual';
  }

  private bookService = inject(BookService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private messageService = inject(MessageService);
  private failureNotifications = inject(FailureNotificationService);
  private route = inject(ActivatedRoute);
  private pageTitle = inject(PageTitleService);
  private readingSessionService = inject(ReadingSessionService);
  private writeProgressService = inject(WriteProgressService);
  private location = inject(Location);
  private pdfViewerService = inject(NgxExtendedPdfViewerService);
  private pdfNotification = inject(PDFNotificationService);
  private pdfAnnotationService = inject(PdfAnnotationService);
  private bookMarkService = inject(BookMarkService);
  private urlHelper = inject(UrlHelperService);
  private mobileBackNavigation = inject(MobileBackNavigationService);
  private readonly t = inject(TranslocoService);
  private readonly mobileUx = inject(MobileUxService);
  private readonly zone = inject(NgZone);
  private readonly hostRef = inject(ElementRef);
  private readerBrowserZoomLocked = false;

  ngOnInit(): void {
    this.lockReaderBrowserZoomIfNeeded();
    this.disableExternalLinks = localStorage.getItem('fable_pdf_disable_external_links') === 'true';
    this.writeProgressService.clear();
    this.annotationSaveSubscription = this.annotationSaveSubject
      .pipe(debounceTime(1500))
      .subscribe(() => this.persistAnnotations());

    this.route.paramMap.subscribe((params) => {
      this.isLoading = true;
      this.bookId = +params.get('bookId')!;
      this.altBookType = this.route.snapshot.queryParamMap.get('bookType') ?? undefined;

      this.bookService.getBookByIdFromAPI(this.bookId, false).pipe(
        switchMap((book) => {
          if (this.altBookType) {
            const altFile = book.alternativeFormats?.find(f => f.bookType === this.altBookType);
            this.bookFileId = altFile?.id;
          } else {
            this.bookFileId = book.primaryFile?.id;
          }

          return forkJoin([
            this.bookService.getBookSetting(this.bookId, this.bookFileId!),
            this.userService.getMyself()
          ]).pipe(map(([bookSetting, myself]) => ({book, bookSetting, myself})));
        })
      ).subscribe({
        next: ({book, bookSetting, myself}) => {
          const pdfMeta = book;
          const pdfPrefs = bookSetting;

          this.pageTitle.setBookPageTitle(pdfMeta);
          this.sidebarBookInfo = {
            title: pdfMeta.metadata?.title || pdfMeta.fileName || '',
            authors: (pdfMeta.metadata?.authors || []).join(', '),
            coverUrl: this.urlHelper.getDirectThumbnailUrl(pdfMeta.id, pdfMeta.metadata?.coverUpdatedOn),
          };

          const globalOrIndividual = myself.userSettings.perBookSetting.pdf;
          if (globalOrIndividual === 'Global') {
            this.zoom = myself.userSettings.pdfReaderSetting.pageZoom || 'page-fit';
            this.spread = myself.userSettings.pdfReaderSetting.pageSpread || 'odd';
          } else {
            this.zoom = pdfPrefs.pdfSettings?.zoom || myself.userSettings.pdfReaderSetting.pageZoom || 'page-fit';
            this.spread = pdfPrefs.pdfSettings?.spread || myself.userSettings.pdfReaderSetting.pageSpread || 'odd';
          }
          this.canPrint = myself.permissions.canDownload || myself.permissions.admin;
          const targetPage = this.route.snapshot.queryParamMap.get('page');
          this.page = targetPage ? Number(targetPage) : (pdfMeta.pdfProgress?.page || 1);
          this.bookData = this.altBookType
            ? `${API_CONFIG.BASE_URL}/api/v1/books/${this.bookId}/content?bookType=${this.altBookType}`
            : `${API_CONFIG.BASE_URL}/api/v1/books/${this.bookId}/content`;
          const token = this.authService.getInternalAccessToken();
          this.authorization = token ? `Bearer ${token}` : '';
          this.isLoading = false;
          this.loadBookmarks();
        },
        error: () => {
          this.toastError(this.t.translate('common.error'), this.t.translate('readerPdf.toast.failedToLoadBook'));
          this.isLoading = false;
        }
      });
    });
  }

  onPageChange(page: number): void {
    if (page !== this.page) {
      this.page = page;
      this.updateBookmarkState();
      this.updateProgress();
      const percentage = this.totalPages > 0 ? Math.round((this.page / this.totalPages) * 1000) / 10 : 0;
      this.readingSessionService.updateProgress(this.page.toString(), percentage);
    }
  }

  onZoomChange(zoom: ZoomType): void {
    if (zoom !== this.zoom) {
      this.zoom = zoom;
      this.updateViewerSetting();
    }
  }

  onSpreadChange(spread: 'off' | 'even' | 'odd'): void {
    if (spread !== this.spread) {
      this.spread = spread;
      this.updateViewerSetting();
    }
  }

  private updateViewerSetting(): void {
    const bookSetting: BookSetting = {
      pdfSettings: {
        spread: this.spread,
        zoom: this.zoom,
      }
    }
    this.bookService.updateViewerSetting(bookSetting, this.bookId).subscribe();
  }

  updateProgress(): void {
    const percentage = this.totalPages > 0 ? Math.round((this.page / this.totalPages) * 1000) / 10 : 0;
    this.bookService.savePdfProgress(this.bookId, this.page, percentage, this.bookFileId).subscribe();
  }

  onPdfPagesLoaded(event: { pagesCount: number }): void {
    this.totalPages = event.pagesCount;
    this.rebuildSidebarPages();
    const app = this.pdfNotification.onPDFJSInitSignal();
    if (app) {
      this.ensurePdfJsSidebarListener(app);
      this.ensureScrollModeListener(app);
    }
    const percentage = this.totalPages > 0 ? Math.round((this.page / this.totalPages) * 1000) / 10 : 0;
    this.readingSessionService.startSession(this.bookId, "PDF", this.page.toString(), percentage);
    this.readingSessionService.updateProgress(this.page.toString(), percentage);
    this.loadAnnotations();
    this.initTouchNavigation();
    this.initResizeListener();
    this.ensureToolbarToolListeners(app);
    // Toolbar chrome can settle after pagesLoaded; sync inset then refit so
    // page-fit / page-width account for the real header height.
    requestAnimationFrame(() => {
      this.syncViewerChromeInsets();
      this.refitZoomAfterResize();
    });
  }

  onAnnotationEditorEvent(): void {
    if (this.annotationsLoaded) {
      this.annotationSaveSubject.next();
    }
  }

  ngOnDestroy(): void {
    if (this.sidebarCloseTimer) {
      clearTimeout(this.sidebarCloseTimer);
      this.sidebarCloseTimer = null;
    }
    this.sidebarBackHandle?.release(false);
    this.sidebarBackHandle = null;

    const app = this.pdfNotification.onPDFJSInitSignal();
    if (this.pdfJsSidebarListener && app?.eventBus?.off) {
      app.eventBus.off('sidebarviewchanged', this.pdfJsSidebarListener);
      this.pdfJsSidebarListener = null;
    }
    if (this.scrollModeListener && app?.eventBus?.off) {
      app.eventBus.off('scrollmodechanged', this.scrollModeListener);
      this.scrollModeListener = null;
    }
    if (this.annotationModeListener && app?.eventBus?.off) {
      app.eventBus.off('annotationeditormodechanged', this.annotationModeListener);
      this.annotationModeListener = null;
    }
    if (this.cursorToolListener && app?.eventBus?.off) {
      app.eventBus.off('cursortoolchanged', this.cursorToolListener);
      this.cursorToolListener = null;
    }
    this.teardownToolbarMenuOutsideListener();

    if (this.readingSessionService.isSessionActive()) {
      const percentage = this.totalPages > 0 ? Math.round((this.page / this.totalPages) * 1000) / 10 : 0;
      this.readingSessionService.endSession(this.page.toString(), percentage);
    }

    this.annotationSaveSubscription?.unsubscribe();
    this.persistAnnotations();

    if (this.appSettingsSubscription) {
      this.appSettingsSubscription.unsubscribe();
    }
    this.updateProgress();
    this.unlockReaderBrowserZoomIfNeeded();
    this.destroyTouchNavigation();
    this.destroyResizeListener();
    this.cancelPendingModeTransitionWork();
  }

  private lockReaderBrowserZoomIfNeeded(): void {
    if (this.readerBrowserZoomLocked) {
      return;
    }
    if (!shouldLockReaderBrowserZoom({
      isPhone: this.mobileUx.isPhone,
      hasTouchInput: this.mobileUx.hasTouchInput,
    })) {
      return;
    }
    acquireReaderBrowserZoomLock();
    this.readerBrowserZoomLocked = true;
  }

  private unlockReaderBrowserZoomIfNeeded(): void {
    if (!this.readerBrowserZoomLocked) {
      return;
    }
    releaseReaderBrowserZoomLock();
    this.readerBrowserZoomLocked = false;
  }

  closeReader = (): void => {
    if (this.readingSessionService.isSessionActive()) {
      const percentage = this.totalPages > 0 ? Math.round((this.page / this.totalPages) * 1000) / 10 : 0;
      this.readingSessionService.endSession(this.page.toString(), percentage);
    }
    this.writeProgressService.complete(this.t.translate('book.browser.toast.readingProgressUpdated'));
    this.location.back();
  }

  // --- Bookmark methods ---

  private loadBookmarks(): void {
    this.bookMarkService.getBookmarksForBook(this.bookId).subscribe({
      next: (bookmarks) => {
        this.bookmarks = sortBookmarksChronological(bookmarks);
        this.updateBookmarkState();
      }
    });
  }

  private updateBookmarkState(): void {
    const pageStr = this.page.toString();
    this.isCurrentPageBookmarked = this.bookmarks.some(b => b.cfi === pageStr);
  }

  private rebuildSidebarPages(): void {
    const pageLabel = this.t.translate('readerPdf.sidebar.page');
    this.sidebarPages = Array.from({length: this.totalPages}, (_, i) => ({
      pageNumber: i + 1,
      displayName: `${pageLabel} ${i + 1}`,
    }));
  }

  openSidebar(tab: PdfSidebarTab = 'bookmarks'): void {
    this.sidebarTab = tab;
    this.sidebarClosing = false;
    this.sidebarOpen = true;
    this.pdfSidebar?.armDismissGuard();
    if (!this.sidebarBackHandle) {
      this.sidebarBackHandle = this.mobileBackNavigation.register(() => this.closeSidebar());
    }
  }

  togglePdfJsSidebar(): void {
    const app = this.pdfNotification.onPDFJSInitSignal();
    if (!app?.pdfSidebar || !app.eventBus) {
      return;
    }
    const newVisibility = !app.pdfSidebar.isOpen;
    app.eventBus.dispatch('toggleSidebar', {visible: newVisibility});
    this.pdfJsSidebarOpen = newVisibility;
    this.ensurePdfJsSidebarListener(app);
  }

  private ensurePdfJsSidebarListener(app: {
    eventBus?: {on?: (name: string, listener: (evt: unknown) => void) => void; off?: (name: string, listener: (evt: unknown) => void) => void};
    pdfSidebar?: {isOpen?: boolean};
  }): void {
    if (this.pdfJsSidebarListener || !app.eventBus?.on) {
      return;
    }
    this.pdfJsSidebarListener = () => {
      this.pdfJsSidebarOpen = !!app.pdfSidebar?.isOpen;
    };
    app.eventBus.on('sidebarviewchanged', this.pdfJsSidebarListener);
    this.pdfJsSidebarOpen = !!app.pdfSidebar?.isOpen;
  }

  closeSidebar(): void {
    if (!this.sidebarOpen || this.sidebarClosing) {
      return;
    }
    this.sidebarClosing = true;
    this.sidebarBackHandle?.release();
    this.sidebarBackHandle = null;
    if (this.sidebarCloseTimer) {
      clearTimeout(this.sidebarCloseTimer);
    }
    this.sidebarCloseTimer = setTimeout(() => {
      this.sidebarOpen = false;
      this.sidebarClosing = false;
      this.sidebarCloseTimer = null;
    }, 200);
  }

  onSidebarTabChange(tab: PdfSidebarTab): void {
    this.sidebarTab = tab;
  }

  onSidebarPageSelect(pageNumber: number): void {
    this.page = pageNumber;
    this.updateBookmarkState();
    this.closeSidebar();
  }

  onSidebarBookmarkSelect(pageNumber: number): void {
    this.page = pageNumber;
    this.updateBookmarkState();
    this.closeSidebar();
  }

  onSidebarBookmarkDelete(bookmarkId: number): void {
    this.bookMarkService.deleteBookmark(bookmarkId).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('readerPdf.toast.bookmarkRemoved'),
          life: 2000,
        });
        this.loadBookmarks();
      },
      error: () => {
        this.toastError(
          this.t.translate('readerPdf.toast.bookmarkFailed'),
          this.t.translate('readerPdf.toast.bookmarkFailed'),
          3000,
        );
      },
    });
  }

  onToggleBookmark(): void {
    if (this.isCurrentPageBookmarked) {
      this.removeBookmark();
    } else {
      this.openBookmarkDialog();
    }
  }

  openBookmarkDialog(): void {
    this.bookmarkDefaultTitle = `${this.t.translate('readerPdf.sidebar.page')} ${this.page}`;
    this.bookmarkTitle = '';
    this.showBookmarkDialog = true;
  }

  onSaveBookmark(title: string): void {
    const request: CreateBookMarkRequest = {
      bookId: this.bookId,
      cfi: this.page.toString(),
      title: title || this.bookmarkDefaultTitle,
    };

    this.bookMarkService.createBookmark(request).subscribe({
      next: () => {
        this.messageService.add({severity: 'success', summary: this.t.translate('readerPdf.toast.bookmarkAdded'), life: 2000});
        this.showBookmarkDialog = false;
        this.bookmarkTitle = '';
        this.loadBookmarks();
      },
      error: () => {
        this.toastError(this.t.translate('readerPdf.toast.bookmarkFailed'), this.t.translate('readerPdf.toast.bookmarkFailed'), 3000);
      }
    });
  }

  onCancelBookmark(): void {
    this.showBookmarkDialog = false;
    this.bookmarkTitle = '';
  }

  private removeBookmark(): void {
    const pageStr = this.page.toString();
    const existing = this.bookmarks.find(b => b.cfi === pageStr);
    if (existing) {
      this.bookMarkService.deleteBookmark(existing.id).subscribe({
        next: () => {
          this.messageService.add({severity: 'success', summary: this.t.translate('readerPdf.toast.bookmarkRemoved'), life: 2000});
          this.loadBookmarks();
        },
        error: () => {
          this.toastError(this.t.translate('readerPdf.toast.bookmarkFailed'), this.t.translate('readerPdf.toast.bookmarkFailed'), 3000);
        }
      });
    }
  }

  private loadAnnotations(): void {
    this.pdfAnnotationService.getAnnotations(this.bookId).subscribe({
      next: (response) => {
        if (response?.data) {
          const annotations = JSON.parse(response.data);
          for (const annotation of annotations) {
            this.pdfViewerService.addEditorAnnotation(annotation);
          }
        }
        this.annotationsLoaded = true;
      },
      error: () => {
        this.annotationsLoaded = true;
      }
    });
  }

  private persistAnnotations(): void {
    if (!this.annotationsLoaded || !this.bookId) {
      return;
    }
    const serialized = this.pdfViewerService.getSerializedAnnotations();
    if (serialized && serialized.length > 0) {
      const cleaned = serialized.map(({id: _id, ...rest}: EditorAnnotation) => rest);
      const data = JSON.stringify(cleaned);
      this.pdfAnnotationService.saveAnnotations(this.bookId, data).subscribe();
    }
  }

  onAnnotationLayerRendered(event: unknown): void {
    if (this.disableExternalLinks) {
      const ev = event as { source: { div: HTMLDivElement } };
      this.applyExternalLinksPolicyToDiv(ev.source.div);
    }
  }

  onLinkAnnotationsAdded(event: unknown): void {
    if (this.disableExternalLinks) {
      const ev = event as { source: { div: HTMLDivElement } };
      this.applyExternalLinksPolicyToDiv(ev.source.div);
    }
  }

  private applyExternalLinksPolicyToDiv(div: HTMLDivElement): void {
    div.querySelectorAll('a').forEach((a: HTMLAnchorElement) => {
      const originalHref = a.getAttribute('data-original-href') || a.getAttribute('href') || '';
      if (originalHref && !a.getAttribute('data-original-href')) {
        a.setAttribute('data-original-href', originalHref);
      }
      if (originalHref.startsWith('http://') || originalHref.startsWith('https://')) {
        a.removeAttribute('href');
        a.style.pointerEvents = 'none';
        a.style.cursor = 'default';
        a.style.border = 'none';
        a.style.boxShadow = 'none';
        a.style.outline = 'none';
        a.style.background = 'transparent';
      }
    });
  }

  toggleExternalLinks(): void {
    this.disableExternalLinks = !this.disableExternalLinks;
    localStorage.setItem('fable_pdf_disable_external_links', String(this.disableExternalLinks));
    this.applyExternalLinksPolicy();
  }

  private applyExternalLinksPolicy(): void {
    const viewerContainer = document.querySelector('ngx-extended-pdf-viewer');
    if (!viewerContainer) return;

    viewerContainer.querySelectorAll('a').forEach((a: HTMLAnchorElement) => {
      const originalHref = a.getAttribute('data-original-href') || a.getAttribute('href') || '';
      if (originalHref && !a.getAttribute('data-original-href')) {
        a.setAttribute('data-original-href', originalHref);
      }

      if (this.disableExternalLinks) {
        if (originalHref.startsWith('http://') || originalHref.startsWith('https://')) {
          a.removeAttribute('href');
          a.style.pointerEvents = 'none';
          a.style.cursor = 'default';
          a.style.border = 'none';
          a.style.boxShadow = 'none';
          a.style.outline = 'none';
          a.style.background = 'transparent';
        }
      } else {
        if (originalHref.startsWith('http://') || originalHref.startsWith('https://')) {
          a.setAttribute('href', originalHref);
          a.style.pointerEvents = '';
          a.style.cursor = '';
          a.style.border = '';
          a.style.boxShadow = '';
          a.style.outline = '';
          a.style.background = '';
        }
      }
    });
  }

  private toastError(summary: string, detail: string, life?: number): void {
    this.failureNotifications.reportSafe(summary, detail);
    this.messageService.add({severity: 'error', summary, detail, ...(life != null ? {life} : {})});
  }

  // ── Touch navigation ────────────────────────────────────────────────────

  private initTouchNavigation(): void {
    if (this.touchHandler) return;
    if (!this.mobileUx.hasTouchInput) return;

    const container = this.hostRef.nativeElement as HTMLElement;
    if (!container) return;

    this.touchHandler = new PdfTouchNavigationHandler({
      container,
      onPrev: () => {
        this.zone.run(() => {
          const step = this.getPageStep();
          if (this.page > 1) {
            this.page = Math.max(1, this.page - step);
            this.updateBookmarkState();
          }
        });
      },
      onNext: () => {
        this.zone.run(() => {
          const step = this.getPageStep();
          if (this.page < this.totalPages) {
            this.page = Math.min(this.totalPages, this.page + step);
            this.updateBookmarkState();
          }
        });
      },
      onFirstTouch: () => {
        this.zone.run(() => this.dismissTouchZones());
      },
    });

    // Activate if already in a page-based mode
    this.syncTouchHandlerActive();
  }

  private destroyTouchNavigation(): void {
    this.touchHandler?.destroy();
    this.touchHandler = null;
    if (this.touchZoneTimer) {
      clearTimeout(this.touchZoneTimer);
      this.touchZoneTimer = null;
    }
    if (this.touchZoneFadeTimer) {
      clearTimeout(this.touchZoneFadeTimer);
      this.touchZoneFadeTimer = null;
    }
  }

  /**
   * Returns how many pages to advance per tap/swipe.
   * In spread modes (even/odd) and page-based scroll, advance by 2; otherwise 1.
   */
  private getPageStep(): number {
    if (this.currentScrollMode === PdfScrollMode.Page && this.spread !== 'off') {
      return 2;
    }
    return 1;
  }

  /** Activate touch handler only in page-based or horizontal scroll modes. */
  private syncTouchHandlerActive(): void {
    if (!this.touchHandler) return;
    const isPageBased = this.currentScrollMode === PdfScrollMode.Page
      || this.currentScrollMode === PdfScrollMode.Horizontal;
    this.touchHandler.active = isPageBased;
  }

  private ensureScrollModeListener(app: {
    eventBus?: {
      on?: (name: string, listener: (evt: unknown) => void) => void;
      off?: (name: string, listener: (evt: unknown) => void) => void;
    };
  }): void {
    if (this.scrollModeListener || !app.eventBus?.on) return;

    this.scrollModeListener = (evt: unknown) => {
      const mode = (evt as { mode?: number })?.mode;
      if (mode != null) {
        this.zone.run(() => {
          this.currentScrollMode = mode as PdfScrollMode;
          this.scrollMode = mode as ScrollModeType;
          this.syncTouchHandlerActive();
          if (this.isPageBasedMode()) {
            this.flashTouchZones();
          }
        });
      }
    };
    app.eventBus.on('scrollmodechanged', this.scrollModeListener);

    // Read initial scroll mode from the viewer
    const pdfViewer = (app as { pdfViewer?: { scrollMode?: number } }).pdfViewer;
    if (pdfViewer?.scrollMode != null) {
      this.currentScrollMode = pdfViewer.scrollMode as PdfScrollMode;
      this.scrollMode = pdfViewer.scrollMode as ScrollModeType;
      this.syncTouchHandlerActive();
    }
  }

  private ensureToolbarToolListeners(app: {
    eventBus?: {
      on?: (name: string, listener: (evt: unknown) => void) => void;
      off?: (name: string, listener: (evt: unknown) => void) => void;
    };
    pdfViewer?: { annotationEditorMode?: number };
  } | null): void {
    if (!app?.eventBus?.on) return;

    if (!this.annotationModeListener) {
      this.annotationModeListener = (evt: unknown) => {
        const mode = (evt as { mode?: number })?.mode;
        if (typeof mode === 'number') {
          this.zone.run(() => {
            this.annotationEditorMode = mode;
          });
        }
      };
      app.eventBus.on('annotationeditormodechanged', this.annotationModeListener);
      if (typeof app.pdfViewer?.annotationEditorMode === 'number') {
        this.annotationEditorMode = app.pdfViewer.annotationEditorMode;
      }
    }

    if (!this.cursorToolListener) {
      this.cursorToolListener = (evt: unknown) => {
        const tool = (evt as { tool?: number })?.tool;
        if (typeof tool === 'number') {
          this.zone.run(() => {
            this.cursorTool = tool;
          });
        }
      };
      app.eventBus.on('cursortoolchanged', this.cursorToolListener);
    }
  }

  toggleAnnotateMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const opening = !this.annotateMenuOpen;
    this.moreMenuOpen = false;
    this.zoomMenuOpen = false;
    this.annotateMenuOpen = opening;
    if (opening) {
      this.anchorToolbarMenu(event);
      this.toolbarMenuDismissGuard.arm();
      this.ensureToolbarMenuOutsideListener();
    } else {
      this.teardownToolbarMenuOutsideListener();
    }
  }

  toggleMoreMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const opening = !this.moreMenuOpen;
    this.annotateMenuOpen = false;
    this.zoomMenuOpen = false;
    this.moreMenuOpen = opening;
    if (opening) {
      this.anchorToolbarMenu(event);
      this.toolbarMenuDismissGuard.arm();
      this.ensureToolbarMenuOutsideListener();
    } else {
      this.teardownToolbarMenuOutsideListener();
    }
  }

  toggleZoomMenu(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const opening = !this.zoomMenuOpen;
    this.annotateMenuOpen = false;
    this.moreMenuOpen = false;
    this.zoomMenuOpen = opening;
    if (opening) {
      this.anchorToolbarMenu(event);
      this.toolbarMenuDismissGuard.arm();
      this.ensureToolbarMenuOutsideListener();
    } else {
      this.teardownToolbarMenuOutsideListener();
    }
  }

  closeToolbarMenus(): void {
    this.annotateMenuOpen = false;
    this.moreMenuOpen = false;
    this.zoomMenuOpen = false;
    this.teardownToolbarMenuOutsideListener();
  }

  private anchorToolbarMenu(event: Event): void {
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement) || typeof window === 'undefined') {
      this.toolbarMenuTop = '36px';
      this.toolbarMenuRight = '8px';
      return;
    }
    const rect = target.getBoundingClientRect();
    this.toolbarMenuTop = `${Math.round(rect.bottom + 4)}px`;
    this.toolbarMenuRight = `${Math.max(8, Math.round(window.innerWidth - rect.right))}px`;
  }

  /**
   * Document outside-click dismiss (no full-screen backdrop).
   * A backdrop would swallow clicks meant for the other menu trigger, forcing
   * close-then-reopen. Skipping `.pdf-menu-trigger` lets toggles switch menus
   * in one press; clicks elsewhere close the open menu.
   */
  private ensureToolbarMenuOutsideListener(): void {
    if (this.toolbarMenuOutsideListener || typeof document === 'undefined') {
      return;
    }
    this.toolbarMenuOutsideListener = (event: Event) => {
      if (this.toolbarMenuDismissGuard.shouldIgnore()) {
        return;
      }
      if (!(this.annotateMenuOpen || this.moreMenuOpen || this.zoomMenuOpen)) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest('.pdf-menu-dropdown') || target.closest('.pdf-menu-trigger')) {
        return;
      }
      this.zone.run(() => this.closeToolbarMenus());
    };
    document.addEventListener('pointerdown', this.toolbarMenuOutsideListener, true);
  }

  private teardownToolbarMenuOutsideListener(): void {
    if (!this.toolbarMenuOutsideListener || typeof document === 'undefined') {
      return;
    }
    document.removeEventListener('pointerdown', this.toolbarMenuOutsideListener, true);
    this.toolbarMenuOutsideListener = null;
  }

  /**
   * Apply a named page-size / fit zoom from the Phone Mode zoom-cluster menu.
   * Dispatches scalechanged so pdf.js refits immediately (same path as resize).
   */
  setZoomMode(mode: ZoomType): void {
    if (this.zoom !== mode) {
      this.zoom = mode;
      this.updateViewerSetting();
    }
    const app = this.pdfNotification.onPDFJSInitSignal();
    app?.eventBus?.dispatch('scalechanged', {value: mode});
    this.closeToolbarMenus();
  }

  onAnnotateHighlight(): void {
    this.toggleAnnotationEditorMode(PDF_ANNOTATION_EDITOR_MODE.HIGHLIGHT);
    this.closeToolbarMenus();
  }

  onAnnotateText(): void {
    this.toggleAnnotationEditorMode(PDF_ANNOTATION_EDITOR_MODE.FREETEXT);
    this.closeToolbarMenus();
  }

  onAnnotateDraw(): void {
    this.toggleAnnotationEditorMode(PDF_ANNOTATION_EDITOR_MODE.INK);
    this.closeToolbarMenus();
  }

  onMorePan(): void {
    this.setCursorTool(PDF_CURSOR_TOOL.HAND);
    this.closeToolbarMenus();
  }

  onMoreSelectText(): void {
    this.setCursorTool(PDF_CURSOR_TOOL.SELECT);
    this.closeToolbarMenus();
  }

  onMorePrint(): void {
    const app = this.pdfNotification.onPDFJSInitSignal();
    app?.eventBus?.dispatch('print');
    this.closeToolbarMenus();
  }

  onMoreToggleExternalLinks(): void {
    this.toggleExternalLinks();
    this.closeToolbarMenus();
  }

  onMoreToggleTheme(): void {
    this.isDarkTheme = !this.isDarkTheme;
    this.closeToolbarMenus();
  }

  private toggleAnnotationEditorMode(mode: number): void {
    const app = this.pdfNotification.onPDFJSInitSignal() as {
      eventBus?: { dispatch: (name: string, payload?: unknown) => void };
      pdfViewer?: { annotationEditorMode?: number };
    } | null;
    if (!app?.eventBus?.dispatch) return;
    const current = app.pdfViewer?.annotationEditorMode ?? this.annotationEditorMode;
    app.eventBus.dispatch('switchannotationeditormode', {
      source: this,
      mode: current === mode ? PDF_ANNOTATION_EDITOR_MODE.NONE : mode,
    });
  }

  private setCursorTool(tool: number): void {
    const app = this.pdfNotification.onPDFJSInitSignal();
    app?.eventBus?.dispatch('switchcursortool', {tool});
  }

  /**
   * Handles `pageViewModeChange` from the toolbar's mode buttons.
   *
   * The pdf-book-mode button only exposes an Angular EventEmitter (no pdf.js
   * eventBus dispatch), so without this handler book mode was a no-op:
   * clicking it did nothing visible, and it never appeared toggled because
   * `[pageViewMode]` on the button was also unbound.
   *
   * The scroll-mode buttons also emit `pageViewModeChange` in addition to
   * dispatching `switchscrollmode`, so a click on Vertical/Horizontal/etc.
   * from within book mode will correctly clear book mode via this path.
   *
   * When Book Mode is on either side of the transition, we force a viewer
   * relayout — see `scheduleModeTransitionRelayout` for the full rationale.
   */
  onPageViewModeChange(mode: PageViewModeType): void {
    if (this.pageViewMode === mode) return;
    const previous = this.pageViewMode;
    this.pageViewMode = mode;
    if (needsRelayoutForPageViewModeTransition(previous, mode)) {
      this.scheduleModeTransitionRelayout();
    }
  }

  /**
   * Force pdf.js to relayout the viewer after a Book Mode transition.
   *
   * PageFlip (used by `pageViewMode === 'book'`) mutates the viewer's DOM
   * during mount/teardown — overlay containers, absolute positioning and
   * transformed canvases. After we flip to or from Book Mode, pdf.js does
   * not always refit `page-fit` / `page-width` to the recalculated
   * container geometry, and the current page loses its scroll anchor. The
   * visible symptom is a tiny page pinned to the top-left corner.
   *
   * We wait for two animation frames so both Angular's `[(pageViewMode)]`
   * commit and PageFlip's own DOM mutation have flushed, plus a small
   * settle delay for any CSS transitions on the viewer chrome. Then we:
   *   1. Re-dispatch the current fit-mode zoom via `scalechanged` so
   *      pdf.js recalculates page geometry for the new container size.
   *   2. Fire a synthetic `resize` on `window` so pdf.js's built-in
   *      resize handler updates any container-dependent internal state
   *      (padding, scroll extent, etc.). Our own resize listener is
   *      debounced so it won't fight this pass.
   *   3. On the next frame — once the scale change has applied — scroll
   *      the current page back into view.
   */
  private scheduleModeTransitionRelayout(): void {
    const rafOuter = requestAnimationFrame(() => {
      const rafInner = requestAnimationFrame(() => {
        const settle = setTimeout(() => {
          this.forceViewerRelayout();
          this.modeTransitionTimers = this.modeTransitionTimers.filter(t => t !== settle);
        }, 50);
        this.modeTransitionTimers.push(settle);
      });
      this.modeTransitionRafHandles.push(rafInner);
    });
    this.modeTransitionRafHandles.push(rafOuter);
  }

  private forceViewerRelayout(): void {
    this.syncViewerChromeInsets();
    const app = this.pdfNotification.onPDFJSInitSignal();
    if (!app?.eventBus) return;

    const fitModes: string[] = ['page-fit', 'page-width', 'auto'];
    if (fitModes.includes(this.zoom as string)) {
      app.eventBus.dispatch('scalechanged', {value: this.zoom});
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('resize'));
    }

    const raf = requestAnimationFrame(() => {
      if (this.page && this.page > 0) {
        try {
          this.pdfViewerService.scrollPageIntoView(this.page);
        } catch {
          // Viewer not ready — the scalechanged dispatch above will still refit.
        }
      }
    });
    this.modeTransitionRafHandles.push(raf);
  }

  /**
   * Keep `#viewerContainer` top inset aligned with the real toolbar height.
   * Prevents page-fit from sizing into chrome and leaving a few pixels of scroll.
   */
  private syncViewerChromeInsets(): void {
    if (typeof document === 'undefined') return;
    const toolbar =
      document.getElementById('toolbarContainer') ??
      document.getElementById('toolbarViewer');
    const viewer = document.getElementById('viewerContainer');
    if (!viewer) return;

    const measured = toolbar?.getBoundingClientRect().height ?? PDF_TOOLBAR_HEIGHT_FALLBACK_PX;
    const topPx = resolvePdfViewerTopPx(measured);
    viewer.style.top = `${topPx}px`;
    // Touch zones follow viewer top; keep --pdf-toolbar-height locked so the
    // bar does not grow when we apply ngx's 33px floor.
    (this.hostRef.nativeElement as HTMLElement).style.setProperty(
      '--pdf-viewer-top',
      `${topPx}px`
    );
  }

  private cancelPendingModeTransitionWork(): void {
    for (const handle of this.modeTransitionRafHandles) {
      cancelAnimationFrame(handle);
    }
    this.modeTransitionRafHandles = [];
    for (const timer of this.modeTransitionTimers) {
      clearTimeout(timer);
    }
    this.modeTransitionTimers = [];
  }

  private isPageBasedMode(): boolean {
    return this.currentScrollMode === PdfScrollMode.Page
      || this.currentScrollMode === PdfScrollMode.Horizontal;
  }

  /** Flash touch zone hints for 1.2s, then fade out. */
  flashTouchZones(): void {
    if (!this.mobileUx.hasTouchInput) return;
    if (!this.isPageBasedMode()) return;

    // Clear any existing timers
    if (this.touchZoneTimer) clearTimeout(this.touchZoneTimer);
    if (this.touchZoneFadeTimer) clearTimeout(this.touchZoneFadeTimer);

    this.showTouchZones = true;
    this.touchZonesFading = false;

    // Start fade-out after 1.2s
    this.touchZoneTimer = setTimeout(() => {
      this.touchZonesFading = true;
      // Remove from DOM after fade animation (400ms)
      this.touchZoneFadeTimer = setTimeout(() => {
        this.showTouchZones = false;
        this.touchZonesFading = false;
        this.touchZoneFadeTimer = null;
      }, 400);
      this.touchZoneTimer = null;
    }, 1200);
  }

  private dismissTouchZones(): void {
    if (!this.showTouchZones) return;
    if (this.touchZoneTimer) {
      clearTimeout(this.touchZoneTimer);
      this.touchZoneTimer = null;
    }
    if (this.touchZoneFadeTimer) {
      clearTimeout(this.touchZoneFadeTimer);
      this.touchZoneFadeTimer = null;
    }
    this.touchZonesFading = true;
    this.touchZoneFadeTimer = setTimeout(() => {
      this.showTouchZones = false;
      this.touchZonesFading = false;
      this.touchZoneFadeTimer = null;
    }, 400);
  }

  // ── Orientation / resize zoom refit ─────────────────────────────────────

  private initResizeListener(): void {
    if (this.resizeListener || typeof window === 'undefined') return;

    this.resizeListener = () => {
      if (this.resizeDebounceTimer) clearTimeout(this.resizeDebounceTimer);
      this.resizeDebounceTimer = setTimeout(() => {
        this.resizeDebounceTimer = null;
        this.refitZoomAfterResize();
      }, 250);
    };
    window.addEventListener('resize', this.resizeListener);
  }

  private destroyResizeListener(): void {
    if (this.resizeListener && typeof window !== 'undefined') {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = null;
    }
    if (this.resizeDebounceTimer) {
      clearTimeout(this.resizeDebounceTimer);
      this.resizeDebounceTimer = null;
    }
  }

  /**
   * After an orientation change or window resize, re-dispatch the current zoom
   * so PDF.js recalculates page-fit / page-width for the new viewport dimensions.
   */
  private refitZoomAfterResize(): void {
    const fitModes: string[] = ['page-fit', 'page-width', 'auto'];
    if (!fitModes.includes(this.zoom as string)) return;

    this.syncViewerChromeInsets();
    const app = this.pdfNotification.onPDFJSInitSignal();
    if (!app?.eventBus) return;

    // Re-dispatch the same zoom type so PDF.js recalculates for the new viewport
    app.eventBus.dispatch('scalechanged', {value: this.zoom});
  }
}
