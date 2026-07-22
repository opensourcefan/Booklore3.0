import {Component, HostListener, inject, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {
  EditorAnnotation,
  NgxExtendedPdfViewerModule,
  NgxExtendedPdfViewerService,
  PageViewModeType,
  PDFNotificationService,
  pdfDefaultOptions,
  ScrollModeType,
  ZoomType,
} from 'ngx-extended-pdf-viewer';
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
import {PdfFooterComponent} from './layout/pdf-footer.component';
import {
  isTouchTap,
  PdfTouchNavConfig,
  resolveCenterSwipeAction,
  resolveEdgeTapNavigation,
  resolvePdfTouchNavConfig,
  TouchNavAction,
} from './pdf-touch-nav.util';
import {ReaderHeaderFooterVisibilityManager} from '../ebook-reader/shared/visibility.util';
import {ReaderIconComponent} from '../ebook-reader/shared/icon.component';

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

@Component({
  selector: 'app-pdf-reader',
  standalone: true,
  imports: [
    NgxExtendedPdfViewerModule,
    ProgressSpinner,
    TranslocoPipe,
    BookmarkTitleDialogComponent,
    PdfSidebarComponent,
    PdfFooterComponent,
    ReaderIconComponent,
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

  // Touch navigation (paginated PDF modes)
  touchNavConfig: PdfTouchNavConfig = {enabled: false, axis: 'horizontal', modeLabelKey: ''};
  showTouchHints = false;
  pdfScrollMode: ScrollModeType = ScrollModeType.vertical;
  pdfPageViewMode: PageViewModeType = 'multiple';
  private pdfViewModeListener: ((evt: unknown) => void) | null = null;
  private pdfPageViewModeListener: ((evt: unknown) => void) | null = null;
  private touchHintTimeout: ReturnType<typeof setTimeout> | null = null;
  private isReaderTouchActive = false;
  private touchMoved = false;
  private touchStartX = 0;
  private touchStartY = 0;
  private touchEndX = 0;
  private touchEndY = 0;
  private touchStartTime = 0;
  private touchIsMultiGesture = false;

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
  private readerBrowserZoomLocked = false;

  isChromePinned = false;
  chromeHeaderVisible = false;
  chromeFooterVisible = false;
  private visibilityManager!: ReaderHeaderFooterVisibilityManager;
  private touchChromeTimeout: ReturnType<typeof setTimeout> | null = null;
  private footerLayoutActive = false;

  get touchNavEnabled(): boolean {
    return this.touchNavConfig.enabled;
  }

  get pdfChromeHeaderVisible(): boolean {
    return this.isChromePinned || this.chromeHeaderVisible;
  }

  get pdfFooterShown(): boolean {
    return this.touchNavEnabled && (this.isChromePinned || this.chromeFooterVisible);
  }

  /** Reserve viewer space when the footer bar is on screen. */
  get pdfFooterLayoutActive(): boolean {
    return this.pdfFooterShown;
  }

  ngOnInit(): void {
    this.lockReaderBrowserZoomIfNeeded();
    this.disableExternalLinks = localStorage.getItem('fable_pdf_disable_external_links') === 'true';
    this.visibilityManager = new ReaderHeaderFooterVisibilityManager(window.innerHeight);
    this.isChromePinned = this.visibilityManager.getIsPinned();
    this.visibilityManager.onStateChange((state) => {
      this.isChromePinned = this.visibilityManager.getIsPinned();
      this.chromeHeaderVisible = state.headerVisible;
      this.chromeFooterVisible = state.footerVisible;
      this.syncFooterLayoutIfNeeded();
    });
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
      this.ensurePdfViewModeListeners(app);
      this.syncPdfViewMode(app);
    }
    const percentage = this.totalPages > 0 ? Math.round((this.page / this.totalPages) * 1000) / 10 : 0;
    this.readingSessionService.startSession(this.bookId, "PDF", this.page.toString(), percentage);
    this.readingSessionService.updateProgress(this.page.toString(), percentage);
    this.loadAnnotations();
    this.refreshViewerLayout();
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
    if (this.pdfViewModeListener && app?.eventBus?.off) {
      app.eventBus.off('switchscrollmode', this.pdfViewModeListener);
      this.pdfViewModeListener = null;
    }
    if (this.pdfPageViewModeListener && app?.eventBus?.off) {
      app.eventBus.off('pageviewmodechanged', this.pdfPageViewModeListener);
      this.pdfPageViewModeListener = null;
    }
    if (this.touchHintTimeout) {
      clearTimeout(this.touchHintTimeout);
      this.touchHintTimeout = null;
    }
    if (this.touchChromeTimeout) {
      clearTimeout(this.touchChromeTimeout);
      this.touchChromeTimeout = null;
    }

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

  onPdfPageViewModeChange(mode: PageViewModeType): void {
    if (!mode || mode === this.pdfPageViewMode) {
      return;
    }
    this.pdfPageViewMode = mode;
    this.updateTouchNavState(true);
  }

  onPdfScrollModeChange(mode: ScrollModeType): void {
    if (typeof mode !== 'number' || mode === this.pdfScrollMode) {
      return;
    }
    this.pdfScrollMode = mode;
    this.updateTouchNavState(true);
  }

  toggleChromePin(): void {
    this.isChromePinned = !this.isChromePinned;
    this.visibilityManager.setPinned(this.isChromePinned);
    if (this.touchChromeTimeout) {
      clearTimeout(this.touchChromeTimeout);
      this.touchChromeTimeout = null;
    }
    this.syncFooterLayoutIfNeeded();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    this.visibilityManager?.handleMouseMove(event.clientY);
  }

  @HostListener('document:mouseleave')
  onMouseLeave(): void {
    this.visibilityManager?.handleMouseLeave();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.visibilityManager?.updateWindowHeight(window.innerHeight);
    this.refreshViewerLayout();
  }

  goToPreviousPage(): void {
    if (this.page > 1) {
      this.page = this.page - 1;
    }
  }

  goToNextPage(): void {
    if (this.totalPages > 0 && this.page < this.totalPages) {
      this.page = this.page + 1;
    }
  }

  goToFirstPage(): void {
    if (this.page !== 1) {
      this.page = 1;
    }
  }

  goToLastPage(): void {
    if (this.totalPages > 0 && this.page !== this.totalPages) {
      this.page = this.totalPages;
    }
  }

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent): void {
    if (!this.isWithinPdfViewer(event.target) || this.isTouchNavBlocked(event.target)) {
      return;
    }

    this.isReaderTouchActive = true;
    this.touchIsMultiGesture = event.touches.length > 1;
    this.touchMoved = false;
    this.touchStartTime = Date.now();
    const touch = event.changedTouches[0] ?? event.touches[0];
    if (!touch) {
      return;
    }
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchEndX = touch.clientX;
    this.touchEndY = touch.clientY;
    this.visibilityManager?.handleMouseMove(touch.clientY);
  }

  @HostListener('document:touchmove', ['$event'])
  onTouchMove(event: TouchEvent): void {
    if (!this.isReaderTouchActive) {
      return;
    }
    if (event.touches.length > 1) {
      this.touchIsMultiGesture = true;
      return;
    }
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    this.touchEndX = touch.clientX;
    this.touchEndY = touch.clientY;
    if (Math.abs(this.touchEndX - this.touchStartX) > 8 || Math.abs(this.touchEndY - this.touchStartY) > 8) {
      this.touchMoved = true;
    }
    this.visibilityManager?.handleMouseMove(touch.clientY);
  }

  @HostListener('document:touchend', ['$event'])
  onTouchEnd(event: TouchEvent): void {
    if (!this.isReaderTouchActive) {
      return;
    }

    const touch = event.changedTouches[0];
    if (touch) {
      this.touchEndX = touch.clientX;
      this.touchEndY = touch.clientY;
    }

    const wasActive = this.isReaderTouchActive;
    this.isReaderTouchActive = false;

    if (!wasActive || this.touchIsMultiGesture) {
      return;
    }

    if (this.pdfJsSidebarOpen && this.isWithinPdfSidebar(event.target)) {
      return;
    }

    const deltaX = this.touchEndX - this.touchStartX;
    const deltaY = this.touchEndY - this.touchStartY;
    const durationMs = Date.now() - this.touchStartTime;
    const tapped = isTouchTap(deltaX, deltaY, durationMs, this.touchMoved);

    if (this.touchNavEnabled && !this.isAnnotationEditingActive()) {
      const edgeAction = resolveEdgeTapNavigation(
        deltaX,
        deltaY,
        durationMs,
        this.touchMoved,
        this.touchEndX,
        window.innerWidth,
      );
      if (edgeAction !== 'none') {
        this.applyTouchNavAction(edgeAction);
        return;
      }

      const swipeAction = resolveCenterSwipeAction(
        {x: this.touchStartX, y: this.touchStartY},
        {x: this.touchEndX, y: this.touchEndY},
        window.innerWidth,
        this.touchNavConfig.axis,
      );
      if (swipeAction !== 'none') {
        this.applyTouchNavAction(swipeAction);
        return;
      }
    }

    if (tapped && this.isWithinPdfViewer(event.target) && !this.isTouchNavBlocked(event.target)) {
      this.revealTouchChrome();
    }
  }

  private applyTouchNavAction(action: TouchNavAction): void {
    if (action === 'previous') {
      this.goToPreviousPage();
    } else if (action === 'next') {
      this.goToNextPage();
    }
  }

  private isWithinPdfViewer(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el?.closest('#viewerContainer, #viewer');
  }

  private isWithinPdfSidebar(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el?.closest('#sidebarContainer, #sidebarContent, #thumbnailView, #outlineView');
  }

  private isTouchNavBlocked(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) {
      return true;
    }
    return !!el.closest(
      '.pdf-footer, .pdf-sidebar, .sidebar-overlay, .bookmark-dialog-overlay, #toolbarContainer, #secondaryToolbar, .findbar, .editorParamsToolbar, .pdf-touch-hints, #sidebarContainer, #sidebarContent',
    );
  }

  private isAnnotationEditingActive(): boolean {
    const app = this.pdfNotification.onPDFJSInitSignal() as {
      pdfViewer?: {annotationEditorMode?: number};
    } | undefined;
    const mode = app?.pdfViewer?.annotationEditorMode;
    return mode != null && mode !== 0;
  }

  private ensurePdfViewModeListeners(app: {
    eventBus?: {on?: (name: string, listener: (evt: unknown) => void) => void};
  }): void {
    if (!app.eventBus?.on) {
      return;
    }

    if (!this.pdfViewModeListener) {
      this.pdfViewModeListener = (evt: unknown) => {
        const mode = (evt as {mode?: number}).mode;
        if (typeof mode === 'number') {
          this.pdfScrollMode = mode as ScrollModeType;
          this.updateTouchNavState(true);
        }
      };
      app.eventBus.on('switchscrollmode', this.pdfViewModeListener);
    }

    if (!this.pdfPageViewModeListener) {
      this.pdfPageViewModeListener = (evt: unknown) => {
        const pageViewMode = (evt as {pageViewMode?: string}).pageViewMode;
        if (typeof pageViewMode === 'string') {
          this.pdfPageViewMode = pageViewMode as PageViewModeType;
          this.updateTouchNavState(true);
        }
      };
      app.eventBus.on('pageviewmodechanged', this.pdfPageViewModeListener);
    }
  }

  private syncPdfViewMode(app: {
    pdfViewer?: {scrollMode?: number; pageViewMode?: string};
  }): void {
    if (typeof app.pdfViewer?.scrollMode === 'number') {
      this.pdfScrollMode = app.pdfViewer.scrollMode as ScrollModeType;
    }
    if (typeof app.pdfViewer?.pageViewMode === 'string') {
      this.pdfPageViewMode = app.pdfViewer.pageViewMode as PageViewModeType;
    }
    this.updateTouchNavState(false);
  }

  private updateTouchNavState(flashHints: boolean): void {
    const next = resolvePdfTouchNavConfig(
      this.pdfScrollMode,
      this.pdfPageViewMode,
      this.mobileUx.hasTouchInput,
    );
    const modeChanged = next.modeLabelKey !== this.touchNavConfig.modeLabelKey
      || next.enabled !== this.touchNavConfig.enabled
      || next.axis !== this.touchNavConfig.axis;
    const enabledChanged = next.enabled !== this.touchNavConfig.enabled;
    this.touchNavConfig = next;
    if (enabledChanged) {
      this.syncFooterLayoutIfNeeded();
    }
    if (flashHints && next.enabled && modeChanged) {
      this.flashTouchHints();
    }
  }

  private syncFooterLayoutIfNeeded(): void {
    const next = this.pdfFooterLayoutActive;
    if (next === this.footerLayoutActive) {
      return;
    }
    this.footerLayoutActive = next;
    this.refreshViewerLayout();
  }

  private refreshViewerLayout(): void {
    queueMicrotask(() => {
      this.triggerPdfViewerResize();
      // Re-apply zoom after layout settles so page-fit / auto use the updated viewport.
      setTimeout(() => {
        const app = this.pdfNotification.onPDFJSInitSignal() as {
          pdfViewer?: {currentScaleValue?: string | number; update?: () => void};
        } | undefined;
        app?.pdfViewer?.update?.();
        if (app?.pdfViewer && this.zoom) {
          app.pdfViewer.currentScaleValue = this.zoom;
        }
      }, 0);
    });
  }

  private triggerPdfViewerResize(): void {
    window.dispatchEvent(new Event('resize'));
    const app = this.pdfNotification.onPDFJSInitSignal() as {
      eventBus?: {dispatch: (name: string, data?: unknown) => void};
    } | undefined;
    app?.eventBus?.dispatch('resize', {});
  }

  private flashTouchHints(): void {
    if (!this.touchNavEnabled) {
      return;
    }
    this.showTouchHints = true;
    if (this.touchHintTimeout) {
      clearTimeout(this.touchHintTimeout);
    }
    this.touchHintTimeout = setTimeout(() => {
      this.showTouchHints = false;
      this.touchHintTimeout = null;
    }, 1200);
  }

  private revealTouchChrome(): void {
    if (this.isChromePinned || !this.mobileUx.hasTouchInput) {
      return;
    }

    this.chromeHeaderVisible = true;
    this.chromeFooterVisible = true;
    this.syncFooterLayoutIfNeeded();

    if (this.touchChromeTimeout) {
      clearTimeout(this.touchChromeTimeout);
    }
    this.touchChromeTimeout = setTimeout(() => {
      if (!this.isChromePinned) {
        this.visibilityManager.handleMouseLeave();
      }
      this.touchChromeTimeout = null;
    }, 2200);
  }
}
