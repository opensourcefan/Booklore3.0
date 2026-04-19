import {Component, DoCheck, ElementRef, HostListener, inject, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {CommonModule} from '@angular/common';
import {forkJoin, Subject} from 'rxjs';
import {debounceTime, filter, first, map, switchMap, takeUntil, timeout} from 'rxjs/operators';
import {PageTitleService} from "../../../shared/service/page-title.service";
import {CbxReaderService} from '../../book/service/cbx-reader.service';
import {BookService} from '../../book/service/book.service';
import {CbxBackgroundColor, CbxFitMode, CbxMagnifierLensSize, CbxMagnifierZoom, CbxPageSpread, CbxPageViewMode, CbxScrollMode, CbxReadingDirection, CbxSlideshowInterval, UserService} from '../../settings/user-management/user.service';
import {MessageService} from 'primeng/api';
import {TranslocoService, TranslocoPipe} from '@jsverse/transloco';
import {Book, BookSetting, BookType} from '../../book/model/book.model';
import {BookState} from '../../book/model/state/book-state.model';
import {ProgressSpinner} from 'primeng/progressspinner';
import {FormsModule} from "@angular/forms";
import {ReadingSessionService} from '../../../shared/service/reading-session.service';
import {ReaderHeaderFooterVisibilityManager} from '../ebook-reader';

import {CbxHeaderComponent} from './layout/header/cbx-header.component';
import {CbxHeaderService} from './layout/header/cbx-header.service';
import {CbxSidebarComponent} from './layout/sidebar/cbx-sidebar.component';
import {CbxSidebarService} from './layout/sidebar/cbx-sidebar.service';
import {CbxFooterComponent} from './layout/footer/cbx-footer.component';
import {CbxFooterService} from './layout/footer/cbx-footer.service';
import {CbxQuickSettingsComponent} from './layout/quick-settings/cbx-quick-settings.component';
import {CbxJoystickSensitivity, CbxQuickSettingsService} from './layout/quick-settings/cbx-quick-settings.service';
import {CbxNoteDialogComponent, CbxNoteDialogData, CbxNoteDialogResult} from './dialogs/cbx-note-dialog.component';
import {CbxShortcutsHelpComponent} from './dialogs/cbx-shortcuts-help.component';
import {BookNoteV2} from '../../../shared/service/book-note-v2.service';
import {AppSettingsService} from '../../../shared/service/app-settings.service';
import {ComicPanelFlowService} from '../../../shared/service/comic-panel-flow.service';
import {AiPanelScanProgressPayload} from '../../../shared/model/ai-panel-scan-progress.model';
import {AiPanelScanProgressService} from '../../../shared/service/ai-panel-scan-progress.service';
import {MobileBackHandle, MobileBackNavigationService} from '../../../shared/service/mobile-back-navigation.service';

interface CbxPanelRegion {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
}

interface CbxPagePanelData {
  pageNumber: number;
  panels: CbxPanelRegion[];
}

interface CbxJoystickDevicePreferences {
  enabled: boolean;
  sensitivity: CbxJoystickSensitivity;
  positionLocked: boolean;
  recenterOnTouch: boolean;
  indicatorVisible: boolean;
  indicatorOpacity: number;
  anchorX: number;
  anchorY: number;
}

type CbxMobileSurface = 'sidebar' | 'quickSettings' | 'noteDialog' | 'shortcutsHelp';
type CbxPinchGestureMode = 'panel' | 'manual';


@Component({
  selector: 'app-cbx-reader',
  standalone: true,
  imports: [
    CommonModule,
    ProgressSpinner,
    FormsModule,
    TranslocoPipe,
    CbxHeaderComponent,
    CbxSidebarComponent,
    CbxFooterComponent,
    CbxQuickSettingsComponent,
    CbxNoteDialogComponent,
    CbxShortcutsHelpComponent
  ],
  providers: [
    CbxHeaderService,
    CbxSidebarService,
    CbxFooterService,
    CbxQuickSettingsService
  ],
  templateUrl: './cbx-reader.component.html',
  styleUrl: './cbx-reader.component.scss'
})
export class CbxReaderComponent implements OnInit, OnDestroy, DoCheck {
  private static readonly JOYSTICK_DEVICE_STORAGE_KEY = 'booklore.cbx.mobileJoystick.v1';
  private static readonly JOYSTICK_RADIUS_PX = 30;
  private static readonly JOYSTICK_DEADZONE_PX = 6;
  private static readonly JOYSTICK_MARGIN_PX = 26;
  private static readonly JOYSTICK_EDGE_OVERSCAN_RATIO = 0.24;
  private static readonly JOYSTICK_EDGE_OVERSCAN_MAX_PX = 120;
  private static readonly JOYSTICK_BASE_SPEED = 0.6;
  private static readonly JOYSTICK_MAX_SPEED_DELTA = 4.6;
  private static readonly JOYSTICK_INPUT_SMOOTHING = 0.2;
  private static readonly JOYSTICK_RELEASE_SMOOTHING = 0.38;
  private static readonly JOYSTICK_STARTUP_RAMP_MS = 360;
  private static readonly JOYSTICK_STARTUP_SPEED_FLOOR = 0.16;
  private static readonly JOYSTICK_STARTUP_DEADZONE_BONUS_PX = 10;
  private static readonly MANUAL_PAGE_MIN_ZOOM = 1;
  private static readonly MANUAL_PAGE_MAX_ZOOM = 3.5;

  private destroy$ = new Subject<void>();
  private progressSaveSubject$ = new Subject<void>();

  bookType!: BookType;
  bookId!: number;
  bookFileId?: number;
  altBookType?: string;
  pages: number[] = [];
  currentPage = 0;
  isLoading = true;

  pageSpread: CbxPageSpread = CbxPageSpread.ODD;
  pageViewMode: CbxPageViewMode = CbxPageViewMode.SINGLE_PAGE;
  backgroundColor: CbxBackgroundColor = CbxBackgroundColor.GRAY;
  fitMode: CbxFitMode = CbxFitMode.FIT_PAGE;
  scrollMode: CbxScrollMode = CbxScrollMode.PAGINATED;

  private touchStartX = 0;
  private touchStartY = 0;
  private touchEndX = 0;
  private touchEndY = 0;
  private touchMoved = false;
  private touchIsMultiGesture = false;
  private touchStartTime = 0;
  private pinchStartDistance = 0;
  private pinchStartZoom = 1;
  private pinchStartPanX = 0;
  private pinchStartPanY = 0;
  private pinchStartCenterX = 0;
  private pinchStartCenterY = 0;
  private pinchGestureMode: CbxPinchGestureMode | null = null;

  currentBook: Book | null = null;
  nextBookInSeries: Book | null = null;
  previousBookInSeries: Book | null = null;

  infiniteScrollPages: number[] = [];
  preloadCount = 3;
  isLoadingMore = false;

  private preloadedImages = new Map<string, HTMLImageElement>();
  previousImageUrls: string[] = [];
  currentImageUrls: string[] = [];
  isPageTransitioning = false;
  imagesLoaded = false;

  private visibilityManager!: ReaderHeaderFooterVisibilityManager;

  isCurrentPageBookmarked = false;
  currentPageHasNotes = false;
  showNoteDialog = false;
  noteDialogData: CbxNoteDialogData | null = null;
  private editingNote: BookNoteV2 | null = null;

  // Footer visibility (for slideshow progress bar positioning)
  isFooterVisible = false;

  // Fullscreen state
  isFullscreen = false;

  // Reading direction
  readingDirection: CbxReadingDirection = CbxReadingDirection.LTR;

  // Slideshow state
  isSlideshowActive = false;
  slideshowInterval: CbxSlideshowInterval = CbxSlideshowInterval.FIVE_SECONDS;
  private slideshowTimer: ReturnType<typeof setInterval> | null = null;

  // Double-tap zoom
  private lastTapTime = 0;
  private originalFitMode: CbxFitMode | null = null;

  // Shortcuts help dialog
  showShortcutsHelp = false;

  // Panel mode
  panelModeEnabled = false;
  activePanelIndex = -1;
  private detectedPanelsByPage = new Map<number, CbxPanelRegion[]>();
  panelManualZoom = 1;
  panelTravelFactor = 1;
  panelPanX = 0;
  panelPanY = 0;
  showPanelTouchZones = false;
  showMobilePanelOverview = false;
  private isPanelDragging = false;
  private panelDragMoved = false;
  private panelDragStartX = 0;
  private panelDragStartY = 0;
  private panelTouchHintTimeout: ReturnType<typeof setTimeout> | null = null;
  private mobilePanelOverviewTimeout: ReturnType<typeof setTimeout> | null = null;
  private touchChromeTimeout: ReturnType<typeof setTimeout> | null = null;
  private suppressImageClick = false;
  private isReaderTouchActive = false;

  // Header/footer pin state
  isHeaderFooterPinned = false;

  // Magnifier
  isMagnifierActive = false;
  @ViewChild('magnifierLens', {static: true}) private magnifierLensRef!: ElementRef<HTMLDivElement>;
  @ViewChild('imageContainer') private imageContainerRef?: ElementRef<HTMLDivElement>;
  magnifierZoom: CbxMagnifierZoom = CbxMagnifierZoom.ZOOM_3X;
  magnifierLensSize: CbxMagnifierLensSize = CbxMagnifierLensSize.MEDIUM;
  private lastMouseEvent: MouseEvent | null = null;

  // Mobile joystick (device-local only)
  joystickEnabled = false;
  joystickSensitivity: CbxJoystickSensitivity = 'NORMAL';
  joystickPositionLocked = true;
  joystickRecenterOnTouch = true;
  joystickIndicatorVisible = true;
  joystickIndicatorOpacity = 0.88;
  joystickAnchorX = 0.86;
  joystickAnchorY = 0.78;
  joystickActive = false;
  joystickKnobX = 0;
  joystickKnobY = 0;
  manualPageZoom = 1;
  manualPagePanX = 0;
  manualPagePanY = 0;
  private joystickVelocityX = 0;
  private joystickVelocityY = 0;
  private joystickInteractionStartMs = 0;
  private joystickPointerId: number | null = null;
  private joystickAnimationFrame: number | null = null;

  // Double page detection
  private pageDimensionsCache = new Map<number, {width: number, height: number}>();

  aiPanelDetectionEnabled = false;
  isAiPanelDetectionWorking = false;
  aiPanelDetectionReady = false;
  hasSavedAiPanelFlow = false;
  aiScanStatusText = '';

  protected readonly CbxReadingDirection = CbxReadingDirection;
  protected readonly CbxSlideshowInterval = CbxSlideshowInterval;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cbxReaderService = inject(CbxReaderService);
  private bookService = inject(BookService);
  private userService = inject(UserService);
  private messageService = inject(MessageService);
  private readonly t = inject(TranslocoService);
  private pageTitle = inject(PageTitleService);
  private readingSessionService = inject(ReadingSessionService);
  private headerService = inject(CbxHeaderService);
  private sidebarService = inject(CbxSidebarService);
  private footerService = inject(CbxFooterService);
  private quickSettingsService = inject(CbxQuickSettingsService);
  private appSettingsService = inject(AppSettingsService);
  private comicPanelFlowService = inject(ComicPanelFlowService);
  private aiPanelScanProgressService = inject(AiPanelScanProgressService);
  private mobileBackNavigation = inject(MobileBackNavigationService);

  protected readonly CbxScrollMode = CbxScrollMode;
  protected readonly CbxFitMode = CbxFitMode;
  protected readonly CbxBackgroundColor = CbxBackgroundColor;
  protected readonly CbxPageViewMode = CbxPageViewMode;
  protected readonly CbxPageSpread = CbxPageSpread;

  private static readonly TYPE_CBX = 'CBX';
  private static readonly SETTING_GLOBAL = 'Global';
  private mobileBackHandles: Partial<Record<CbxMobileSurface, MobileBackHandle>> = {};

  ngOnInit() {
    this.loadJoystickDevicePreferences();

    this.visibilityManager = new ReaderHeaderFooterVisibilityManager(window.innerHeight);
    this.isHeaderFooterPinned = this.visibilityManager.getIsPinned();
    this.visibilityManager.onStateChange((state) => {
      this.isHeaderFooterPinned = this.visibilityManager.getIsPinned();
      this.headerService.setForceVisible(state.headerVisible);
      this.footerService.setForceVisible(state.footerVisible);
    });

    this.footerService.forceVisible$
      .pipe(takeUntil(this.destroy$))
      .subscribe(visible => this.isFooterVisible = visible);

    this.progressSaveSubject$.pipe(
      debounceTime(2000),
      takeUntil(this.destroy$)
    ).subscribe(() => this.updateProgress());

    this.subscribeToHeaderEvents();
    this.subscribeToSidebarEvents();
    this.subscribeToFooterEvents();
    this.subscribeToQuickSettingsEvents();

    this.appSettingsService.appSettings$
      .pipe(
        filter((settings) => !!settings),
        takeUntil(this.destroy$)
      )
      .subscribe(settings => {
        this.aiPanelDetectionEnabled = settings.aiPanelDetectionEnabled;
      });

    this.aiPanelScanProgressService.progress$
      .pipe(takeUntil(this.destroy$))
      .subscribe(progress => this.handleAiScanProgress(progress));

    this.route.paramMap.subscribe((params) => {
      this.isLoading = true;
      this.bookId = +params.get('bookId')!;
      this.altBookType = this.route.snapshot.queryParamMap.get('bookType') ?? undefined;
      this.aiPanelDetectionReady = false;
      this.hasSavedAiPanelFlow = false;
      this.isAiPanelDetectionWorking = false;
      this.aiScanStatusText = '';
      this.detectedPanelsByPage.clear();
      this.resetPanelViewport();
      this.activePanelIndex = this.panelModeEnabled ? -1 : 0;

      this.previousBookInSeries = null;
      this.nextBookInSeries = null;
      this.currentBook = null;

      this.bookService.getBookByIdFromAPI(this.bookId, false).pipe(
        switchMap((book) => {
          // Use alternative bookType from query param if provided, otherwise use primary
          this.bookType = (this.altBookType as BookType) ?? book.primaryFile?.bookType ?? 'EPUB';;
          this.currentBook = book;

          // Determine which file ID to use for progress tracking
          if (this.altBookType) {
            const altFile = book.alternativeFormats?.find(f => f.bookType === this.altBookType);
            this.bookFileId = altFile?.id;
          } else {
            this.bookFileId = book.primaryFile?.id;
          }

          return forkJoin([
            this.bookService.getBookSetting(this.bookId, this.bookFileId!),
            this.userService.getMyself()
          ]).pipe(map(([bookSettings, myself]) => ({ book, bookSettings, myself })));
        })
      ).subscribe({
        next: ({ book, bookSettings, myself }) => {
          const userSettings = myself.userSettings;

          this.pageTitle.setBookPageTitle(book);

          const title = book.metadata?.title || book.fileName;
          this.headerService.initialize(this.bookId, title, this.destroy$);
          this.sidebarService.initialize(this.bookId, book, this.destroy$, this.altBookType);

          if (book.metadata?.seriesName) {
            this.loadSeriesNavigationAsync(book);
          }

          const pagesObservable = this.cbxReaderService.getAvailablePages(this.bookId, this.altBookType);

          pagesObservable.subscribe({
            next: (pages) => {
              this.pages = pages;
              if (this.bookType === CbxReaderComponent.TYPE_CBX) {
                const global = userSettings.perBookSetting.cbx === CbxReaderComponent.SETTING_GLOBAL;
                this.pageViewMode = global
                  ? this.CbxPageViewMode[userSettings.cbxReaderSetting.pageViewMode as keyof typeof CbxPageViewMode] || this.CbxPageViewMode.SINGLE_PAGE
                  : this.CbxPageViewMode[bookSettings.cbxSettings?.pageViewMode as keyof typeof CbxPageViewMode] || this.CbxPageViewMode[userSettings.cbxReaderSetting.pageViewMode as keyof typeof CbxPageViewMode] || this.CbxPageViewMode.SINGLE_PAGE;

                this.pageSpread = global
                  ? this.CbxPageSpread[userSettings.cbxReaderSetting.pageSpread as keyof typeof CbxPageSpread] || this.CbxPageSpread.ODD
                  : this.CbxPageSpread[bookSettings.cbxSettings?.pageSpread as keyof typeof CbxPageSpread] || this.CbxPageSpread[userSettings.cbxReaderSetting.pageSpread as keyof typeof CbxPageSpread] || this.CbxPageSpread.ODD;

                this.fitMode = global
                  ? this.CbxFitMode[userSettings.cbxReaderSetting.fitMode as keyof typeof CbxFitMode] || this.CbxFitMode.FIT_PAGE
                  : this.CbxFitMode[bookSettings.cbxSettings?.fitMode as keyof typeof CbxFitMode] || this.CbxFitMode[userSettings.cbxReaderSetting.fitMode as keyof typeof CbxFitMode] || this.CbxFitMode.FIT_PAGE;

                this.scrollMode = global
                  ? this.CbxScrollMode[userSettings.cbxReaderSetting.scrollMode as keyof typeof CbxScrollMode] || CbxScrollMode.PAGINATED
                  : this.CbxScrollMode[bookSettings.cbxSettings?.scrollMode as keyof typeof CbxScrollMode] || this.CbxScrollMode[userSettings.cbxReaderSetting.scrollMode as keyof typeof CbxScrollMode] || CbxScrollMode.PAGINATED;

                this.backgroundColor = global
                  ? this.CbxBackgroundColor[userSettings.cbxReaderSetting.backgroundColor as keyof typeof CbxBackgroundColor] || CbxBackgroundColor.GRAY
                  : this.CbxBackgroundColor[bookSettings.cbxSettings?.backgroundColor as keyof typeof CbxBackgroundColor] || this.CbxBackgroundColor[userSettings.cbxReaderSetting.backgroundColor as keyof typeof CbxBackgroundColor] || CbxBackgroundColor.GRAY;

                this.currentPage = (book.cbxProgress?.page || 1) - 1;

                if (this.scrollMode === CbxScrollMode.INFINITE) {
                  this.initializeInfiniteScroll();
                }
              }

              this.alignCurrentPageToParity();
              this.updateServiceStates();
              this.updateBookmarkState();
              this.updateNotesState();
              this.isLoading = false;

              this.updateCurrentImageUrls();
              this.preloadAdjacentPages();
              this.loadExistingAiPanelFlow();

              const percentage = this.pages.length > 0 ? Math.round(((this.currentPage + 1) / this.pages.length) * 1000) / 10 : 0;
              this.readingSessionService.startSession(this.bookId, "CBX", (this.currentPage + 1).toString(), percentage);
            },
            error: (err) => {
              const errorMessage = err?.error?.message || this.t.translate('shared.reader.failedToLoadPages');
              this.messageService.add({severity: 'error', summary: this.t.translate('common.error'), detail: errorMessage});
              this.isLoading = false;
            }
          });
        },
        error: (err) => {
          const errorMessage = err?.error?.message || this.t.translate('shared.reader.failedToLoadBook');
          this.messageService.add({severity: 'error', summary: this.t.translate('common.error'), detail: errorMessage});
          this.isLoading = false;
        }
      });
    });
  }

  ngDoCheck(): void {
    this.syncMobileBackRegistrations();
  }

  private subscribeToHeaderEvents(): void {
    this.headerService.showQuickSettings$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.quickSettingsService.show();
      });

    this.headerService.toggleBookmark$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.toggleBookmark();
      });

    this.headerService.openNoteDialog$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.openNoteDialog();
      });

    this.headerService.toggleFullscreen$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.toggleFullscreen();
      });

    this.headerService.toggleSlideshow$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.toggleSlideshow();
      });

    this.headerService.toggleMagnifier$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.isMagnifierActive = !this.isMagnifierActive;
        if (!this.isMagnifierActive) {
          this.hideMagnifier();
        }
        this.headerService.updateState({isMagnifierActive: this.isMagnifierActive});
      });

    this.headerService.showShortcutsHelp$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.showShortcutsHelp = true;
      });

    this.headerService.togglePanelMode$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.togglePanelMode();
      });
  }

  private subscribeToSidebarEvents(): void {
    this.sidebarService.navigateToPage$
      .pipe(takeUntil(this.destroy$))
      .subscribe(page => {
        this.goToPage(page);
      });

    this.sidebarService.bookmarksChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateBookmarkState();
      });

    this.sidebarService.bookmarks$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateBookmarkState();
      });

    this.sidebarService.notes$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateNotesState();
      });

    this.sidebarService.editNote$
      .pipe(takeUntil(this.destroy$))
      .subscribe(note => {
        this.openNoteDialogForEdit(note);
      });
  }

  private subscribeToFooterEvents(): void {
    this.footerService.previousPage$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.previousPage());

    this.footerService.nextPage$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.nextPage());

    this.footerService.goToPage$
      .pipe(takeUntil(this.destroy$))
      .subscribe(page => this.goToPage(page));

    this.footerService.firstPage$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.firstPage());

    this.footerService.lastPage$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.lastPage());

    this.footerService.previousBook$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.navigateToPreviousBook());

    this.footerService.nextBook$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.navigateToNextBook());

    this.footerService.sliderChange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(page => this.goToPage(page));
  }

  private subscribeToQuickSettingsEvents(): void {
    this.quickSettingsService.fitModeChange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(mode => this.onFitModeChange(mode));

    this.quickSettingsService.scrollModeChange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(mode => this.onScrollModeChange(mode));

    this.quickSettingsService.pageViewModeChange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(mode => this.onPageViewModeChange(mode));

    this.quickSettingsService.pageSpreadChange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(spread => this.onPageSpreadChange(spread));

    this.quickSettingsService.backgroundColorChange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(color => this.onBackgroundColorChange(color));

    this.quickSettingsService.readingDirectionChange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(direction => this.onReadingDirectionChange(direction));

    this.quickSettingsService.slideshowIntervalChange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(interval => this.onSlideshowIntervalChange(interval));

    this.quickSettingsService.magnifierZoomChange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(zoom => this.onMagnifierZoomChange(zoom));

    this.quickSettingsService.magnifierLensSizeChange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(size => this.onMagnifierLensSizeChange(size));

    this.quickSettingsService.joystickEnabledChange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(enabled => this.onJoystickEnabledChange(enabled));

    this.quickSettingsService.joystickSensitivityChange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(sensitivity => this.onJoystickSensitivityChange(sensitivity));

    this.quickSettingsService.joystickPositionLockedChange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(locked => this.onJoystickPositionLockedChange(locked));

    this.quickSettingsService.joystickRecenterOnTouchChange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(enabled => this.onJoystickRecenterOnTouchChange(enabled));

    this.quickSettingsService.joystickIndicatorVisibleChange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(visible => this.onJoystickIndicatorVisibleChange(visible));

    this.quickSettingsService.joystickIndicatorOpacityChange$
      .pipe(takeUntil(this.destroy$))
      .subscribe(opacity => this.onJoystickIndicatorOpacityChange(opacity));
  }

  private updateServiceStates(): void {
    this.footerService.updateState({
      currentPage: this.currentPage,
      totalPages: this.pages.length,
      isTwoPageView: this.isTwoPageView,
      previousBookInSeries: this.previousBookInSeries,
      nextBookInSeries: this.nextBookInSeries,
      hasSeries: this.hasSeries
    });

    this.quickSettingsService.updateState({
      fitMode: this.fitMode,
      scrollMode: this.scrollMode,
      pageViewMode: this.pageViewMode,
      pageSpread: this.pageSpread,
      backgroundColor: this.backgroundColor,
      readingDirection: this.readingDirection,
      slideshowInterval: this.slideshowInterval,
      magnifierZoom: this.magnifierZoom,
      magnifierLensSize: this.magnifierLensSize,
      joystickEnabled: this.joystickEnabled,
      joystickSensitivity: this.joystickSensitivity,
      joystickPositionLocked: this.joystickPositionLocked,
      joystickRecenterOnTouch: this.joystickRecenterOnTouch,
      joystickIndicatorVisible: this.joystickIndicatorVisible,
      joystickIndicatorOpacity: this.joystickIndicatorOpacity
    });

    this.headerService.updateState({
      isFullscreen: this.isFullscreen,
      isSlideshowActive: this.isSlideshowActive,
      isPanelModeEnabled: this.isPanelModeActive
    });

    this.sidebarService.setCurrentPage(this.currentPage + 1);
  }

  private updateFooterPage(): void {
    this.footerService.setCurrentPage(this.currentPage);
    this.sidebarService.setCurrentPage(this.currentPage + 1);
    this.updateBookmarkState();
    this.updateNotesState();
  }

  private updateCurrentImageUrls(): void {
    if (!this.pages.length) {
      this.currentImageUrls = [];
      return;
    }

    const urls: string[] = [];
    urls.push(this.getPageImageUrl(this.currentPage));

    if (this.isTwoPageView && this.currentPage + 1 < this.pages.length) {
      urls.push(this.getPageImageUrl(this.currentPage + 1));
    }

    this.currentImageUrls = urls;
  }

  private preloadAdjacentPages(): void {
    if (!this.pages.length || this.scrollMode === CbxScrollMode.INFINITE || this.scrollMode === CbxScrollMode.LONG_STRIP) return;

    const pagesToPreload: number[] = [];

    const step = this.isTwoPageView ? 2 : 1;
    for (let i = 1; i <= 2; i++) {
      const nextPage = this.currentPage + (step * i);
      if (nextPage < this.pages.length) {
        pagesToPreload.push(nextPage);
        if (this.isTwoPageView && nextPage + 1 < this.pages.length) {
          pagesToPreload.push(nextPage + 1);
        }
      }
    }

    for (let i = 1; i <= 2; i++) {
      const prevPage = this.currentPage - (step * i);
      if (prevPage >= 0) {
        pagesToPreload.push(prevPage);
        if (this.isTwoPageView && prevPage + 1 < this.pages.length) {
          pagesToPreload.push(prevPage + 1);
        }
      }
    }

    pagesToPreload.forEach(pageIndex => {
      const url = this.getPageImageUrl(pageIndex);
      if (!this.preloadedImages.has(url)) {
        const img = new Image();
        img.src = url;
        this.preloadedImages.set(url, img);
      }
    });

    this.cleanupPreloadedImages(pagesToPreload);
  }

  private cleanupPreloadedImages(keepPages: number[]): void {
    const keepUrls = new Set(keepPages.map(p => this.getPageImageUrl(p)));
    this.currentImageUrls.forEach(url => keepUrls.add(url));

    for (const url of this.preloadedImages.keys()) {
      if (!keepUrls.has(url)) {
        this.preloadedImages.delete(url);
      }
    }
  }

  private transitionToNewPage(): void {
    if (this.scrollMode === CbxScrollMode.INFINITE || this.scrollMode === CbxScrollMode.LONG_STRIP) {
      this.updateCurrentImageUrls();
      return;
    }

    const newUrls = this.getNewImageUrls();

    const allPreloaded = newUrls.every(url => {
      const img = this.preloadedImages.get(url);
      return img && img.complete && img.naturalWidth > 0;
    });

    if (allPreloaded) {
      this.previousImageUrls = [...this.currentImageUrls];
      this.currentImageUrls = newUrls;
      this.isPageTransitioning = true;
      this.imagesLoaded = true;

      setTimeout(() => {
        this.isPageTransitioning = false;
        this.previousImageUrls = [];
      }, 150);
    } else {
      this.isPageTransitioning = true;
      this.imagesLoaded = false;
      this.previousImageUrls = [...this.currentImageUrls];

      this.preloadImagesAndTransition(newUrls);
    }

    this.preloadAdjacentPages();
  }

  private getNewImageUrls(): string[] {
    if (!this.pages.length) return [];

    const urls: string[] = [];
    urls.push(this.getPageImageUrl(this.currentPage));

    if (this.isTwoPageView && this.currentPage + 1 < this.pages.length) {
      urls.push(this.getPageImageUrl(this.currentPage + 1));
    }

    return urls;
  }

  private preloadImagesAndTransition(urls: string[]): void {
    let loadedCount = 0;
    const totalImages = urls.length;

    urls.forEach(url => {
      const img = new Image();
      img.onload = () => {
        loadedCount++;
        this.preloadedImages.set(url, img);

        if (loadedCount === totalImages) {
          this.currentImageUrls = urls;
          this.imagesLoaded = true;

          setTimeout(() => {
            this.isPageTransitioning = false;
            this.previousImageUrls = [];
          }, 150);
        }
      };
      img.onerror = () => {
        loadedCount++;
        if (loadedCount === totalImages) {
          this.currentImageUrls = urls;
          this.imagesLoaded = true;
          this.isPageTransitioning = false;
          this.previousImageUrls = [];
        }
      };
      img.src = url;
    });
  }

  onImageLoad(): void {
    this.imagesLoaded = true;
  }

  get isTwoPageView(): boolean {
    return this.pageViewMode === this.CbxPageViewMode.TWO_PAGE;
  }

  get hasSeries(): boolean {
    return !!this.currentBook?.metadata?.seriesName;
  }

  get showQuickSettings(): boolean {
    return this.quickSettingsService.isVisible;
  }

  nextPage() {
    this.pauseSlideshowOnInteraction();

    if (this.tryNavigatePanel(1)) {
      return;
    }

    this.advancePage(1);
  }

  previousPage() {
    this.pauseSlideshowOnInteraction();

    if (this.tryNavigatePanel(-1)) {
      return;
    }

    this.advancePage(-1);
  }

  private advancePage(direction: 1 | -1): void {
    const previousPage = this.currentPage;
    const step = this.getPageStep();

    if (this.scrollMode === CbxScrollMode.INFINITE || this.scrollMode === CbxScrollMode.LONG_STRIP) {
      const newPage = this.currentPage + direction;
      if (newPage >= 0 && newPage < this.pages.length) {
        this.currentPage = newPage;
        this.scrollToPage(this.currentPage);
        this.updateProgress();
        this.updateSessionProgress();
        this.updateFooterPage();
      }
      return;
    }

    if (direction > 0) {
      // Forward navigation
      if (this.isTwoPageView) {
        const effectiveStep = this.shouldShowSinglePage(this.currentPage) ? 1 : step;
        if (this.currentPage + effectiveStep < this.pages.length) {
          this.currentPage += effectiveStep;
        } else if (this.currentPage + 1 < this.pages.length) {
          this.currentPage += 1;
        }
      } else if (this.currentPage < this.pages.length - 1) {
        this.currentPage++;
      }
    } else {
      // Backward navigation
      if (this.isTwoPageView) {
        this.currentPage = Math.max(0, this.currentPage - step);
      } else {
        this.currentPage = Math.max(0, this.currentPage - 1);
      }
    }

    if (this.currentPage !== previousPage) {
      this.resetManualPagePan();
      if (this.panelModeEnabled) {
        // Enter each new page at full-page view first, then step into panels.
        this.activePanelIndex = -1;
      } else {
        this.activePanelIndex = 0;
      }
      this.transitionToNewPage();
      this.updateProgress();
      this.updateSessionProgress();
      this.updateFooterPage();
    }

    // Stop slideshow at last page
    if (this.isSlideshowActive && this.currentPage >= this.pages.length - 1) {
      this.stopSlideshow();
    }
  }

  private getPageStep(): number {
    return this.isTwoPageView ? 2 : 1;
  }

  private alignCurrentPageToParity() {
    if (!this.pages.length || !this.isTwoPageView) return;

    const desiredOdd = this.pageSpread === CbxPageSpread.ODD;
    for (let i = this.currentPage; i >= 0; i--) {
      if ((this.pages[i] % 2 === 1) === desiredOdd) {
        this.currentPage = i;
        this.updateProgress();
        return;
      }
    }
    for (let i = 0; i < this.pages.length; i++) {
      if ((this.pages[i] % 2 === 1) === desiredOdd) {
        this.currentPage = i;
        this.updateProgress();
        return;
      }
    }
  }

  onFitModeChange(mode: CbxFitMode): void {
    this.fitMode = mode;
    this.resetManualPageViewport();
    this.quickSettingsService.setFitMode(mode);
    this.updateViewerSetting();
  }

  onScrollModeChange(mode: CbxScrollMode): void {
    this.scrollMode = mode;
    this.resetManualPageViewport();
    this.quickSettingsService.setScrollMode(mode);
    this.updateViewerSetting();

    if (this.scrollMode === CbxScrollMode.INFINITE || this.scrollMode === CbxScrollMode.LONG_STRIP) {
      this.initializeInfiniteScroll();
      setTimeout(() => this.scrollToPage(this.currentPage), 100);
    } else {
      this.updateCurrentImageUrls();
      this.preloadAdjacentPages();
    }

    this.ensurePanelModeCompatibility();
  }

  onPageViewModeChange(mode: CbxPageViewMode): void {
    if (mode === CbxPageViewMode.TWO_PAGE && this.isPhonePortrait()) return;
    this.pageViewMode = mode;
    this.resetManualPageViewport();
    this.quickSettingsService.setPageViewMode(mode);
    this.alignCurrentPageToParity();
    this.updateCurrentImageUrls();
    this.preloadAdjacentPages();
    this.footerService.setTwoPageView(this.isTwoPageView);
    this.updateViewerSetting();
    this.ensurePanelModeCompatibility();
  }

  onPageSpreadChange(spread: CbxPageSpread): void {
    this.pageSpread = spread;
    this.resetManualPageViewport();
    this.quickSettingsService.setPageSpread(spread);
    this.alignCurrentPageToParity();
    this.updateCurrentImageUrls();
    this.preloadAdjacentPages();
    this.updateViewerSetting();
  }

  onBackgroundColorChange(color: CbxBackgroundColor): void {
    this.backgroundColor = color;
    this.resetManualPagePan();
    this.quickSettingsService.setBackgroundColor(color);
    this.updateViewerSetting();
  }

  private initializeInfiniteScroll(): void {
    this.infiniteScrollPages = [];
    const endIndex = Math.min(this.currentPage + this.preloadCount, this.pages.length);
    for (let i = this.currentPage; i < endIndex; i++) {
      this.infiniteScrollPages.push(i);
    }
  }

  onScroll(event: Event): void {
    if ((this.scrollMode !== CbxScrollMode.INFINITE && this.scrollMode !== CbxScrollMode.LONG_STRIP) || this.isLoadingMore) return;

    const container = event.target as HTMLElement;
    const scrollPosition = container.scrollTop + container.clientHeight;
    const scrollHeight = container.scrollHeight;

    if (scrollPosition >= scrollHeight * 0.8) {
      this.loadMorePages();
    }

    this.updateCurrentPageFromScroll(container);
  }

  private loadMorePages(): void {
    if (this.isLoadingMore) return;

    const lastLoadedIndex = this.infiniteScrollPages[this.infiniteScrollPages.length - 1];
    if (lastLoadedIndex >= this.pages.length - 1) return;

    this.isLoadingMore = true;
    const endIndex = Math.min(lastLoadedIndex + this.preloadCount + 1, this.pages.length);

    setTimeout(() => {
      for (let i = lastLoadedIndex + 1; i < endIndex; i++) {
        this.infiniteScrollPages.push(i);
      }
      this.isLoadingMore = false;
    }, 100);
  }

  private updateCurrentPageFromScroll(container: HTMLElement): void {
    const images = container.querySelectorAll('.page-image');
    const containerRect = container.getBoundingClientRect();

    for (let i = 0; i < images.length; i++) {
      const img = images[i] as HTMLElement;
      const rect = img.getBoundingClientRect();

      if (rect.top <= containerRect.top + containerRect.height / 2 &&
        rect.bottom >= containerRect.top + containerRect.height / 2) {
        const newPage = this.infiniteScrollPages[i];
        if (newPage !== this.currentPage) {
          this.currentPage = newPage;
          this.progressSaveSubject$.next();
          this.updateSessionProgress();
          this.updateFooterPage();
        }
        break;
      }
    }
  }

  getPageImageUrl(pageIndex: number): string {
    return this.cbxReaderService.getPageImageUrl(this.bookId, this.pages[pageIndex], this.altBookType);
  }

  private updateViewerSetting(): void {
    const bookSetting: BookSetting = {
      cbxSettings: {
        pageSpread: this.pageSpread,
        pageViewMode: this.pageViewMode,
        fitMode: this.fitMode,
        scrollMode: this.scrollMode,
        backgroundColor: this.backgroundColor,
      }
    };
    this.bookService.updateViewerSetting(bookSetting, this.bookId).subscribe();
  }

  updateProgress(): void {
    const percentage = this.pages.length > 0
      ? Math.round(((this.currentPage + 1) / this.pages.length) * 1000) / 10
      : 0;

    this.bookService.saveCbxProgress(this.bookId, this.currentPage + 1, percentage, this.bookFileId).subscribe();
  }

  private updateSessionProgress(): void {
    const percentage = this.pages.length > 0
      ? Math.round(((this.currentPage + 1) / this.pages.length) * 1000) / 10
      : 0;
    this.readingSessionService.updateProgress(
      (this.currentPage + 1).toString(),
      percentage
    );
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.pages.length) return;

    const targetIndex = page - 1;
    if (targetIndex === this.currentPage) return;

    this.currentPage = targetIndex;
    this.resetManualPagePan();
    this.activePanelIndex = this.panelModeEnabled ? -1 : 0;

    if (this.scrollMode === CbxScrollMode.INFINITE || this.scrollMode === CbxScrollMode.LONG_STRIP) {
      this.ensurePageLoaded(targetIndex);
      this.scrollToPage(targetIndex);
      this.updateProgress();
      this.updateSessionProgress();
      this.updateFooterPage();
    } else {
      this.alignCurrentPageToParity();
      this.transitionToNewPage();
      this.updateProgress();
      this.updateSessionProgress();
      this.updateFooterPage();
    }
  }

  firstPage(): void {
    this.goToPage(1);
  }

  lastPage(): void {
    this.goToPage(this.pages.length);
  }

  private scrollToPage(pageIndex: number): void {
    this.ensurePageLoaded(pageIndex);

    setTimeout(() => {
      const container = document.querySelector('.image-container.infinite-scroll, .image-container.long-strip') as HTMLElement;
      if (!container) return;

      const images = container.querySelectorAll('.page-image');
      const indexInScroll = this.infiniteScrollPages.indexOf(pageIndex);

      if (indexInScroll >= 0 && indexInScroll < images.length) {
        const targetImage = images[indexInScroll] as HTMLElement;
        targetImage.scrollIntoView({behavior: 'smooth', block: 'start'});
      }
    }, 100);
  }

  private ensurePageLoaded(pageIndex: number): void {
    if (this.infiniteScrollPages.includes(pageIndex)) return;

    this.infiniteScrollPages = [];
    const startIndex = Math.max(0, pageIndex - 1);
    const endIndex = Math.min(pageIndex + this.preloadCount, this.pages.length);

    for (let i = startIndex; i < endIndex; i++) {
      this.infiniteScrollPages.push(i);
    }
  }

  onImageClick(): void {
    if (this.suppressImageClick) {
      this.suppressImageClick = false;
      return;
    }

    if (this.panelDragMoved) {
      this.panelDragMoved = false;
      return;
    }

    if (this.isMobileViewport) {
      this.revealTouchChrome();
      return;
    }

    // Keep pin state explicit via toolbar button/shortcut only.
    if (this.isHeaderFooterPinned) {
      return;
    }
  }

  onPanelPointerDown(event: MouseEvent): void {
    if (!this.isPanelBoxingActive) {
      return;
    }

    this.isPanelDragging = true;
    this.panelDragMoved = false;
    this.panelDragStartX = event.clientX - this.panelPanX;
    this.panelDragStartY = event.clientY - this.panelPanY;
    event.preventDefault();
  }

  toggleHeaderFooterPin(): void {
    this.isHeaderFooterPinned = !this.isHeaderFooterPinned;
    this.visibilityManager.setPinned(this.isHeaderFooterPinned);
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    // Ignore if typing in input/textarea
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }

    const isRtl = this.readingDirection === CbxReadingDirection.RTL;

    switch (event.key) {
      case 'ArrowRight':
        if (isRtl) { this.previousPage(); } else { this.nextPage(); }
        event.preventDefault();
        break;
      case 'ArrowLeft':
        if (isRtl) { this.nextPage(); } else { this.previousPage(); }
        event.preventDefault();
        break;
      case ' ':
        event.preventDefault();
        if (event.shiftKey) { this.previousPage(); } else { this.nextPage(); }
        break;
      case 'Home':
        event.preventDefault();
        this.firstPage();
        break;
      case 'End':
        event.preventDefault();
        this.lastPage();
        break;
      case 'PageUp':
        event.preventDefault();
        this.previousPage();
        break;
      case 'PageDown':
        event.preventDefault();
        this.nextPage();
        break;
      case 'f':
      case 'F':
        event.preventDefault();
        this.toggleFullscreen();
        break;
      case 'd':
      case 'D':
        event.preventDefault();
        this.toggleReadingDirection();
        break;
      case 'p':
      case 'P':
        event.preventDefault();
        this.togglePanelMode();
        break;
      case 'l':
      case 'L':
        event.preventDefault();
        this.toggleSlideshow();
        break;
      case 'm':
      case 'M':
        event.preventDefault();
        this.isMagnifierActive = !this.isMagnifierActive;
        if (!this.isMagnifierActive) {
          this.hideMagnifier();
        }
        this.headerService.updateState({isMagnifierActive: this.isMagnifierActive});
        break;
      case 'a':
      case 'A':
        event.preventDefault();
        this.onAiPanelDetectionRequested();
        break;
      case 'i':
      case 'I':
        event.preventDefault();
        this.toggleHeaderFooterPin();
        break;
      case '+':
      case '=':
        if (this.isMagnifierActive) {
          event.preventDefault();
          this.cycleMagnifierZoom(1);
        }
        break;
      case '-':
        if (this.isMagnifierActive) {
          event.preventDefault();
          this.cycleMagnifierZoom(-1);
        }
        break;
      case ']':
        if (this.isMagnifierActive) {
          event.preventDefault();
          this.cycleMagnifierLensSize(1);
        }
        break;
      case '[':
        if (this.isMagnifierActive) {
          event.preventDefault();
          this.cycleMagnifierLensSize(-1);
        }
        break;
      case '?':
        event.preventDefault();
        this.showShortcutsHelp = true;
        break;
      case 'Escape':
        if (this.isMagnifierActive) {
          this.isMagnifierActive = false;
          this.hideMagnifier();
          this.headerService.updateState({isMagnifierActive: false});
        } else if (this.isPanelModeActive) {
          this.panelModeEnabled = false;
          this.activePanelIndex = 0;
          this.headerService.updateState({isPanelModeEnabled: false});
        } else if (this.showShortcutsHelp) {
          this.showShortcutsHelp = false;
        } else if (this.showNoteDialog) {
          this.showNoteDialog = false;
        } else if (this.showQuickSettings) {
          this.quickSettingsService.close();
        } else if (this.isFullscreen) {
          this.exitFullscreen();
        }
        break;
    }
  }

  onAiPanelDetectionRequested(): void {
    if (!this.aiPanelDetectionEnabled || this.isAiPanelDetectionWorking || !this.bookId) {
      return;
    }

    this.isAiPanelDetectionWorking = true;
    this.aiScanStatusText = this.t.translate('readerCbx.reader.aiScanStatusChecking');

    this.appSettingsService.getAiServiceStatus().pipe(
      first(),
      switchMap(status => {
        if (!status.enabled) {
          throw new Error('AI panel detection is disabled in settings.');
        }

        if (!status.serviceReachable) {
          throw new Error(status.error || 'AI service is unavailable.');
        }

        this.aiScanStatusText = this.t.translate('readerCbx.reader.aiScanStatusRunning');
        return this.comicPanelFlowService.scanPanelFlow(this.bookId, this.altBookType).pipe(first());
      })
    ).subscribe({
      next: flow => {
        const hasParsedPanels = this.applyPanelFlow(flow?.data);
        this.isAiPanelDetectionWorking = false;
        this.aiScanStatusText = '';
        this.aiPanelDetectionReady = hasParsedPanels;
        this.hasSavedAiPanelFlow = hasParsedPanels;
      },
      error: err => {
        this.isAiPanelDetectionWorking = false;
        this.aiScanStatusText = '';
        this.messageService.clear('ai-scan');
        this.aiPanelDetectionReady = false;
        this.messageService.add({
          severity: 'warn',
          summary: 'AI Panel Detection',
          detail: this.extractAiErrorMessage(err)
        });
      }
    });
  }

  private handleAiScanProgress(progress: AiPanelScanProgressPayload | null): void {
    if (!progress || progress.mode !== 'BOOK' || progress.bookId !== this.bookId) {
      return;
    }

    this.aiPanelScanProgressService.updateReaderToast(progress);

    if (progress.event === 'FAILED') {
      this.isAiPanelDetectionWorking = false;
      this.aiScanStatusText = progress.error || progress.message || this.t.translate('readerCbx.reader.aiScanFailed');
      return;
    }

    if (progress.event === 'COMPLETED') {
      this.isAiPanelDetectionWorking = false;
      this.aiScanStatusText = '';
      return;
    }

    this.isAiPanelDetectionWorking = true;
    this.aiScanStatusText = this.aiPanelScanProgressService.buildStatusText(progress);
  }

  private extractAiErrorMessage(err: unknown): string {
    const fallback = 'Unable to run AI panel detection.';
    const e = err as { message?: string; error?: { message?: string; error?: string; detail?: string } } | undefined;
    return e?.error?.message || e?.error?.detail || e?.error?.error || e?.message || fallback;
  }

  private loadExistingAiPanelFlow(): void {
    if (!this.bookId) {
      return;
    }

    this.comicPanelFlowService.getPanelFlow(this.bookId).pipe(first()).subscribe({
      next: flow => {
        const hasParsedPanels = this.applyPanelFlow(flow?.data);
        this.hasSavedAiPanelFlow = hasParsedPanels;
        this.aiPanelDetectionReady = hasParsedPanels;
      },
      error: () => {
        this.detectedPanelsByPage.clear();
        this.hasSavedAiPanelFlow = false;
        this.aiPanelDetectionReady = false;
      }
    });
  }

  private applyPanelFlow(flowData: unknown): boolean {
    const parsed = this.parsePanelFlow(flowData);
    this.detectedPanelsByPage = parsed;

    if (this.activePanelIndex >= this.panelCount) {
      this.activePanelIndex = this.panelModeEnabled ? -1 : 0;
    }

    return Array.from(parsed.values()).some(panels => panels.length > 0);
  }

  private getDetectedPanelStats(): { totalPanels: number; pagesWithPanels: number } {
    let totalPanels = 0;
    let pagesWithPanels = 0;

    for (const panels of this.detectedPanelsByPage.values()) {
      if (!panels || panels.length === 0) {
        continue;
      }

      pagesWithPanels++;
      totalPanels += panels.length;
    }

    return { totalPanels, pagesWithPanels };
  }

  private parsePanelFlow(flowData: unknown): Map<number, CbxPanelRegion[]> {
    if (!flowData) {
      return new Map<number, CbxPanelRegion[]>();
    }

    let parsedFlow: unknown;
    if (typeof flowData === 'string') {
      try {
        parsedFlow = JSON.parse(flowData);
      } catch {
        return new Map<number, CbxPanelRegion[]>();
      }
    } else {
      parsedFlow = flowData;
    }

    const pages = this.extractPagePanelData(parsedFlow);
    const panelMap = new Map<number, CbxPanelRegion[]>();

    for (const page of pages) {
      const pageIndex = page.pageNumber - 1;
      if (pageIndex < 0 || pageIndex >= this.pages.length) {
        continue;
      }

      if (page.panels.length > 0) {
        panelMap.set(pageIndex, page.panels);
      }
    }

    return panelMap;
  }

  private extractPagePanelData(rawFlow: unknown): CbxPagePanelData[] {
    if (!rawFlow || typeof rawFlow !== 'object') {
      return [];
    }

    const raw = rawFlow as Record<string, unknown>;
    const rawPagesValue = raw['pages'];
    const rawPages = Array.isArray(rawPagesValue) ? rawPagesValue : [];

    return rawPages
      .map((rawPage, index) => {
        const pageObj = (rawPage && typeof rawPage === 'object') ? rawPage as Record<string, unknown> : {};
        const pageNumber = this.toSafeInteger(pageObj['pageNumber'] ?? pageObj['page'] ?? (index + 1), index + 1);
        const rawPanelsValue = pageObj['panels'];
        const rawPanels = Array.isArray(rawPanelsValue) ? rawPanelsValue : [];
        const panels = rawPanels
          .map(panel => this.normalizePanel(panel))
          .filter((panel): panel is CbxPanelRegion => !!panel);

        return {pageNumber, panels};
      })
      .filter(page => page.pageNumber > 0);
  }

  private normalizePanel(rawPanel: unknown): CbxPanelRegion | null {
    if (!rawPanel || typeof rawPanel !== 'object') {
      return null;
    }

    const panel = rawPanel as Record<string, unknown>;
    const x = this.normalizeCoordinate(panel['x'] ?? panel['left'] ?? panel['x1']);
    const y = this.normalizeCoordinate(panel['y'] ?? panel['top'] ?? panel['y1']);

    const rightValue = panel['x2'] ?? panel['right'];
    const bottomValue = panel['y2'] ?? panel['bottom'];
    const widthValue = panel['width'] ?? panel['w'];
    const heightValue = panel['height'] ?? panel['h'];

    const right = this.normalizeCoordinate(rightValue);
    const bottom = this.normalizeCoordinate(bottomValue);
    let width = widthValue !== undefined ? this.normalizeCoordinate(widthValue) : right - x;
    let height = heightValue !== undefined ? this.normalizeCoordinate(heightValue) : bottom - y;

    if (width <= 0 || height <= 0) {
      return null;
    }

    const padFactor = 0.14;
    const padX = width * padFactor;
    const padY = height * padFactor;
    const expandedX = x - padX;
    const expandedY = y - padY;
    width += padX * 2;
    height += padY * 2;

    // Allow slight overflow so edge panels can still be centered properly.
    const clampedX = this.clamp(expandedX, -0.25, 1.25);
    const clampedY = this.clamp(expandedY, -0.25, 1.25);
    const maxWidth = this.clamp(width, 0.02, 1.5);
    const maxHeight = this.clamp(height, 0.02, 1.5);

    return {
      x: clampedX,
      y: clampedY,
      width: maxWidth,
      height: maxHeight,
      confidence: this.toNumber(panel['confidence'])
    };
  }

  private normalizeCoordinate(value: unknown): number {
    const numeric = this.toNumber(value);
    if (numeric <= 1) {
      return numeric;
    }

    if (numeric <= 100) {
      return numeric / 100;
    }

    return 0;
  }

  private toSafeInteger(value: unknown, fallback: number): number {
    const numeric = Math.floor(this.toNumber(value));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
  }

  private toNumber(value: unknown): number {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
  }

  private toNormalizedPosition(value: unknown, fallback: number): number {
    if (typeof value !== 'number' && typeof value !== 'string') {
      return fallback;
    }

    const numeric = this.toNumber(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }

    return numeric;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    this.isFullscreen = !!document.fullscreenElement;
    this.headerService.updateState({isFullscreen: this.isFullscreen, isSlideshowActive: this.isSlideshowActive});
  }

  @HostListener('touchstart', ['$event'])
  onTouchStart(event: TouchEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest('.mobile-joystick')) {
      return;
    }

    if (!target?.closest('.image-container')) {
      return;
    }

    this.isReaderTouchActive = true;
    this.touchStartTime = Date.now();
    this.touchMoved = false;
    this.touchIsMultiGesture = event.touches.length > 1;

    if (event.touches.length > 0) {
      this.touchStartX = event.touches[0].screenX;
      this.touchStartY = event.touches[0].screenY;
      this.touchEndX = this.touchStartX;
      this.touchEndY = this.touchStartY;
    }

    if (event.touches.length === 2) {
      this.beginPinchGesture(event);
    }
  }

  @HostListener('document:touchmove', ['$event'])
  onTouchMove(event: TouchEvent): void {
    if (!this.isReaderTouchActive) {
      return;
    }

    if (event.touches.length > 0) {
      this.touchEndX = event.touches[0].screenX;
      this.touchEndY = event.touches[0].screenY;
      if (Math.abs(this.touchEndX - this.touchStartX) > 8 || Math.abs(this.touchEndY - this.touchStartY) > 8) {
        this.touchMoved = true;
      }
    }

    if (event.touches.length !== 2) {
      this.pinchGestureMode = null;
      this.pinchStartDistance = 0;
      return;
    }

    if (!this.pinchGestureMode) {
      this.beginPinchGesture(event);
    }

    if (!this.pinchGestureMode) {
      return;
    }

    if (event.touches.length === 2) {
      const [firstTouch, secondTouch] = Array.from(event.touches);
      const distance = this.getTouchDistance(firstTouch, secondTouch);
      const centerX = (firstTouch.clientX + secondTouch.clientX) / 2;
      const centerY = (firstTouch.clientY + secondTouch.clientY) / 2;

      if (this.pinchStartDistance > 0) {
        if (this.pinchGestureMode === 'panel') {
          this.panelManualZoom = this.clamp(this.pinchStartZoom * (distance / this.pinchStartDistance), 0.6, 3.5);
          this.panelPanX = this.pinchStartPanX + (centerX - this.pinchStartCenterX);
          this.panelPanY = this.pinchStartPanY + (centerY - this.pinchStartCenterY);
          this.applyPanelPanBounds();
        } else {
          this.manualPageZoom = this.clamp(
            this.pinchStartZoom * (distance / this.pinchStartDistance),
            CbxReaderComponent.MANUAL_PAGE_MIN_ZOOM,
            CbxReaderComponent.MANUAL_PAGE_MAX_ZOOM
          );
          this.manualPagePanX = this.pinchStartPanX + (centerX - this.pinchStartCenterX);
          this.manualPagePanY = this.pinchStartPanY + (centerY - this.pinchStartCenterY);
          this.applyManualPagePanBounds();
        }

        this.touchIsMultiGesture = true;
        this.touchMoved = true;
        event.preventDefault();
      }
    }
  }

  @HostListener('document:touchend', ['$event'])
  onTouchEnd(event: TouchEvent) {
    if (!this.isReaderTouchActive) {
      return;
    }

    this.isReaderTouchActive = false;
    this.pinchGestureMode = null;
    this.pinchStartDistance = 0;

    if (event.changedTouches.length > 0) {
      this.touchEndX = event.changedTouches[0].screenX;
      this.touchEndY = event.changedTouches[0].screenY;
    }

    if (this.touchIsMultiGesture || this.isPanelDragging) {
      this.touchIsMultiGesture = false;
      this.isPanelDragging = false;
      return;
    }

    if (this.isPanelModeActive && this.isMobileViewport && this.handleMobilePanelTap()) {
      this.suppressImageClick = true;
      return;
    }

    this.handleSwipeGesture();
  }

  @HostListener('window:resize')
  onResize() {
    this.visibilityManager.updateWindowHeight(window.innerHeight);
    this.enforcePortraitSinglePageView();
    this.applyManualPagePanBounds();
    this.applyPanelPanBounds();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.isPanelDragging && this.isPanelBoxingActive) {
      this.panelPanX = event.clientX - this.panelDragStartX;
      this.panelPanY = event.clientY - this.panelDragStartY;
      this.applyPanelPanBounds();
      if (Math.abs(this.panelPanX) > 2 || Math.abs(this.panelPanY) > 2) {
        this.panelDragMoved = true;
      }
    }

    this.lastMouseEvent = event;
    this.visibilityManager.handleMouseMove(event.clientY);
    if (this.isMagnifierActive) {
      this.updateMagnifier(event);
    }
  }

  @HostListener('document:mouseleave', ['$event'])
  onMouseLeave(_event: MouseEvent): void {
    this.visibilityManager.handleMouseLeave();
    if (this.isMagnifierActive) {
      this.hideMagnifier();
    }
  }

  @HostListener('document:mouseup')
  onGlobalMouseUp(): void {
    this.isPanelDragging = false;
  }

  @HostListener('document:wheel', ['$event'])
  onGlobalWheel(event: WheelEvent): void {
    if (!this.isPanelBoxingActive) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (!target || !target.closest('.image-container')) {
      return;
    }

    const direction = event.deltaY < 0 ? 1 : -1;
    const step = 0.1;
    this.panelManualZoom = this.clamp(this.panelManualZoom + (direction * step), 0.6, 3.5);
    this.applyPanelPanBounds();
    event.preventDefault();
  }

  private handleSwipeGesture() {
    if (this.scrollMode === CbxScrollMode.INFINITE || this.scrollMode === CbxScrollMode.LONG_STRIP) return;

    if (this.isPanelModeActive) {
      return;
    }

    const delta = this.touchEndX - this.touchStartX;
    if (Math.abs(delta) >= 50) {
      // In RTL mode, swipe directions are reversed
      const isRtl = this.readingDirection === CbxReadingDirection.RTL;
      const shouldGoNext = isRtl ? delta > 0 : delta < 0;
      if (shouldGoNext) { this.nextPage(); } else { this.previousPage(); }
    }
  }

  get currentPanels(): CbxPanelRegion[] {
    const panels = this.detectedPanelsByPage.get(this.currentPage) ?? [];
    return [...panels].sort((a, b) => {
      const rowGap = a.y - b.y;
      if (Math.abs(rowGap) > 0.08) {
        return rowGap;
      }

      return this.readingDirection === CbxReadingDirection.RTL
        ? b.x - a.x
        : a.x - b.x;
    });
  }

  get panelCount(): number {
    return this.currentPanels.length;
  }

  get isPanelModeAvailable(): boolean {
    return this.scrollMode === CbxScrollMode.PAGINATED && !this.isTwoPageView && this.currentImageUrls.length === 1;
  }

  get isPanelModeActive(): boolean {
    return this.panelModeEnabled && this.isPanelModeAvailable;
  }

  get isMobileViewport(): boolean {
    return window.innerWidth < 768;
  }

  get showMobileJoystick(): boolean {
    return this.isMobileViewport && this.joystickEnabled;
  }

  get isManualPanVisualActive(): boolean {
    return this.scrollMode === CbxScrollMode.PAGINATED
      && !this.isPanelBoxingActive
      && (Math.abs(this.manualPagePanX) > 0.5 || Math.abs(this.manualPagePanY) > 0.5 || this.manualPageZoom > 1.001 || this.joystickActive);
  }

  get joystickWrapperStyles(): Record<string, string> {
    return {
      left: `${this.joystickAnchorX * 100}%`,
      top: `${this.joystickAnchorY * 100}%`,
    };
  }

  get joystickThumbStyles(): Record<string, string> {
    return {
      transform: `translate(${this.joystickKnobX}px, ${this.joystickKnobY}px)`
    };
  }

  get isPanelBoxingActive(): boolean {
    return this.isPanelModeActive && this.activePanelIndex >= 0 && this.activePanelIndex < this.panelCount;
  }

  get activePanel(): CbxPanelRegion | null {
    if (!this.isPanelBoxingActive) {
      return null;
    }

    return this.currentPanels[this.activePanelIndex] ?? null;
  }

  get panelTransformStyles(): Record<string, string> {
    const panel = this.activePanel;
    if (!panel) {
      return {
        '--manual-pan-x': `${this.manualPagePanX}px`,
        '--manual-pan-y': `${this.manualPagePanY}px`,
        '--manual-page-zoom': `${this.manualPageZoom}`
      };
    }

    const originX = (panel.x + panel.width / 2) * 100;
    const originY = (panel.y + panel.height / 2) * 100;
    const scale = this.getPanelScale(panel);
    const travel = this.panelTravelFactor;
    const translateX = (50 - originX) * scale * travel;
    const translateY = (50 - originY) * scale * travel;

    return {
      '--panel-translate-x': `${translateX}`,
      '--panel-translate-y': `${translateY}`,
      '--panel-pan-x': `${this.panelPanX}px`,
      '--panel-pan-y': `${this.panelPanY}px`,
      '--panel-scale': `${scale}`,
      '--manual-pan-x': `${this.manualPagePanX}px`,
      '--manual-pan-y': `${this.manualPagePanY}px`,
      '--manual-page-zoom': `${this.manualPageZoom}`
    };
  }

  private getPanelScale(panel: CbxPanelRegion): number {
    const baseScale = this.clamp(Math.min(1 / panel.width, 1 / panel.height) * 0.92, 1, 6);
    return this.clamp(baseScale * this.panelManualZoom, 1, 10);
  }

  get activePanelCenterX(): number {
    const panel = this.activePanel;
    return panel ? (panel.x + panel.width / 2) * 100 : 50;
  }

  get activePanelCenterY(): number {
    const panel = this.activePanel;
    return panel ? (panel.y + panel.height / 2) * 100 : 50;
  }

  togglePanelMode(): void {
    this.panelModeEnabled = !this.panelModeEnabled;
    this.activePanelIndex = this.panelModeEnabled ? -1 : 0;
    this.resetManualPageViewport();
    this.resetPanelPan();
    this.ensurePanelModeCompatibility();
    this.headerService.updateState({isPanelModeEnabled: this.isPanelModeActive});

    if (this.panelModeEnabled && this.isMobileViewport) {
      this.revealTouchChrome();
    }
  }

  private ensurePanelModeCompatibility(): void {
    if (!this.isPanelModeAvailable) {
      this.activePanelIndex = this.panelModeEnabled ? -1 : 0;
    }

    if (this.isPanelModeAvailable && this.panelModeEnabled && this.activePanelIndex >= this.panelCount) {
      this.activePanelIndex = -1;
    }

    this.headerService.updateState({isPanelModeEnabled: this.isPanelModeActive});
  }

  private tryNavigatePanel(direction: 1 | -1): boolean {
    if (!this.isPanelModeActive) {
      return false;
    }

    const maxPanelIndex = this.panelCount - 1;

    if (direction > 0) {
      if (this.activePanelIndex < 0) {
        this.activePanelIndex = 0;
        this.resetPanelPan();
        this.flashPanelNavigationUi();
        return true;
      }

      if (this.activePanelIndex < maxPanelIndex) {
        this.activePanelIndex++;
        this.resetPanelPan();
        this.flashPanelNavigationUi();
        return true;
      }
      return false;
    }

    if (this.activePanelIndex < 0) {
      return false;
    }

    if (this.activePanelIndex > 0) {
      this.activePanelIndex--;
      this.resetPanelPan();
      this.flashPanelNavigationUi();
      return true;
    }
    return false;
  }

  get detectedPanelTotal(): number {
    let total = 0;
    for (const panels of this.detectedPanelsByPage.values()) {
      total += panels.length;
    }
    return total;
  }

  get detectedPanelPageCount(): number {
    let count = 0;
    for (const panels of this.detectedPanelsByPage.values()) {
      if (panels.length > 0) {
        count++;
      }
    }
    return count;
  }

  onAiRescanRequested(): void {
    this.onAiPanelDetectionRequested();
  }

  onAiDeleteScanRequested(): void {
    if (!this.bookId || this.isAiPanelDetectionWorking) {
      return;
    }

    this.comicPanelFlowService.deletePanelFlow(this.bookId).pipe(first()).subscribe({
      next: () => {
        this.messageService.clear('ai-scan');
        this.detectedPanelsByPage.clear();
        this.hasSavedAiPanelFlow = false;
        this.aiPanelDetectionReady = false;
        this.panelModeEnabled = false;
        this.activePanelIndex = 0;
        this.headerService.updateState({isPanelModeEnabled: false});
        this.messageService.add({
          severity: 'success',
          summary: 'AI Panel Detection',
          detail: 'Deleted saved scan data for this comic.'
        });
      },
      error: err => {
        this.messageService.add({
          severity: 'warn',
          summary: 'AI Panel Detection',
          detail: this.extractAiErrorMessage(err)
        });
      }
    });
  }

  onOpenAiSettingsRequested(): void {
    this.router.navigate(['/settings'], {queryParams: {tab: 'ai-settings', returnTo: this.router.url}});
  }

  onPanelTravelFactorChange(value: number): void {
    this.panelTravelFactor = this.clamp(value, 0.4, 2.5);
  }

  onPanelZoomOutRequested(): void {
    if (!this.preparePanelGestureInteraction()) {
      return;
    }

    this.panelManualZoom = this.clamp(this.panelManualZoom - 0.2, 0.6, 3.5);
    this.revealTouchChrome();
  }

  onPanelZoomInRequested(): void {
    if (!this.preparePanelGestureInteraction()) {
      return;
    }

    this.panelManualZoom = this.clamp(this.panelManualZoom + 0.2, 0.6, 3.5);
    this.applyPanelPanBounds();
    this.revealTouchChrome();
  }

  toggleJoystickEnabled(): void {
    this.onJoystickEnabledChange(!this.joystickEnabled);
  }

  toggleJoystickPositionLock(): void {
    this.onJoystickPositionLockedChange(!this.joystickPositionLocked);
  }

  onJoystickEnabledChange(enabled: boolean): void {
    this.joystickEnabled = enabled;
    this.quickSettingsService.setJoystickEnabled(enabled);

    if (!enabled) {
      this.releaseJoystickInteraction();
      this.resetManualPagePan();
    }

    this.saveJoystickDevicePreferences();
  }

  onJoystickSensitivityChange(sensitivity: CbxJoystickSensitivity): void {
    this.joystickSensitivity = sensitivity;
    this.quickSettingsService.setJoystickSensitivity(sensitivity);
    this.saveJoystickDevicePreferences();
  }

  onJoystickPositionLockedChange(locked: boolean): void {
    this.joystickPositionLocked = locked;
    this.quickSettingsService.setJoystickPositionLocked(locked);
    this.saveJoystickDevicePreferences();
  }

  onJoystickRecenterOnTouchChange(enabled: boolean): void {
    this.joystickRecenterOnTouch = enabled;
    this.quickSettingsService.setJoystickRecenterOnTouch(enabled);
    this.saveJoystickDevicePreferences();
  }

  onJoystickIndicatorVisibleChange(visible: boolean): void {
    this.joystickIndicatorVisible = visible;
    this.quickSettingsService.setJoystickIndicatorVisible(visible);
    this.saveJoystickDevicePreferences();
  }

  onJoystickIndicatorOpacityChange(opacity: number): void {
    const safeOpacity = this.clamp(this.toNormalizedPosition(opacity, this.joystickIndicatorOpacity), 0.1, 1);
    this.joystickIndicatorOpacity = safeOpacity;
    this.quickSettingsService.setJoystickIndicatorOpacity(safeOpacity);
    this.saveJoystickDevicePreferences();
  }

  onJoystickPointerDown(event: PointerEvent): void {
    if (!this.showMobileJoystick || this.joystickPointerId !== null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget as HTMLElement | null;
    target?.setPointerCapture(event.pointerId);
    this.joystickPointerId = event.pointerId;

    if (!this.joystickPositionLocked) {
      this.updateJoystickAnchorFromPointer(event);
      return;
    }

    if (this.joystickRecenterOnTouch) {
      this.updateJoystickAnchorFromPointer(event, true);
    }

    this.joystickActive = true;
    this.joystickInteractionStartMs = Date.now();
    this.updateJoystickKnobFromPointer(event);
    this.startJoystickAnimationLoop();
    this.revealTouchChrome();
  }

  onJoystickPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.joystickPointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!this.joystickPositionLocked) {
      this.updateJoystickAnchorFromPointer(event);
      return;
    }

    if (!this.joystickActive) {
      return;
    }

    this.updateJoystickKnobFromPointer(event);
  }

  onJoystickPointerUp(event: PointerEvent): void {
    if (event.pointerId !== this.joystickPointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget as HTMLElement | null;
    target?.releasePointerCapture(event.pointerId);

    this.releaseJoystickInteraction();
    this.saveJoystickDevicePreferences();
  }

  private startJoystickAnimationLoop(): void {
    if (this.joystickAnimationFrame !== null) {
      return;
    }

    const tick = () => {
      this.joystickAnimationFrame = null;

      if (!this.joystickActive) {
        return;
      }

      this.applyJoystickMotionStep();
      this.joystickAnimationFrame = requestAnimationFrame(tick);
    };

    this.joystickAnimationFrame = requestAnimationFrame(tick);
  }

  private stopJoystickAnimationLoop(): void {
    if (this.joystickAnimationFrame !== null) {
      cancelAnimationFrame(this.joystickAnimationFrame);
      this.joystickAnimationFrame = null;
    }
  }

  private releaseJoystickInteraction(): void {
    this.stopJoystickAnimationLoop();
    this.joystickPointerId = null;
    this.joystickActive = false;
    this.joystickKnobX = 0;
    this.joystickKnobY = 0;
    this.joystickVelocityX = 0;
    this.joystickVelocityY = 0;
    this.joystickInteractionStartMs = 0;
  }

  private updateJoystickKnobFromPointer(event: PointerEvent): void {
    const container = this.imageContainerRef?.nativeElement;
    if (!container) {
      this.joystickKnobX = 0;
      this.joystickKnobY = 0;
      return;
    }

    const rect = container.getBoundingClientRect();
    const centerX = rect.left + (this.joystickAnchorX * rect.width);
    const centerY = rect.top + (this.joystickAnchorY * rect.height);
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const magnitude = Math.hypot(rawX, rawY);
    const radius = CbxReaderComponent.JOYSTICK_RADIUS_PX;

    if (magnitude === 0) {
      this.joystickKnobX = 0;
      this.joystickKnobY = 0;
      return;
    }

    const limitRatio = Math.min(1, radius / magnitude);
    this.joystickKnobX = rawX * limitRatio;
    this.joystickKnobY = rawY * limitRatio;
  }

  private updateJoystickAnchorFromPointer(event: PointerEvent, constrainToCurrentQuadrant = false): void {
    const container = this.imageContainerRef?.nativeElement;
    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const marginX = CbxReaderComponent.JOYSTICK_MARGIN_PX / rect.width;
    const marginY = CbxReaderComponent.JOYSTICK_MARGIN_PX / rect.height;
    const normalizedX = (event.clientX - rect.left) / rect.width;
    const normalizedY = (event.clientY - rect.top) / rect.height;

    if (!constrainToCurrentQuadrant) {
      this.joystickAnchorX = this.clamp(normalizedX, marginX, 1 - marginX);
      this.joystickAnchorY = this.clamp(normalizedY, marginY, 1 - marginY);
      return;
    }

    const isRightQuadrant = this.joystickAnchorX >= 0.5;
    const isBottomQuadrant = this.joystickAnchorY >= 0.5;
    const minX = isRightQuadrant ? 0.5 : marginX;
    const maxX = isRightQuadrant ? 1 - marginX : 0.5;
    const minY = isBottomQuadrant ? 0.5 : marginY;
    const maxY = isBottomQuadrant ? 1 - marginY : 0.5;

    this.joystickAnchorX = this.clamp(normalizedX, minX, maxX);
    this.joystickAnchorY = this.clamp(normalizedY, minY, maxY);
  }

  private applyJoystickMotionStep(): void {
    const magnitude = Math.hypot(this.joystickKnobX, this.joystickKnobY);
    const elapsed = this.joystickInteractionStartMs > 0
      ? Math.max(0, Date.now() - this.joystickInteractionStartMs)
      : CbxReaderComponent.JOYSTICK_STARTUP_RAMP_MS;
    const startupProgress = this.clamp(elapsed / CbxReaderComponent.JOYSTICK_STARTUP_RAMP_MS, 0, 1);
    const startupCurve = startupProgress * startupProgress;
    const startupSpeedScale = CbxReaderComponent.JOYSTICK_STARTUP_SPEED_FLOOR
      + ((1 - CbxReaderComponent.JOYSTICK_STARTUP_SPEED_FLOOR) * startupCurve);
    const startupDeadzone = CbxReaderComponent.JOYSTICK_DEADZONE_PX
      + ((1 - startupProgress) * CbxReaderComponent.JOYSTICK_STARTUP_DEADZONE_BONUS_PX);

    let targetVelocityX = 0;
    let targetVelocityY = 0;
    let smoothing = CbxReaderComponent.JOYSTICK_RELEASE_SMOOTHING;

    if (magnitude > startupDeadzone) {
      const radius = CbxReaderComponent.JOYSTICK_RADIUS_PX;
      const normalized = this.clamp(magnitude / radius, 0, 1);
      const smoothStep = normalized * normalized * (3 - (2 * normalized));
      const speed = (
        CbxReaderComponent.JOYSTICK_BASE_SPEED
        + (smoothStep * CbxReaderComponent.JOYSTICK_MAX_SPEED_DELTA)
      ) * this.getJoystickSensitivityMultiplier() * startupSpeedScale;

      targetVelocityX = (this.joystickKnobX / magnitude) * speed;
      targetVelocityY = (this.joystickKnobY / magnitude) * speed;
      const startupSmoothing = 0.45 + (startupProgress * 0.55);
      smoothing = CbxReaderComponent.JOYSTICK_INPUT_SMOOTHING * startupSmoothing;
    }

    this.joystickVelocityX += (targetVelocityX - this.joystickVelocityX) * smoothing;
    this.joystickVelocityY += (targetVelocityY - this.joystickVelocityY) * smoothing;

    if (Math.abs(this.joystickVelocityX) < 0.02 && Math.abs(this.joystickVelocityY) < 0.02) {
      this.joystickVelocityX = 0;
      this.joystickVelocityY = 0;
      return;
    }

    this.applyJoystickPanDelta(this.joystickVelocityX, this.joystickVelocityY);
  }

  private getJoystickSensitivityMultiplier(): number {
    switch (this.joystickSensitivity) {
      case 'SLOW':
        return 0.6;
      case 'FAST':
        return 2;
      default:
        return 1;
    }
  }

  private applyJoystickPanDelta(deltaX: number, deltaY: number): void {
    if (this.isPanelBoxingActive) {
      this.panelPanX -= deltaX;
      this.panelPanY -= deltaY;
      this.applyPanelPanBounds();
      return;
    }

    if (this.scrollMode === CbxScrollMode.PAGINATED) {
      this.manualPagePanX -= deltaX;
      this.manualPagePanY -= deltaY;
      this.applyManualPagePanBounds();
      return;
    }

    const container = this.imageContainerRef?.nativeElement;
    if (!container) {
      return;
    }

    container.scrollLeft += deltaX;
    container.scrollTop += deltaY;
  }

  private applyPanelPanBounds(): void {
    if (!this.isPanelBoxingActive) {
      return;
    }

    const bounds = this.getImagePanBounds();
    this.panelPanX = this.clamp(this.panelPanX, -bounds.maxX, bounds.maxX);
    this.panelPanY = this.clamp(this.panelPanY, -bounds.maxY, bounds.maxY);
  }

  private applyManualPagePanBounds(): void {
    if (this.scrollMode !== CbxScrollMode.PAGINATED || this.isPanelBoxingActive) {
      this.manualPagePanX = 0;
      this.manualPagePanY = 0;
      this.manualPageZoom = 1;
      return;
    }

    const bounds = this.getImagePanBounds();
    this.manualPagePanX = this.clamp(this.manualPagePanX, -bounds.maxX, bounds.maxX);
    this.manualPagePanY = this.clamp(this.manualPagePanY, -bounds.maxY, bounds.maxY);
  }

  private getImagePanBounds(): {maxX: number; maxY: number} {
    const container = this.imageContainerRef?.nativeElement;
    if (!container) {
      return {maxX: 0, maxY: 0};
    }

    const image = container.querySelector('.current-page-layer .page-image:not(.previous-image)') as HTMLElement | null;
    if (!image) {
      return {maxX: 0, maxY: 0};
    }

    const containerRect = container.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();

    if (containerRect.width <= 0 || containerRect.height <= 0 || imageRect.width <= 0 || imageRect.height <= 0) {
      return {maxX: 0, maxY: 0};
    }

    const overflowX = Math.max(0, (imageRect.width - containerRect.width) / 2);
    const overflowY = Math.max(0, (imageRect.height - containerRect.height) / 2);
    const overscanX = Math.min(containerRect.width * CbxReaderComponent.JOYSTICK_EDGE_OVERSCAN_RATIO, CbxReaderComponent.JOYSTICK_EDGE_OVERSCAN_MAX_PX);
    const overscanY = Math.min(containerRect.height * CbxReaderComponent.JOYSTICK_EDGE_OVERSCAN_RATIO, CbxReaderComponent.JOYSTICK_EDGE_OVERSCAN_MAX_PX);

    return {
      maxX: overflowX > 0 ? overflowX + overscanX : 0,
      maxY: overflowY > 0 ? overflowY + overscanY : 0
    };
  }

  private resetManualPagePan(): void {
    this.manualPagePanX = 0;
    this.manualPagePanY = 0;
  }

  private resetManualPageViewport(): void {
    this.manualPageZoom = 1;
    this.resetManualPagePan();
  }

  private beginPinchGesture(event: TouchEvent): void {
    if (event.touches.length !== 2) {
      return;
    }

    const [firstTouch, secondTouch] = Array.from(event.touches);
    this.pinchStartDistance = this.getTouchDistance(firstTouch, secondTouch);
    this.pinchStartCenterX = (firstTouch.clientX + secondTouch.clientX) / 2;
    this.pinchStartCenterY = (firstTouch.clientY + secondTouch.clientY) / 2;

    if (this.preparePanelGestureInteraction()) {
      this.pinchGestureMode = 'panel';
      this.pinchStartZoom = this.panelManualZoom;
      this.pinchStartPanX = this.panelPanX;
      this.pinchStartPanY = this.panelPanY;
      return;
    }

    if (this.prepareManualGestureInteraction()) {
      this.pinchGestureMode = 'manual';
      this.pinchStartZoom = this.manualPageZoom;
      this.pinchStartPanX = this.manualPagePanX;
      this.pinchStartPanY = this.manualPagePanY;
      return;
    }

    this.pinchGestureMode = null;
    this.pinchStartDistance = 0;
  }

  private prepareManualGestureInteraction(): boolean {
    return this.scrollMode === CbxScrollMode.PAGINATED
      && !this.isPanelBoxingActive
      && !this.isTwoPageView
      && this.currentImageUrls.length === 1;
  }

  private loadJoystickDevicePreferences(): void {
    const defaults: CbxJoystickDevicePreferences = {
      enabled: false,
      sensitivity: 'NORMAL',
      positionLocked: true,
      recenterOnTouch: true,
      indicatorVisible: true,
      indicatorOpacity: 0.88,
      anchorX: 0.86,
      anchorY: 0.78,
    };

    if (typeof window === 'undefined') {
      this.joystickEnabled = defaults.enabled;
      this.joystickSensitivity = defaults.sensitivity;
      this.joystickPositionLocked = defaults.positionLocked;
      this.joystickAnchorX = defaults.anchorX;
      this.joystickAnchorY = defaults.anchorY;
      return;
    }

    try {
      const raw = window.localStorage.getItem(CbxReaderComponent.JOYSTICK_DEVICE_STORAGE_KEY);
      if (!raw) {
        this.joystickEnabled = defaults.enabled;
        this.joystickSensitivity = defaults.sensitivity;
        this.joystickPositionLocked = defaults.positionLocked;
        this.joystickRecenterOnTouch = defaults.recenterOnTouch;
        this.joystickIndicatorVisible = defaults.indicatorVisible;
        this.joystickIndicatorOpacity = defaults.indicatorOpacity;
        this.joystickAnchorX = defaults.anchorX;
        this.joystickAnchorY = defaults.anchorY;
        return;
      }

      const parsed = JSON.parse(raw) as Partial<CbxJoystickDevicePreferences>;
      this.joystickEnabled = !!parsed.enabled;
      this.joystickSensitivity = parsed.sensitivity === 'SLOW' || parsed.sensitivity === 'FAST' ? parsed.sensitivity : 'NORMAL';
      this.joystickPositionLocked = parsed.positionLocked !== false;
      this.joystickRecenterOnTouch = parsed.recenterOnTouch !== false;
      this.joystickIndicatorVisible = parsed.indicatorVisible !== false;
      this.joystickIndicatorOpacity = this.clamp(this.toNormalizedPosition(parsed.indicatorOpacity, defaults.indicatorOpacity), 0.1, 1);
      this.joystickAnchorX = this.clamp(this.toNormalizedPosition(parsed.anchorX, defaults.anchorX), 0.05, 0.95);
      this.joystickAnchorY = this.clamp(this.toNormalizedPosition(parsed.anchorY, defaults.anchorY), 0.05, 0.95);
    } catch {
      this.joystickEnabled = defaults.enabled;
      this.joystickSensitivity = defaults.sensitivity;
      this.joystickPositionLocked = defaults.positionLocked;
      this.joystickRecenterOnTouch = defaults.recenterOnTouch;
      this.joystickIndicatorVisible = defaults.indicatorVisible;
      this.joystickIndicatorOpacity = defaults.indicatorOpacity;
      this.joystickAnchorX = defaults.anchorX;
      this.joystickAnchorY = defaults.anchorY;
    }
  }

  private saveJoystickDevicePreferences(): void {
    if (typeof window === 'undefined') {
      return;
    }

    const payload: CbxJoystickDevicePreferences = {
      enabled: this.joystickEnabled,
      sensitivity: this.joystickSensitivity,
      positionLocked: this.joystickPositionLocked,
      recenterOnTouch: this.joystickRecenterOnTouch,
      indicatorVisible: this.joystickIndicatorVisible,
      indicatorOpacity: Number(this.joystickIndicatorOpacity.toFixed(2)),
      anchorX: Number(this.joystickAnchorX.toFixed(4)),
      anchorY: Number(this.joystickAnchorY.toFixed(4)),
    };

    window.localStorage.setItem(CbxReaderComponent.JOYSTICK_DEVICE_STORAGE_KEY, JSON.stringify(payload));
  }

  private enforcePortraitSinglePageView() {
    if (this.isPhonePortrait() && this.isTwoPageView) {
      this.pageViewMode = CbxPageViewMode.SINGLE_PAGE;
      this.quickSettingsService.setPageViewMode(this.pageViewMode);
      this.footerService.setTwoPageView(false);
      this.updateViewerSetting();
    }
  }

  private isPhonePortrait(): boolean {
    return window.innerWidth < 768 && window.innerHeight > window.innerWidth;
  }

  get isAtLastPage(): boolean {
    return this.currentPage >= this.pages.length - 1;
  }

  navigateToPreviousBook(): void {
    if (this.previousBookInSeries) {
      this.endReadingSession();
      this.router.navigate(['/cbx-reader/book', this.previousBookInSeries.id], {replaceUrl: true});
    }
  }

  navigateToNextBook(): void {
    if (this.nextBookInSeries) {
      this.endReadingSession();
      this.router.navigate(['/cbx-reader/book', this.nextBookInSeries.id], {replaceUrl: true});
    }
  }

  private loadSeriesNavigationAsync(book: Book): void {
    this.bookService.bookState$.pipe(
      filter((state: BookState) => state.loaded),
      first(),
      timeout(10000)
    ).subscribe({
      next: () => {
        this.loadSeriesNavigation(book);
      },
      error: (err) => {
        console.warn('[SeriesNav] BookService state loading timed out or failed, series navigation will be disabled:', err);
      }
    });
  }

  private loadSeriesNavigation(book: Book): void {
    this.bookService.getBooksInSeries(book.id).subscribe({
      next: (seriesBooks) => {
        const sortedBySeriesNumber = this.sortBooksBySeriesNumber(seriesBooks);
        const currentBookIndex = sortedBySeriesNumber.findIndex(b => b.id === book.id);

        if (currentBookIndex === -1) {
          console.warn('[SeriesNav] Current book not found in series');
          return;
        }

        const hasPreviousBook = currentBookIndex > 0;
        const hasNextBook = currentBookIndex < sortedBySeriesNumber.length - 1;

        this.previousBookInSeries = hasPreviousBook ? sortedBySeriesNumber[currentBookIndex - 1] : null;
        this.nextBookInSeries = hasNextBook ? sortedBySeriesNumber[currentBookIndex + 1] : null;

        this.footerService.setSeriesBooks(this.previousBookInSeries, this.nextBookInSeries);
        this.footerService.setHasSeries(true);
      },
      error: (err) => {
        console.error('[SeriesNav] Failed to load series information:', err);
      }
    });
  }

  private sortBooksBySeriesNumber(books: Book[]): Book[] {
    return books.sort((bookA, bookB) => {
      const seriesNumberA = bookA.metadata?.seriesNumber ?? Number.MAX_SAFE_INTEGER;
      const seriesNumberB = bookB.metadata?.seriesNumber ?? Number.MAX_SAFE_INTEGER;
      return seriesNumberA - seriesNumberB;
    });
  }

  getBookDisplayTitle(book: Book | null): string {
    if (!book) return '';
    const parts: string[] = [];
    if (book.metadata?.seriesNumber) {
      parts.push(`#${book.metadata.seriesNumber}`);
    }
    const title = book.metadata?.title || book.fileName;
    if (title) {
      parts.push(title);
    }
    if (book.metadata?.subtitle) {
      parts.push(book.metadata.subtitle);
    }
    return parts.join(' - ');
  }

  // Fullscreen methods
  toggleFullscreen(): void {
    if (this.isFullscreen) {
      this.exitFullscreen();
    } else {
      this.enterFullscreen();
    }
  }

  private enterFullscreen(): void {
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(() => { /* browser blocked fullscreen — safe to ignore */ });
    }
  }

  private exitFullscreen(): void {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => { /* already not fullscreen — safe to ignore */ });
    }
  }

  // Reading direction methods
  toggleReadingDirection(): void {
    const newDirection = this.readingDirection === CbxReadingDirection.LTR
      ? CbxReadingDirection.RTL
      : CbxReadingDirection.LTR;
    this.onReadingDirectionChange(newDirection);
  }

  onReadingDirectionChange(direction: CbxReadingDirection): void {
    this.readingDirection = direction;
    this.quickSettingsService.setReadingDirection(direction);
  }

  // Slideshow methods
  toggleSlideshow(): void {
    if (this.isSlideshowActive) {
      this.stopSlideshow();
    } else {
      this.startSlideshow();
    }
  }

  startSlideshow(): void {
    if (this.currentPage >= this.pages.length - 1) return;

    this.isSlideshowActive = true;
    this.headerService.updateState({isFullscreen: this.isFullscreen, isSlideshowActive: true});

    this.slideshowTimer = setInterval(() => {
      if (this.currentPage < this.pages.length - 1) {
        this.advancePage(1);
      } else {
        this.stopSlideshow();
      }
    }, this.slideshowInterval);
  }

  stopSlideshow(): void {
    if (this.slideshowTimer) {
      clearInterval(this.slideshowTimer);
      this.slideshowTimer = null;
    }
    this.isSlideshowActive = false;
    this.headerService.updateState({isFullscreen: this.isFullscreen, isSlideshowActive: false});
  }

  private pauseSlideshowOnInteraction(): void {
    if (this.isSlideshowActive) {
      this.stopSlideshow();
    }
  }

  onSlideshowIntervalChange(interval: CbxSlideshowInterval): void {
    this.slideshowInterval = interval;
    this.quickSettingsService.setSlideshowInterval(interval);

    // Restart slideshow with new interval if active
    if (this.isSlideshowActive) {
      this.stopSlideshow();
      this.startSlideshow();
    }
  }

  onMagnifierZoomChange(zoom: CbxMagnifierZoom): void {
    this.magnifierZoom = zoom;
    this.quickSettingsService.setMagnifierZoom(zoom);
    this.refreshMagnifier();
  }

  onMagnifierLensSizeChange(size: CbxMagnifierLensSize): void {
    this.magnifierLensSize = size;
    this.quickSettingsService.setMagnifierLensSize(size);
    this.refreshMagnifier();
  }

  private refreshMagnifier(): void {
    if (this.isMagnifierActive && this.lastMouseEvent) {
      this.updateMagnifier(this.lastMouseEvent);
    }
  }

  private cycleMagnifierZoom(direction: 1 | -1): void {
    const values = Object.values(CbxMagnifierZoom).filter(v => typeof v === 'number') as number[];
    values.sort((a, b) => a - b);
    const currentIndex = values.indexOf(this.magnifierZoom as number);
    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < values.length) {
      this.onMagnifierZoomChange(values[newIndex] as CbxMagnifierZoom);
    }
  }

  private cycleMagnifierLensSize(direction: 1 | -1): void {
    const values = Object.values(CbxMagnifierLensSize).filter(v => typeof v === 'number') as number[];
    values.sort((a, b) => a - b);
    const currentIndex = values.indexOf(this.magnifierLensSize as number);
    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < values.length) {
      this.onMagnifierLensSizeChange(values[newIndex] as CbxMagnifierLensSize);
    }
  }

  // Double-tap zoom
  onImageDoubleClick(): void {
    if (this.originalFitMode === null) {
      // Store current fit mode and switch to actual size
      this.originalFitMode = this.fitMode;
      this.onFitModeChange(CbxFitMode.ACTUAL_SIZE);
    } else {
      // Restore original fit mode
      this.onFitModeChange(this.originalFitMode as CbxFitMode);
      this.originalFitMode = null;
    }
  }

  // Double page detection
  onPageImageLoad(event: Event, pageIndex: number): void {
    const img = event.target as HTMLImageElement;
    if (img.naturalWidth && img.naturalHeight) {
      this.pageDimensionsCache.set(pageIndex, {
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    }
    this.imagesLoaded = true;
  }

  isSpreadPage(pageIndex: number): boolean {
    const dims = this.pageDimensionsCache.get(pageIndex);
    if (!dims) return false;
    return dims.width > dims.height * 1.5;
  }

  shouldShowSinglePage(pageIndex: number): boolean {
    return this.isTwoPageView && this.isSpreadPage(pageIndex);
  }

  private updateMagnifier(event: MouseEvent): void {
    const el = this.magnifierLensRef?.nativeElement;
    if (!el) return;

    const lensSize = this.magnifierLensSize as number;
    const zoom = this.magnifierZoom as number;

    const target = document.elementFromPoint(event.clientX, event.clientY);
    if (!(target instanceof HTMLImageElement) || !target.classList.contains('page-image')) {
      el.style.display = 'none';
      return;
    }

    if (!target.naturalWidth || !target.naturalHeight) {
      el.style.display = 'none';
      return;
    }

    const imgRect = target.getBoundingClientRect();
    const scale = Math.min(imgRect.width / target.naturalWidth, imgRect.height / target.naturalHeight);
    const renderedWidth = target.naturalWidth * scale;
    const renderedHeight = target.naturalHeight * scale;
    const imgOffsetX = (imgRect.width - renderedWidth) / 2;
    const imgOffsetY = (imgRect.height - renderedHeight) / 2;

    const relX = (event.clientX - imgRect.left - imgOffsetX) / renderedWidth;
    const relY = (event.clientY - imgRect.top - imgOffsetY) / renderedHeight;

    if (relX < 0 || relX > 1 || relY < 0 || relY > 1) {
      el.style.display = 'none';
      return;
    }

    const bgWidth = renderedWidth * zoom;
    const bgHeight = renderedHeight * zoom;
    const bgPosX = -(relX * bgWidth - lensSize / 2);
    const bgPosY = -(relY * bgHeight - lensSize / 2);

    el.style.display = 'block';
    el.style.width = `${lensSize}px`;
    el.style.height = `${lensSize}px`;
    el.style.transform = `translate(${event.clientX - lensSize / 2}px, ${event.clientY - lensSize / 2}px)`;
    el.style.backgroundImage = `url('${target.src}')`;
    el.style.backgroundSize = `${bgWidth}px ${bgHeight}px`;
    el.style.backgroundPosition = `${bgPosX}px ${bgPosY}px`;
  }

  private hideMagnifier(): void {
    const el = this.magnifierLensRef?.nativeElement;
    if (el) {
      el.style.display = 'none';
    }
  }

  // Shortcuts help dialog
  onShortcutsHelpClose(): void {
    this.showShortcutsHelp = false;
  }

  // Long strip mode check
  get isLongStripMode(): boolean {
    return this.scrollMode === CbxScrollMode.LONG_STRIP;
  }

  ngOnDestroy(): void {
    this.releaseAllMobileBackRegistrations(false);
    this.releaseJoystickInteraction();
    this.clearReaderTimeout(this.panelTouchHintTimeout);
    this.clearReaderTimeout(this.mobilePanelOverviewTimeout);
    this.clearReaderTimeout(this.touchChromeTimeout);
    this.stopSlideshow();
    this.endReadingSession();
    this.destroy$.next();
    this.destroy$.complete();
  }

  private syncMobileBackRegistrations(): void {
    this.syncMobileBackSurface('sidebar', this.sidebarService.isOpen, () => this.sidebarService.close());
    this.syncMobileBackSurface('quickSettings', this.showQuickSettings, () => this.quickSettingsService.close());
    this.syncMobileBackSurface('noteDialog', this.showNoteDialog, () => this.onNoteCancel());
    this.syncMobileBackSurface('shortcutsHelp', this.showShortcutsHelp, () => this.onShortcutsHelpClose());
  }

  private syncMobileBackSurface(surface: CbxMobileSurface, isOpen: boolean, close: () => void): void {
    const existingHandle = this.mobileBackHandles[surface];

    if (isOpen) {
      if (!existingHandle) {
        this.mobileBackHandles[surface] = this.mobileBackNavigation.register(close);
      }
      return;
    }

    existingHandle?.release();
    delete this.mobileBackHandles[surface];
  }

  private releaseAllMobileBackRegistrations(removeHistoryEntry: boolean): void {
    const surfaces = Object.keys(this.mobileBackHandles) as CbxMobileSurface[];
    for (const surface of surfaces) {
      this.mobileBackHandles[surface]?.release(removeHistoryEntry);
      delete this.mobileBackHandles[surface];
    }
  }

  private handleMobilePanelTap(): boolean {
    const deltaX = this.touchEndX - this.touchStartX;
    const deltaY = this.touchEndY - this.touchStartY;
    const isTap = !this.touchMoved && Math.abs(deltaX) < 18 && Math.abs(deltaY) < 18 && (Date.now() - this.touchStartTime) < 350;

    if (!isTap) {
      return false;
    }

    const viewportWidth = window.innerWidth;
    const leftEdgeLimit = viewportWidth * 0.24;
    const rightEdgeLimit = viewportWidth * 0.76;

    if (this.touchEndX <= leftEdgeLimit) {
      if (!(this.readingDirection === CbxReadingDirection.RTL ? this.tryNavigatePanel(1) : this.tryNavigatePanel(-1))) {
        if (this.readingDirection === CbxReadingDirection.RTL) { this.nextPage(); } else { this.previousPage(); }
      }
      this.revealTouchChrome();
      return true;
    }

    if (this.touchEndX >= rightEdgeLimit) {
      if (!(this.readingDirection === CbxReadingDirection.RTL ? this.tryNavigatePanel(-1) : this.tryNavigatePanel(1))) {
        if (this.readingDirection === CbxReadingDirection.RTL) { this.previousPage(); } else { this.nextPage(); }
      }
      this.revealTouchChrome();
      return true;
    }

    this.revealTouchChrome();
    return true;
  }

  private flashPanelNavigationUi(): void {
    if (!this.isMobileViewport) {
      return;
    }

    this.flashPanelTouchZones();
    this.flashMobilePanelOverview();
  }

  private flashPanelTouchZones(): void {
    if (!this.isMobileViewport || !this.isPanelModeActive) {
      return;
    }

    this.showPanelTouchZones = true;
    this.clearReaderTimeout(this.panelTouchHintTimeout);
    this.panelTouchHintTimeout = setTimeout(() => {
      this.showPanelTouchZones = false;
      this.panelTouchHintTimeout = null;
    }, 1200);
  }

  private flashMobilePanelOverview(): void {
    if (!this.isMobileViewport || !this.isPanelModeActive || this.panelCount === 0) {
      return;
    }

    this.showMobilePanelOverview = true;
    this.clearReaderTimeout(this.mobilePanelOverviewTimeout);
    this.mobilePanelOverviewTimeout = setTimeout(() => {
      this.showMobilePanelOverview = false;
      this.mobilePanelOverviewTimeout = null;
    }, 450);
  }

  private revealTouchChrome(): void {
    if (!this.isMobileViewport || this.isHeaderFooterPinned) {
      return;
    }

    this.headerService.setForceVisible(true);
    this.footerService.setForceVisible(true);
    this.clearReaderTimeout(this.touchChromeTimeout);
    this.touchChromeTimeout = setTimeout(() => {
      if (!this.isHeaderFooterPinned) {
        this.headerService.setForceVisible(false);
        this.footerService.setForceVisible(false);
      }
      this.touchChromeTimeout = null;
    }, 2200);
  }

  private resetPanelViewport(): void {
    this.resetManualPageViewport();
    this.resetPanelPan();
    this.panelManualZoom = 1;
  }

  private resetPanelPan(): void {
    this.panelPanX = 0;
    this.panelPanY = 0;
  }

  private preparePanelGestureInteraction(): boolean {
    if (!this.isPanelModeActive || this.panelCount === 0) {
      return false;
    }

    if (this.activePanelIndex < 0) {
      this.activePanelIndex = 0;
      this.resetPanelPan();
    }

    return this.isPanelBoxingActive;
  }

  private getTouchDistance(firstTouch: Touch, secondTouch: Touch): number {
    return Math.hypot(secondTouch.clientX - firstTouch.clientX, secondTouch.clientY - firstTouch.clientY);
  }

  private clearReaderTimeout(timeoutHandle: ReturnType<typeof setTimeout> | null): void {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }

  private endReadingSession(): void {
    if (this.readingSessionService.isSessionActive()) {
      const percentage = this.pages.length > 0 ? Math.round(((this.currentPage + 1) / this.pages.length) * 1000) / 10 : 0;
      this.readingSessionService.endSession((this.currentPage + 1).toString(), percentage);
    }
  }

  private updateBookmarkState(): void {
    this.isCurrentPageBookmarked = this.sidebarService.isPageBookmarked(this.currentPage + 1);
  }

  toggleBookmark(): void {
    this.sidebarService.toggleBookmark(this.currentPage + 1);
  }

  private updateNotesState(): void {
    this.currentPageHasNotes = this.sidebarService.pageHasNotes(this.currentPage + 1);
  }

  openNoteDialog(): void {
    this.editingNote = null;
    this.noteDialogData = {
      pageNumber: this.currentPage + 1
    };
    this.showNoteDialog = true;
  }

  private openNoteDialogForEdit(note: BookNoteV2): void {
    this.editingNote = note;
    this.noteDialogData = {
      pageNumber: parseInt(note.cfi, 10) || this.currentPage + 1,
      noteId: note.id,
      noteContent: note.noteContent,
      color: note.color
    };
    this.showNoteDialog = true;
  }

  onNoteSave(result: CbxNoteDialogResult): void {
    if (this.editingNote) {
      this.sidebarService.updateNote(this.editingNote.id, result.noteContent, result.color);
    } else if (this.noteDialogData) {
      this.sidebarService.createNote(this.noteDialogData.pageNumber, result.noteContent, result.color);
    }
    this.showNoteDialog = false;
    this.noteDialogData = null;
    this.editingNote = null;
  }

  onNoteCancel(): void {
    this.showNoteDialog = false;
    this.noteDialogData = null;
    this.editingNote = null;
  }
}
