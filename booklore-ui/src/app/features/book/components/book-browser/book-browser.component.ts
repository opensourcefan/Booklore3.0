import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  QueryList,
  NgZone,
  signal,
  ViewChild,
  ViewChildren
} from '@angular/core';
import {ActivatedRoute, NavigationStart, Router} from '@angular/router';
import {ConfirmationService, MenuItem, MessageService} from 'primeng/api';
import {PageTitleService} from '../../../../shared/service/page-title.service';
import {BookService, RemoveFromLibraryMode} from '../../service/book.service';
import {BookMetadataManageService} from '../../service/book-metadata-manage.service';
import {debounceTime, filter, map, switchMap, takeUntil} from 'rxjs/operators';
import {BehaviorSubject, combineLatest, Observable, of, Subject, Subscription} from 'rxjs';
import {DynamicDialogRef} from 'primeng/dynamicdialog';
import {Library} from '../../model/library.model';
import {Shelf} from '../../model/shelf.model';
import {SortDirection, SortOption} from '../../model/sort.model';
import {BookState} from '../../model/state/book-state.model';
import {Book} from '../../model/book.model';
import {LibraryShelfMenuService} from '../../service/library-shelf-menu.service';
import {BookTableComponent, TableViewportMetrics} from './book-table/book-table.component';
import {animate, style, transition, trigger} from '@angular/animations';
import {Button} from 'primeng/button';
import {AsyncPipe, NgClass} from '@angular/common';
import {BookCardComponent} from './book-card/book-card.component';
import {ProgressSpinner} from 'primeng/progressspinner';
import {Menu} from 'primeng/menu';
import {InputText} from 'primeng/inputtext';
import {FormsModule} from '@angular/forms';
import {BookFilterComponent} from './book-filter/book-filter.component';
import {Tooltip} from 'primeng/tooltip';
import {BookFilterMode, DEFAULT_VISIBLE_SORT_FIELDS, EntityViewPreferences, SortCriterion, UserService} from '../../../settings/user-management/user.service';
import {SeriesCollapseFilter} from './filters/SeriesCollapseFilter';
import {normalizeFilterMode, SideBarFilter} from './filters/sidebar-filter';
import {HeaderFilter} from './filters/HeaderFilter';
import {CoverScalePreferenceService} from './cover-scale-preference.service';
import {BookSorter} from './sorting/BookSorter';
import {BookDialogHelperService} from './book-dialog-helper.service';
import {Checkbox} from 'primeng/checkbox';
import {Popover} from 'primeng/popover';
import {Slider} from 'primeng/slider';
import {Divider} from 'primeng/divider';
import {MultiSelect} from 'primeng/multiselect';
import {TableColumnPreferenceService} from './table-column-preference.service';
import {TieredMenu} from 'primeng/tieredmenu';
import {BadgeModule} from 'primeng/badge';
import {BookMenuService} from '../../service/book-menu.service';
import {MagicShelf} from '../../../magic-shelf/service/magic-shelf.service';
import {SidebarFilterTogglePrefService} from './filters/sidebar-filter-toggle-pref.service';
import {MetadataRefreshType} from '../../../metadata/model/request/metadata-refresh-type.enum';
import {TaskHelperService} from '../../../settings/task-management/task-helper.service';
import {FilterLabelHelper} from './filter-label.helper';
import {LocalStorageService} from '../../../../shared/service/local-storage.service';
import {WriteProgressService} from '../../../../shared/service/write-progress.service';
import {BookNavigationService} from '../../service/book-navigation.service';
import {BookCardOverlayPreferenceService} from './book-card-overlay-preference.service';
import {BookSelectionService, CheckboxClickEvent} from './book-selection.service';
import {BookBrowserQueryParamsService, VIEW_MODES} from './book-browser-query-params.service';
import {BookBrowserEntityService, EntityInfo} from './book-browser-entity.service';
import {BookFilterOrchestrationService} from './book-filter-orchestration.service';
import {BookBrowserScrollService} from './book-browser-scroll.service';
import {AppSettingsService} from '../../../../shared/service/app-settings.service';
import {MultiSortPopoverComponent} from './sorting/multi-sort-popover/multi-sort-popover.component';
import {SortService} from '../../service/sort.service';
import {injectVirtualGrid} from '../../../../shared/util/virtual-grid.util';
import {PagedGridPilotService} from '../../service/paged-grid-pilot.service';

import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {ResizableDividerDirective} from '../../../../shared/directives/resizable-divider.directive';
import {CoverPreviewComponent} from '../../../../shared/components/cover-preview/cover-preview.component';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {DirectoryFilterService} from '../../service/directory-filter.service';
import {DirectoryPanelService} from '../../service/directory-panel.service';
import {MediaTypePreferencesService} from '../../service/media-type-preferences.service';
import {MobileBackHandle, MobileBackNavigationService} from '../../../../shared/service/mobile-back-navigation.service';
import {isDirectoryScopeActive} from './book-browser-directory-scope.util';
import {
  buildGridViewportContext,
  GridViewportContext,
  shouldResetGridViewport,
} from './book-browser-grid-reset.util';
import { PagedBookBrowserEntity } from '../../model/state/paged-book-browser-state.model';

export enum EntityType {
  LIBRARY = 'Library',
  SHELF = 'Shelf',
  MAGIC_SHELF = 'Magic Shelf',
  ALL_BOOKS = 'All Books',
  NOT_SHELFED = 'Not Shelfed',
}

@Component({
  selector: 'app-book-browser',
  standalone: true,
  templateUrl: './book-browser.component.html',
  styleUrls: ['./book-browser.component.scss'],
  imports: [
    Button, BookCardComponent, AsyncPipe, ProgressSpinner, Menu, InputText, FormsModule,
    BookTableComponent, BookFilterComponent, Tooltip, NgClass, Popover,
    Checkbox, Slider, Divider, MultiSelect, TieredMenu, BadgeModule, MultiSortPopoverComponent, TranslocoDirective,
    ResizableDividerDirective, CoverPreviewComponent,
  ],
  providers: [SeriesCollapseFilter],
  animations: [
    trigger('slideInOut', [
      transition(':enter', [
        style({transform: 'translateY(100%)'}),
        animate('0.1s ease-in', style({transform: 'translateY(0)'}))
      ]),
      transition(':leave', [
        style({transform: 'translateY(0)'}),
        animate('0.1s ease-out', style({transform: 'translateY(100%)'}))
      ])
    ])
  ]
})
export class BookBrowserComponent implements OnInit, AfterViewInit, OnDestroy {

  protected userService = inject(UserService);
  protected coverScalePreferenceService = inject(CoverScalePreferenceService);
  protected columnPreferenceService = inject(TableColumnPreferenceService);
  protected sidebarFilterTogglePrefService = inject(SidebarFilterTogglePrefService);
  protected seriesCollapseFilter = inject(SeriesCollapseFilter);
  protected confirmationService = inject(ConfirmationService);
  protected taskHelperService = inject(TaskHelperService);
  protected bookCardOverlayPreferenceService = inject(BookCardOverlayPreferenceService);
  protected bookSelectionService = inject(BookSelectionService);
  protected appSettingsService = inject(AppSettingsService);
  private ngZone = inject(NgZone);

  private cdr = inject(ChangeDetectorRef);
  private activatedRoute = inject(ActivatedRoute);
  private router = inject(Router);
  private messageService = inject(MessageService);
  private bookService = inject(BookService);
  private bookMetadataManageService = inject(BookMetadataManageService);
  private dialogHelperService = inject(BookDialogHelperService);
  private bookMenuService = inject(BookMenuService);
  private libraryShelfMenuService = inject(LibraryShelfMenuService);
  private pageTitle = inject(PageTitleService);
  private writeProgressService = inject(WriteProgressService);
  private bookNavigationService = inject(BookNavigationService);
  private queryParamsService = inject(BookBrowserQueryParamsService);
  private entityService = inject(BookBrowserEntityService);
  private filterOrchestrationService = inject(BookFilterOrchestrationService);
  private localStorageService = inject(LocalStorageService);
  private scrollService = inject(BookBrowserScrollService);
  private readonly t = inject(TranslocoService);
  private urlHelper = inject(UrlHelperService);
  private directoryFilterService = inject(DirectoryFilterService);
  readonly dirPanelService = inject(DirectoryPanelService);
  private mediaTypePreferences = inject(MediaTypePreferencesService);
  private mobileBackNavigation = inject(MobileBackNavigationService);
  private pagedGridPilotService = inject(PagedGridPilotService);
  readonly pagedGridPilotStatus$ = this.pagedGridPilotService.status$;

  bookState$: Observable<BookState> | undefined;
  entity$: Observable<Library | Shelf | MagicShelf | null> | undefined;
  entityType$: Observable<EntityType> | undefined;
  private entityRouteInfo$!: Observable<EntityInfo>;
  searchTerm$ = new BehaviorSubject<string>('');
  selectedFilter = new BehaviorSubject<Record<string, string[]> | null>(null);
  selectedFilterMode = new BehaviorSubject<BookFilterMode>('and');
  protected resetFilterSubject = new Subject<void>();

  parsedFilters: Record<string, string[]> = {};
  entity: Library | Shelf | MagicShelf | null = null;
  entityType: EntityType | undefined;
  bookTitle = '';
  entityOptions: MenuItem[] | undefined;
  isDrawerVisible = false;
  dynamicDialogRef: DynamicDialogRef | undefined | null;
  EntityType = EntityType;
  currentFilterLabel: string | null = null;
  rawFilterParamFromUrl: string | null = null;
  hasSearchTerm = false;
  activeDirFilterPath: string | null = null;
  visibleColumns: { field: string; header: string }[] = [];
  entityViewPreferences: EntityViewPreferences | undefined;
  currentViewMode: string | undefined;
  lastAppliedSortCriteria: SortOption[] = [];
  private baseSortCriteria: SortOption[] = [];
  private hasExplicitSortQuery = false;
  visibleSortOptions: SortOption[] = [];
  showFilter = false;
  screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  mobileColumnCount = 3;
  mobileTitleRows = 2;
  desktopTitleRows = 2;
  selectedCount = 0;
  selectedBookIds = new Set<number>();
  hiddenSelectedCount = 0;
  private visibleBookIds = new Set<number>();
  allowFileDeletion = false;
  isSelectionActionPanelOpen = false;

  // Cover preview state
  selectedCoverUrl: string | null = null;
  selectedBookTitle = '';
  private hoverPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPreviewBookId: number | null = null;

  private readonly MOBILE_BREAKPOINT = 768;
  private readonly CARD_ASPECT_RATIO = 7 / 5;
  private readonly MOBILE_GAP = 8;
  private readonly MOBILE_PADDING = 48;
  private readonly MOBILE_TITLE_BAR_HEIGHT = 32;
  private readonly MOBILE_COLUMNS_STORAGE_KEY = 'mobileColumnsPreference';
  private readonly MOBILE_TITLE_ROWS_STORAGE_KEY = 'mobileTitleRowsPreference';
  private readonly DESKTOP_TITLE_ROWS_STORAGE_KEY = 'desktopTitleRowsPreference';
  private readonly SHOW_SUBTITLES_STORAGE_KEY = 'bookBrowserShowSubtitlesPreference';
  private readonly COVER_PREVIEW_HOVER_DELAY_MS = 120;

  private settingFiltersFromUrl = false;
  private hasInitializedFilterMode = false;
  private destroy$ = new Subject<void>();
  private lastEntityKey: string | null = null;
  private previousSelectedCount = 0;
  protected metadataMenuItems: MenuItem[] | undefined;
  protected moreActionsMenuItems: MenuItem[] | undefined;
  mediaTypeActionsMenuItems: MenuItem[] = [];
  showSubtitles = false;
  protected gridRenderVersion = 0;

  // Flags to prevent sort reset after saving preferences
  private isSavingSort = false;
  private isSavingSortDefault = false;

  private sideBarFilter = new SideBarFilter(this.selectedFilter, this.selectedFilterMode);
  private headerFilter = new HeaderFilter(this.searchTerm$);
  protected bookSorter = new BookSorter(
    sortCriteria => this.onMultiSortChange(sortCriteria),
    this.t
  );
  private sortService = inject(SortService);

  private bookStateSubscription: Subscription | undefined;
  private pendingGridViewportReset = false;
  private pendingScrollRestorePosition: number | null = null;
  private lastGridViewportContext: GridViewportContext | null = null;

  @ViewChild(BookTableComponent)
  bookTableComponent!: BookTableComponent;
  @ViewChildren(BookFilterComponent)
  bookFilterComponents!: QueryList<BookFilterComponent>;
  private _scrollContainer?: ElementRef<HTMLElement>;
  @ViewChild('scrollContainer')
  set scrollContainer(el: ElementRef<HTMLElement> | undefined) {
    this._scrollContainer = el;
    this.updateVirtualGridDomBindings();
  }
  get scrollContainer(): ElementRef<HTMLElement> | undefined {
    return this._scrollContainer;
  }

  private _gridContainer?: ElementRef<HTMLElement>;
  @ViewChild('gridContainer')
  set gridContainer(el: ElementRef<HTMLElement> | undefined) {
    this._gridContainer = el;
    this.updateVirtualGridDomBindings();
  }
  get gridContainer(): ElementRef<HTMLElement> | undefined {
    return this._gridContainer;
  }
  @ViewChild('mobileRightSidebarPop')
  mobileRightSidebarPop: Popover | undefined;
  private isMobileRightSidebarOpen = false;
  private mobileRightSidebarBackHandle: MobileBackHandle | null = null;

  @HostListener('window:resize')
  onResize(): void {
    this.screenWidth = window.innerWidth;
    this.cardWidthSig.set(this.currentCardSize.width);
    this.cardHeightSig.set(this.getUniformCardHeight());
    this.gapSig.set(this.isMobile ? this.MOBILE_GAP : 20.8);
    this.updateVirtualGridDomBindings();
  }

  get isMobile(): boolean {
    return this.screenWidth < this.MOBILE_BREAKPOINT;
  }

  get mobileCardSize(): { width: number; height: number } {
    const columns = this.mobileColumnCount;
    const totalGaps = (columns - 1) * this.MOBILE_GAP;
    const availableWidth = this.screenWidth - totalGaps - this.MOBILE_PADDING;
    const cardWidth = Math.floor(availableWidth / columns);
    const coverHeight = this.isAudiobookOnlyLibrary ? cardWidth : Math.floor(cardWidth * this.CARD_ASPECT_RATIO);
    const cardHeight = coverHeight + this.getMobileTitleBarHeight();
    return {width: cardWidth, height: cardHeight};
  }

  get selectedBooks(): Set<number> {
    return this.selectedBookIds;
  }

  get hasHiddenSelections(): boolean {
    return this.hiddenSelectedCount > 0;
  }

  get currentCardSize() {
    if (this.isMobile) {
      return this.mobileCardSize;
    }
    const base = this.coverScalePreferenceService.currentCardSize;
    if (this.isAudiobookOnlyLibrary) {
      const squareSide = Math.round(base.width * 1.1);
      return { width: squareSide, height: squareSide + 31 };
    }
    return base;
  }

  get gridColumnMinWidth(): string {
    if (this.isMobile) {
      return `${this.mobileCardSize.width}px`;
    }
    if (this.isAudiobookOnlyLibrary) {
      return `${this.currentCardSize.width}px`;
    }
    return this.coverScalePreferenceService.gridColumnMinWidth;
  }

  getCardHeight(_book: Book): number {
    if (this.isMobile) {
      return this.mobileCardSize.height;
    }
    const desktopTitleRowsExtra = (this.desktopTitleRows - 1) * 18;
    if (this.isAudiobookOnlyLibrary) {
      return this.currentCardSize.height + desktopTitleRowsExtra;
    }
    return this.coverScalePreferenceService.getCardHeight(_book) + desktopTitleRowsExtra;
  }

  get viewIcon(): string {
    return this.currentViewMode === VIEW_MODES.GRID ? 'pi pi-objects-column' : 'pi pi-table';
  }

  get isFilterActive(): boolean {
    return !!this.selectedFilter.value && Object.keys(this.selectedFilter.value).length > 0;
  }

  get isWaitingForDirectorySelection(): boolean {
    return this.canShowDirectoryExplorer && this.dirPanelService.isVisible && this.activeDirFilterPath === null;
  }

  get isDirectoryScopedView(): boolean {
    return isDirectoryScopeActive(this.activeDirFilterPath);
  }

  get shouldShowDirectoryReset(): boolean {
    return this.canShowDirectoryExplorer && isDirectoryScopeActive(this.activeDirFilterPath);
  }

  get canShowDirectoryExplorer(): boolean {
    if (this.isMobile || !this.entityType) {
      return false;
    }

    return this.entityType === EntityType.ALL_BOOKS
      || this.entityType === EntityType.LIBRARY
      || this.entityType === EntityType.SHELF;
  }

  get isPagedPilotActive(): boolean {
    return this.pagedGridPilotService.isPagedActive();
  }

  get computedFilterLabel(): string {
    const filters = this.selectedFilter.value;

    if (!filters || Object.keys(filters).length === 0) {
      return this.t.translate('book.browser.labels.allBooks');
    }

    const filterEntries = Object.entries(filters);

    if (filterEntries.length === 1) {
      const [filterType, values] = filterEntries[0];
      if ((filterType === 'customMediaType' || filterType === 'customBookType') && values.length === 1) {
        if (values[0] === 'PHYSICAL') {
          return this.t.translate('layout.menu.physicalBooks');
        }
        return `Media: ${values[0]}`;
      }
      const filterName = FilterLabelHelper.getFilterTypeName(filterType);

      if (values.length === 1) {
        const displayValue = FilterLabelHelper.getFilterDisplayValue(filterType, values[0]);
        return `${filterName}: ${displayValue}`;
      }

      return `${filterName} (${values.length})`;
    }

    const filterSummary = filterEntries
      .map(([type, values]) => `${FilterLabelHelper.getFilterTypeName(type)} (${values.length})`)
      .join(', ');

    return filterSummary.length > 50
      ? this.t.translate('book.browser.labels.activeFilters', {count: filterEntries.length})
      : filterSummary;
  }

  get activeMediaTypeFilter(): string | null {
    const filters = this.selectedFilter.value;
    if (!filters) {
      return null;
    }

    const mediaTypes = filters['customMediaType'] ?? filters['customBookType'];
    if (!mediaTypes || mediaTypes.length !== 1) {
      return null;
    }

    const mediaType = mediaTypes[0] ?? null;
    return mediaType === 'PHYSICAL' ? null : mediaType;
  }

  openMediaTypeActionsMenu(event: Event, menu: Menu): void {
    const mediaType = this.activeMediaTypeFilter;
    if (!mediaType) {
      this.mediaTypeActionsMenuItems = [];
      return;
    }

    this.mediaTypeActionsMenuItems = [
      {
        label: 'Edit Media Type',
        icon: 'pi pi-pencil',
        command: () => this.openMediaTypeManagerDialog()
      },
      {
        label: 'Delete Media Type',
        icon: 'pi pi-trash',
        command: () => this.openMediaTypeDeleteDialog(mediaType)
      }
    ];

    menu.toggle(event);
  }

  get isAudiobookOnlyLibrary(): boolean {
    if (!this.entity || this.entityType !== EntityType.LIBRARY) return false;
    const library = this.entity as Library;
    return !!library.allowedFormats && library.allowedFormats.length === 1 && library.allowedFormats[0] === 'AUDIOBOOK';
  }

  get seriesViewEnabled(): boolean {
    return Boolean(this.userService.getCurrentUser()?.userSettings?.enableSeriesView);
  }

  get hasMetadataMenuItems(): boolean {
    return this.metadataMenuItems!.length > 0;
  }

  get hasMoreActionsItems(): boolean {
    return this.moreActionsMenuItems!.length > 0;
  }

  // Handle book card hover for cover preview
  onBookClicked(book: Book): void {
    this.clearHoverPreviewTimer();
    this.pendingPreviewBookId = book.id;

    this.ngZone.runOutsideAngular(() => {
      this.hoverPreviewTimer = setTimeout(() => {
        this.ngZone.run(() => {
          if (this.pendingPreviewBookId !== book.id) {
            return;
          }
          const isAudiobook = book.primaryFile?.bookType === 'AUDIOBOOK';
          this.selectedCoverUrl = isAudiobook
            ? this.urlHelper.getAudiobookCoverUrl(book.id, book.metadata?.audiobookCoverUpdatedOn)
            : this.urlHelper.getCoverUrl(book.id, book.metadata?.coverUpdatedOn);
          this.selectedBookTitle = this.getDisplayTitle(book);
          this.pendingPreviewBookId = null;
          this.hoverPreviewTimer = null;
          this.cdr.detectChanges();
        });
      }, this.COVER_PREVIEW_HOVER_DELAY_MS);
    });
  }

  onBookHoverEnded(bookId: number): void {
    if (this.pendingPreviewBookId === bookId) {
      this.pendingPreviewBookId = null;
      this.clearHoverPreviewTimer();
    }
  }

  private readonly gridItemCountSig = signal(0);
  private readonly cardWidthSig = signal(this.currentCardSize.width);
  private readonly cardHeightSig = signal(this.getUniformCardHeight());
  private readonly gapSig = signal(this.isMobile ? this.MOBILE_GAP : 20.8);

  readonly virtualGrid = injectVirtualGrid(() => ({
    itemCount: this.gridItemCountSig(),
    cardWidth: this.cardWidthSig(),
    cardHeight: this.cardHeightSig(),
    gap: this.gapSig(),
    overscan: 5,
  }));

  ngOnInit(): void {
    this.pageTitle.setPageTitle('');
    this.coverScalePreferenceService.scaleChange$.pipe(debounceTime(1000), takeUntil(this.destroy$)).subscribe();
    this.loadMobileColumnsPreference();
    this.loadTitleRowsPreference();
    this.loadSubtitlePreference();

    this.dirPanelService.visible$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        requestAnimationFrame(() => this.updateVirtualGridDomBindings());
      });

    this.directoryFilterService.filter$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.syncActiveDirectoryFilter();
      this.applyEffectiveSortCriteria();
    });

    this.initializeEntityRouting();
    this.setupRouteChangeHandlers();
    this.setupAppSettingsSubscription();
    this.setupUserStateSubscription();
    this.setupQueryParamSubscription();
    this.setupFilterToggleSubscription();
    this.setupSearchTermSubscription();
    this.setupScrollPositionTracking();
    this.setupSelectionSubscription();
  }

  ngAfterViewInit(): void {
    this.sidebarFilterTogglePrefService.mobileFilterToggle$
      .pipe(takeUntil(this.destroy$))
      .subscribe((event: MouseEvent) => {
        if (!this.isMobile) {
          return;
        }
        this.toggleMobileRightSidebar(event);
      });

    this.settingFiltersFromUrl = true;
    this.bookFilterComponents?.forEach(comp => {
      comp.setFilters?.(this.parsedFilters);
      comp.onFiltersChanged?.();
    });
    this.settingFiltersFromUrl = false;

    const key = this.getScrollPositionKey();
    const savedPosition = this.scrollService.getPosition(key);
    if (savedPosition !== undefined) {
      this.pendingScrollRestorePosition = savedPosition;
    }

    this.updateVirtualGridDomBindings();
  }

  ngOnDestroy(): void {
    this.forceCloseMobileRightSidebar(false);
    this.clearHoverPreviewTimer();
    this.pagedGridPilotService.resetActiveQuery();
    this.destroy$.next();
    this.destroy$.complete();
  }

  onRouteReattached(): void {
    this.bookFilterComponents?.forEach(component => component.refreshAfterRouteAttach());
    this.pagedGridPilotService.refreshActiveState();
    this.syncSelectionState(this.bookSelectionService.selectedBooks);
    this.bookTableComponent?.refreshSelectionFromInputs();
    this.restoreSavedScrollPosition();
    this.cdr.detectChanges();
  }

  private clearHoverPreviewTimer(): void {
    if (!this.hoverPreviewTimer) {
      return;
    }
    clearTimeout(this.hoverPreviewTimer);
    this.hoverPreviewTimer = null;
  }

  private getScrollPositionKey(): string {
    const path = this.activatedRoute.snapshot.routeConfig?.path ?? '';
    return this.scrollService.createKey(path, this.activatedRoute.snapshot.params);
  }

  private setupScrollPositionTracking(): void {
    this.router.events.pipe(
      filter(event => event instanceof NavigationStart),
      takeUntil(this.destroy$)
    ).subscribe((event) => {
      this.handleNavigationStart(event as NavigationStart);
      this.saveScrollPosition();
    });
  }

  private handleNavigationStart(event: NavigationStart): void {
    if (!this.isMobile) {
      return;
    }

    if (event.navigationTrigger !== 'popstate' && this.isMobileRightSidebarOpen) {
      this.forceCloseMobileRightSidebar(false);
    }
  }

  private saveScrollPosition(): void {
    const el = this.scrollContainer?.nativeElement;
    if (!el || !el.isConnected) return;
    const key = this.getScrollPositionKey();
    this.scrollService.savePosition(key, el.scrollTop ?? 0);
  }

  private restoreSavedScrollPosition(): void {
    const savedPosition = this.scrollService.getPosition(this.getScrollPositionKey());
    if (savedPosition === undefined) {
      return;
    }

    requestAnimationFrame(() => {
      const scrollEl = this.scrollContainer?.nativeElement;
      if (!scrollEl) {
        return;
      }

      scrollEl.scrollTop = savedPosition;
      scrollEl.dispatchEvent(new Event('scroll'));
      this.cdr.detectChanges();
    });
  }

  private initializeEntityRouting(): void {
    const currentPath = this.activatedRoute.snapshot.routeConfig?.path;

    if (currentPath === 'all-books' || currentPath === 'not-shelfed') {
      const entityType = currentPath === 'all-books' ? EntityType.ALL_BOOKS : EntityType.NOT_SHELFED;
      this.entityType = entityType;
      this.entityType$ = of(entityType);
      this.entityRouteInfo$ = of({entityId: NaN, entityType});
      this.entity$ = of(null);
      this.seriesCollapseFilter.setContext(null, null);
      this.bookCardOverlayPreferenceService.setContext(null, null);
      this.pageTitle.setPageTitle(currentPath === 'all-books' ? this.t.translate('book.browser.labels.allBooks') : this.t.translate('book.browser.labels.unshelvedBooks'));
    } else {
      const routeEntityInfo$ = this.entityService.getEntityInfoFromRoute(this.activatedRoute);
      this.entityRouteInfo$ = routeEntityInfo$;
      this.entityType$ = routeEntityInfo$.pipe(map(info => {
        this.entityType = info.entityType;
        return info.entityType;
      }));
      this.entity$ = routeEntityInfo$.pipe(
        switchMap(({entityId, entityType}) => this.entityService.fetchEntity(entityId, entityType))
      );
      this.entity$.pipe(takeUntil(this.destroy$)).subscribe(entity => this.handleEntityLoaded(entity));
    }
  }

  private handleEntityLoaded(entity: Library | Shelf | MagicShelf | null): void {
    if (entity) {
      this.pageTitle.setPageTitle(entity.name);
    }
    this.entity = entity ?? null;
    this.updateSeriesCollapseContext();
    this.entityOptions = entity
      ? this.entityService.isLibrary(entity)
        ? this.libraryShelfMenuService.initializeLibraryMenuItems(entity)
        : this.entityService.isMagicShelf(entity)
          ? this.libraryShelfMenuService.initializeMagicShelfMenuItems(entity)
          : this.libraryShelfMenuService.initializeShelfMenuItems(entity)
      : [];
  }

  private setupRouteChangeHandlers(): void {
    this.activatedRoute.paramMap.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.searchTerm$.next('');
      this.bookTitle = '';
      this.bookSelectionService.deselectAll();
      this.clearFilter();
      this.syncActiveDirectoryFilter();
    });
  }

  private setupUserStateSubscription(): void {
    this.userService.userState$.pipe(
      filter(u => !!u?.user && u.loaded),
      takeUntil(this.destroy$)
    ).subscribe(userState => {
        this.metadataMenuItems = this.bookMenuService.getMetadataMenuItems(
          () => this.autoFetchMetadata(),
          () => this.fetchMetadata(),
          () => this.bulkEditMetadata(),
          () => this.multiBookEditMetadata(),
          () => this.restoreTitlesFromFilenamesForSelected(),
          () => this.regenerateCoversForSelected(),
          () => this.generateCustomCoversForSelected(),
          userState.user
        );
      });

    this.moreActionsMenuItems = this.bookMenuService.getMoreActionsMenu(this.selectedBooks, this.user());
  }

  private setupAppSettingsSubscription(): void {
    this.appSettingsService.appSettings$
      .pipe(takeUntil(this.destroy$))
      .subscribe(settings => {
        this.allowFileDeletion = settings?.allowFileDeletion ?? false;
      });
  }

  private setupQueryParamSubscription(): void {
    this.sidebarFilterTogglePrefService.showFilter$
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        this.showFilter = value;
        requestAnimationFrame(() => this.updateVirtualGridDomBindings());
      });

    combineLatest([
      this.entityRouteInfo$,
      this.activatedRoute.queryParamMap,
      this.userService.userState$.pipe(filter(u => !!u?.user && u.loaded))
    ]).pipe(takeUntil(this.destroy$)).subscribe(([entityInfo, queryParamMap, user]) => {
      // Skip processing if we're in the middle of saving sort preferences
      if (this.isSavingSort) {
        this.isSavingSort = false;
        if (this.isSavingSortDefault) this.isSavingSortDefault = false;
        return; // Preserve user-explicit sort entirely
      }
      this.entityType = entityInfo.entityType;
      const previousViewMode = this.currentViewMode;
      const previousFilterMode = this.selectedFilterMode.getValue();
      const previousFilterSignature = JSON.stringify(this.parsedFilters);
      const entityKey = `${entityInfo.entityType}:${entityInfo.entityId}`;
      const entityChanged = this.lastEntityKey !== null && this.lastEntityKey !== entityKey;
      if (this.lastEntityKey !== null && this.lastEntityKey !== entityKey) {
        this.directoryFilterService.clear();
      }
      this.lastEntityKey = entityKey;
      this.syncActiveDirectoryFilter();
      
      // Handle entity change sort stripping - prevent stale sort params from previous entity
      if (entityChanged && queryParamMap.has('sort')) {
        const newParams: Record<string, string | null> = {};
        queryParamMap.keys.forEach(key => {
          if (key !== 'sort' && key !== 'direction') {
            newParams[key] = queryParamMap.get(key);
          }
        });
        this.router.navigate([], { queryParams: newParams, replaceUrl: true });
        return; // EARLY return - don't parse, don't sync
      }

      const parseResult = this.queryParamsService.parseQueryParams(
        queryParamMap,
        user.user?.userSettings?.entityViewPreferences,
        entityInfo.entityType,
        entityInfo.entityId,
        this.bookSorter.sortOptions,
        normalizeFilterMode(user.user?.userSettings?.filterMode)
      );

      this.hasExplicitSortQuery = queryParamMap.has('sort');
      this.baseSortCriteria = [...parseResult.sortCriteria];
      const effectiveSortCriteria = this.getEffectiveSortCriteria(parseResult.sortCriteria);


      this.settingFiltersFromUrl = true;
      const hasExplicitFilterMode = queryParamMap.has('fmode');

      if (!this.hasInitializedFilterMode || hasExplicitFilterMode) {
        if (parseResult.filterMode !== this.selectedFilterMode.getValue()) {
          this.selectedFilterMode.next(parseResult.filterMode);
        }
        this.hasInitializedFilterMode = true;
      }

      this.currentFilterLabel = this.t.translate('book.browser.labels.allBooks');
      const filterParams = queryParamMap.get('filter');

      if (filterParams) {
        this.selectedFilter.next(parseResult.filters);

        this.bookFilterComponents?.forEach(comp => {
          comp.setFilters?.(parseResult.filters);
          comp.onFiltersChanged?.();
        });

        if (Object.keys(parseResult.filters).length > 0) {
          this.currentFilterLabel = this.computedFilterLabel;
        }

        this.rawFilterParamFromUrl = filterParams;
      } else {
        this.rawFilterParamFromUrl = null;
      }

      this.settingFiltersFromUrl = false;

      if (!filterParams) {
        this.clearSidebarFiltersState();
      }

      this.parsedFilters = parseResult.filters;
      const currentFilterSignature = JSON.stringify(this.parsedFilters);

      if (entityInfo.entityType === EntityType.ALL_BOOKS || entityInfo.entityType === EntityType.NOT_SHELFED) {
        this.pageTitle.setPageTitle(this.currentFilterLabel ?? '');
      }

      this.entityViewPreferences = user.user?.userSettings?.entityViewPreferences;
      this.coverScalePreferenceService.initScaleValue(this.coverScalePreferenceService.scaleFactor);
      this.columnPreferenceService.initPreferences(user.user?.userSettings?.tableColumnPreference);
      this.visibleColumns = this.columnPreferenceService.visibleColumns;

      const visibleFields = user.user?.userSettings?.visibleSortFields ?? DEFAULT_VISIBLE_SORT_FIELDS;
      const sortOptionsByField = new Map(this.bookSorter.sortOptions.map(o => [o.field, o]));
      this.visibleSortOptions = visibleFields.map(f => sortOptionsByField.get(f)).filter((o): o is SortOption => !!o);


      if (!this.areSortCriteriaEqual(this.bookSorter.selectedSortCriteria, effectiveSortCriteria)) {
        this.bookSorter.setSortCriteria(effectiveSortCriteria);
      }
      this.currentViewMode = parseResult.viewMode;
      const dataSourceContextChanged = entityChanged
        || previousViewMode !== this.currentViewMode
        || previousFilterMode !== this.selectedFilterMode.getValue()
        || previousFilterSignature !== currentFilterSignature;

      if (dataSourceContextChanged || !this.areSortCriteriaEqual(this.lastAppliedSortCriteria, this.bookSorter.selectedSortCriteria)) {
        this.lastAppliedSortCriteria = [...this.bookSorter.selectedSortCriteria];
        this.applySortCriteria(this.bookSorter.selectedSortCriteria);
      }


      this.queryParamsService.syncQueryParams(
        this.activatedRoute,
        this.currentViewMode!,
        this.selectedFilterMode.getValue(),
        this.parsedFilters
      );
    });
  }

  private setupSearchTermSubscription(): void {
    this.searchTerm$.pipe(takeUntil(this.destroy$)).subscribe(term => {
      this.hasSearchTerm = !!term && term.trim().length > 0;
    });
  }

  private setupFilterToggleSubscription(): void {
    this.sidebarFilterTogglePrefService.showFilter$
      .pipe(takeUntil(this.destroy$))
      .subscribe(value => {
        this.showFilter = value;
      });
  }

  private setupSelectionSubscription(): void {
    this.bookSelectionService.selectedBooks$
      .pipe(takeUntil(this.destroy$))
      .subscribe(selectedBooks => {
        const nextSelectedCount = selectedBooks.size;

        if (nextSelectedCount > 0 && this.previousSelectedCount === 0) {
          this.isSelectionActionPanelOpen = true;
        } else if (nextSelectedCount === 0 && this.previousSelectedCount > 0) {
          this.isSelectionActionPanelOpen = false;
        }

        this.previousSelectedCount = nextSelectedCount;
        this.syncSelectionState(selectedBooks);
        this.cdr.detectChanges();
      });
  }

  private syncSelectionState(selectedBooks: Set<number>): void {
    this.selectedBookIds = new Set(selectedBooks);
    this.selectedCount = this.selectedBookIds.size;
    this.isDrawerVisible = this.selectedCount > 0;
    this.moreActionsMenuItems = this.bookMenuService.getMoreActionsMenu(this.selectedBookIds, this.user());
    this.updateSelectionVisibility();
  }

  private updateSelectionVisibility(): void {
    if (this.selectedBookIds.size === 0) {
      this.hiddenSelectedCount = 0;
      return;
    }

    const visibleBookIds = this.visibleBookIds.size > 0
      ? this.visibleBookIds
      : new Set(this.bookSelectionService.getCurrentBooks().map(book => book.id));
    let visibleSelectedCount = 0;

    this.selectedBookIds.forEach(bookId => {
      if (visibleBookIds.has(bookId)) {
        visibleSelectedCount += 1;
      }
    });

    this.hiddenSelectedCount = Math.max(this.selectedBookIds.size - visibleSelectedCount, 0);
  }

  toggleSelectionActionPanel(): void {
    this.isSelectionActionPanelOpen = !this.isSelectionActionPanelOpen;
  }

  onFilterSelected(filters: Record<string, string[]> | null): void {
    if (this.settingFiltersFromUrl) return;

    this.selectedFilter.next(filters);
    this.rawFilterParamFromUrl = null;
    this.parsedFilters = filters ?? {};

    const hasSidebarFilters = !!filters && Object.keys(filters).length > 0;
    this.currentFilterLabel = hasSidebarFilters ? this.computedFilterLabel : this.t.translate('book.browser.labels.allBooks');

    this.queryParamsService.updateFilters(this.activatedRoute, filters);

    if (this.entityType === EntityType.ALL_BOOKS) {
      this.applySortCriteria(this.getEffectiveSortCriteria(this.bookSorter.selectedSortCriteria));
    }
  }

  onFilterModeChanged(mode: BookFilterMode): void {
    const safe = normalizeFilterMode(mode);
    if (this.settingFiltersFromUrl || safe === this.selectedFilterMode.getValue()) return;

    this.clearSidebarFiltersState(true);
    this.selectedFilterMode.next(safe);
    this.queryParamsService.updateFilterMode(this.activatedRoute, safe, {}, true);
    this.persistFilterModePreference(safe);

    if (this.entityType === EntityType.ALL_BOOKS) {
      this.applySortCriteria(this.getEffectiveSortCriteria(this.bookSorter.selectedSortCriteria));
    }
  }

  private clearSidebarFiltersState(suppressFilterSelectionEvents = false): void {
    const previousSettingFiltersFromUrl = this.settingFiltersFromUrl;

    if (suppressFilterSelectionEvents) {
      this.settingFiltersFromUrl = true;
    }

    this.rawFilterParamFromUrl = null;
    this.parsedFilters = {};
    this.currentFilterLabel = this.t.translate('book.browser.labels.allBooks');

    if (this.selectedFilter.value !== null) {
      this.selectedFilter.next(null);
    }

    this.resetFilterSubject.next();

    if (suppressFilterSelectionEvents) {
      this.settingFiltersFromUrl = previousSettingFiltersFromUrl;
    }
  }

  private persistFilterModePreference(mode: BookFilterMode): void {
    const user = this.userService.getCurrentUser();
    if (!user || user.userSettings?.filterMode === mode) {
      return;
    }

    this.userService.updateUserSetting(user.id, 'filterMode', mode);
  }

  toggleSidebar(): void {
    this.showFilter = !this.showFilter;
    this.sidebarFilterTogglePrefService.selectedShowFilter = this.showFilter;
    requestAnimationFrame(() => this.updateVirtualGridDomBindings());
  }

  onMobileRightSidebarShow(): void {
    this.isMobileRightSidebarOpen = true;
    if (this.mobileRightSidebarBackHandle) {
      return;
    }

    this.mobileRightSidebarBackHandle = this.mobileBackNavigation.register(() => {
      this.mobileRightSidebarPop?.hide();
    });
  }

  onMobileRightSidebarHide(): void {
    this.isMobileRightSidebarOpen = false;
    this.mobileRightSidebarBackHandle?.release();
    this.mobileRightSidebarBackHandle = null;
  }

  private toggleMobileRightSidebar(event: MouseEvent): void {
    if (!this.mobileRightSidebarPop) {
      return;
    }

    this.mobileRightSidebarPop.toggle(event);
  }

  private forceCloseMobileRightSidebar(removeHistoryEntry: boolean): void {
    if (this.isMobileRightSidebarOpen) {
      this.mobileRightSidebarPop?.hide();
    }

    this.mobileRightSidebarBackHandle?.release(removeHistoryEntry);
    this.mobileRightSidebarBackHandle = null;
    this.isMobileRightSidebarOpen = false;
  }

  updateScale(): void {
    this.coverScalePreferenceService.setScale(this.coverScalePreferenceService.scaleFactor);
    this.cardWidthSig.set(this.currentCardSize.width);
    this.cardHeightSig.set(this.getUniformCardHeight());
    queueMicrotask(() => this.updateVirtualGridDomBindings());
  }

  onVisibleColumnsChange(selected: { field: string; header: string }[]): void {
    const allFields = this.bookTableComponent.allColumns.map(col => col.field);
    this.visibleColumns = selected.sort(
      (a, b) => allFields.indexOf(a.field) - allFields.indexOf(b.field)
    );
  }

  onCheckboxClicked(event: CheckboxClickEvent): void {
    this.bookSelectionService.handleCheckboxClick(event);
  }

  onSelectedBooksChange(selectedBookIds: Set<number>): void {
    this.bookSelectionService.setSelectedBooks(selectedBookIds);
  }

  selectAllBooks(): void {
    this.bookSelectionService.setSelectedBooks(new Set(this.visibleBookIds));
  }

  deselectAllBooks(): void {
    this.bookSelectionService.deselectAll();
  }

  confirmDeleteBooks(): void {
    this.confirmationService.confirm({
      message: this.t.translate('book.browser.confirm.deleteMessage', {count: this.selectedBooks.size}),
      header: this.t.translate('book.browser.confirm.deleteHeader'),
      icon: 'pi pi-exclamation-triangle',
      acceptIcon: 'pi pi-trash',
      rejectIcon: 'pi pi-times',
      acceptLabel: this.t.translate('common.delete'),
      rejectLabel: this.t.translate('common.cancel'),
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-outlined',
      accept: () => {
        const count = this.selectedBooks.size;
        this.writeProgressService.show(this.t.translate('book.browser.loading.deleting', {count}));

        this.bookService.deleteBooks(this.selectedBooks, true)
          .subscribe(() => {
            this.writeProgressService.complete(`Deleted ${count} book${count === 1 ? '' : 's'}`);
            this.bookSelectionService.deselectAll();
          });
      }
    });
  }

  confirmDeleteBooksLibraryOnly(): void {
    this.confirmationService.confirm({
      message: this.t.translate('book.browser.confirm.removeFromLibraryMessage', {count: this.selectedBooks.size}),
      header: this.t.translate('book.browser.confirm.removeFromLibraryHeader'),
      icon: 'pi pi-exclamation-triangle',
      acceptIcon: 'pi pi-minus-circle',
      rejectIcon: 'pi pi-times',
      acceptLabel: this.t.translate('common.remove'),
      rejectLabel: this.t.translate('common.cancel'),
      acceptButtonStyleClass: 'p-button-warning',
      rejectButtonStyleClass: 'p-button-outlined',
      accept: () => {
        this.removeSelectedBooks('REMOVE_FOREVER');
      }
    });
  }

  confirmDeleteBooksLibraryUntilNextScan(): void {
    this.confirmationService.confirm({
      message: `${this.t.translate('book.browser.confirm.removeFromLibraryMessage', {count: this.selectedBooks.size})}\n\nThis option allows the books to return on the next scan.`,
      header: 'Remove Until Next Scan',
      icon: 'pi pi-exclamation-triangle',
      acceptIcon: 'pi pi-history',
      rejectIcon: 'pi pi-times',
      acceptLabel: this.t.translate('common.remove'),
      rejectLabel: this.t.translate('common.cancel'),
      acceptButtonStyleClass: 'p-button-warning',
      rejectButtonStyleClass: 'p-button-outlined',
      accept: () => {
        this.removeSelectedBooks('REMOVE_UNTIL_NEXT_SCAN');
      }
    });
  }

  private removeSelectedBooks(mode: RemoveFromLibraryMode): void {
    const count = this.selectedBooks.size;
    this.writeProgressService.show(this.t.translate('book.browser.loading.deleting', {count}));

    this.bookService.deleteBooks(this.selectedBooks, false, mode)
      .subscribe(() => {
        const detail = mode === 'REMOVE_FOREVER'
          ? `Removed ${count} book${count === 1 ? '' : 's'} from library permanently`
          : `Removed ${count} book${count === 1 ? '' : 's'} from library until next scan`;
        this.writeProgressService.complete(detail);
        this.bookSelectionService.deselectAll();
      });
  }

  onSeriesCollapseCheckboxChange(value: boolean): void {
    this.seriesCollapseFilter.setCollapsed(value);
  }

  onMultiSortChange(sortCriteria: SortOption[]): void {
    if (this.isDirectoryScopedView) {
      this.applyEffectiveSortCriteria();
      return;
    }

    this.baseSortCriteria = [...sortCriteria];
    this.hasExplicitSortQuery = true;
    this.applySortCriteria(sortCriteria);
    this.queryParamsService.updateMultiSort(this.activatedRoute, sortCriteria);
  }

  onManualSortChange(sortOption: SortOption): void {
    this.onMultiSortChange([sortOption]);
  }

  applySortCriteria(sortCriteria: SortOption[]): void {
    const primarySort = sortCriteria[0] ?? {field: 'addedOn', direction: 'DESCENDING', label: 'Added On'};
    const nextViewportContext = this.createGridViewportContext(sortCriteria);

    if (shouldResetGridViewport(this.lastGridViewportContext, nextViewportContext)) {
      this.pendingGridViewportReset = true;
      this.gridRenderVersion += 1;
    }

    this.lastGridViewportContext = nextViewportContext;

    const pagedEntity = this.getPagedPilotEntity();

    if (pagedEntity) {
      if (pagedEntity === 'ALL_BOOKS' || pagedEntity === 'NOT_SHELFED') {
        this.bookState$ = this.pagedGridPilotService.connect({
          entity: pagedEntity,
          entityId: null,
          viewMode: this.currentViewMode,
          sortCriteria,
          filters: this.parsedFilters,
          filterMode: this.selectedFilterMode.getValue(),
          isDirectoryScopedView: this.isDirectoryScopedView,
          isSeriesCollapsed: this.seriesCollapseFilter.isSeriesCollapsed,
          searchTerm: this.searchTerm$.getValue(),
        }, () => (pagedEntity === 'NOT_SHELFED'
          ? this.entityService.fetchNotShelfedBooks(primarySort)
          : this.entityService.fetchAllBooks(primarySort)
        ).pipe(
          map(bookState => this.applyClientSideMultiSort(bookState, sortCriteria)),
          switchMap(bookState => this.applyBookFilters(bookState))
        ));
      } else {
        const routeParam$ = this.entityService.getEntityInfoFromRoute(this.activatedRoute);
        this.bookState$ = routeParam$.pipe(
          switchMap(({entityId, entityType}) =>
            this.pagedGridPilotService.connect({
              entity: pagedEntity,
              entityId,
              viewMode: this.currentViewMode,
              sortCriteria,
              filters: this.parsedFilters,
              filterMode: this.selectedFilterMode.getValue(),
              isDirectoryScopedView: this.isDirectoryScopedView,
              isSeriesCollapsed: this.seriesCollapseFilter.isSeriesCollapsed,
              searchTerm: this.searchTerm$.getValue(),
            }, () => this.entityService.fetchBooksByEntity(entityId, entityType, primarySort).pipe(
              map(bookState => this.applyClientSideMultiSort(bookState, sortCriteria)),
              switchMap(bookState => this.applyBookFilters(bookState))
            ))
          )
        );
      }
    } else {
      this.syncExplicitLegacyBrowseStatus();
      const routeParam$ = this.entityService.getEntityInfoFromRoute(this.activatedRoute);
      this.bookState$ = routeParam$.pipe(
        switchMap(({entityId, entityType}) =>
          this.entityService.fetchBooksByEntity(entityId, entityType, primarySort)
        ),
        map(bookState => this.applyClientSideMultiSort(bookState, sortCriteria)),
        switchMap(bookState => this.applyBookFilters(bookState))
      );
    }

    if (this.bookStateSubscription) {
      this.bookStateSubscription.unsubscribe();
    }

    this.visibleBookIds = new Set<number>();

    this.bookStateSubscription = this.bookState$
      .pipe(
        filter(state => state.loaded && !state.error),
        takeUntil(this.destroy$),
        map(state => state.books || [])
      )
      .subscribe(books => {
        this.gridItemCountSig.set(books.length);
        this.cardWidthSig.set(this.currentCardSize.width);
        this.cardHeightSig.set(this.getUniformCardHeight());
        this.gapSig.set(this.isMobile ? this.MOBILE_GAP : 20.8);
        this.updateVirtualGridDomBindings();

        const restoredSavedScrollPosition = this.restorePendingScrollPosition();

        if (this.currentViewMode === VIEW_MODES.GRID && this.pendingGridViewportReset && !restoredSavedScrollPosition) {
          this.resetGridViewport();
        }

        this.pendingGridViewportReset = false;

        this.visibleBookIds = new Set(books.map(book => book.id));
        this.bookSelectionService.setCurrentBooks(books);
        this.bookNavigationService.setAvailableBookIds(books.map(book => book.id));
        this.updateSelectionVisibility();
        this.cdr.markForCheck();
      });
  }

  private syncExplicitLegacyBrowseStatus(): void {
    switch (this.entityType) {
      case EntityType.MAGIC_SHELF:
        this.pagedGridPilotService.setExplicitLegacyStatus(
          'Magic Shelf routes currently use the legacy full-state path.',
          ['magic shelf route stays on legacy full-state mode'],
        );
        break;
      default:
        this.pagedGridPilotService.resetActiveQuery();
        break;
    }
  }

  private restorePendingScrollPosition(): boolean {
    if (this.pendingScrollRestorePosition === null) {
      return false;
    }

    const savedPosition = this.pendingScrollRestorePosition;
    this.pendingScrollRestorePosition = null;

    requestAnimationFrame(() => {
      const scrollEl = this.scrollContainer?.nativeElement;
      if (!scrollEl) {
        return;
      }

      scrollEl.scrollTop = savedPosition;
      scrollEl.dispatchEvent(new Event('scroll'));
      this.cdr.detectChanges();
    });

    return true;
  }

  private getUniformCardHeight(): number {
    if (this.isMobile) {
      return this.mobileCardSize.height;
    }
    const desktopTitleRowsExtra = (this.desktopTitleRows - 1) * 18;
    if (this.isAudiobookOnlyLibrary) {
      return this.currentCardSize.height + desktopTitleRowsExtra;
    }
    return this.coverScalePreferenceService.currentCardSize.height + desktopTitleRowsExtra;
  }

  private virtualGridDomBindingsScheduled = false;

  private updateVirtualGridDomBindings(): void {
    if (this.virtualGridDomBindingsScheduled) {
      return;
    }
    this.virtualGridDomBindingsScheduled = true;

    const scrollEl = this.scrollContainer?.nativeElement ?? null;
    this.virtualGrid.setScrollElement(scrollEl);

    const widthEl = this.gridContainer?.nativeElement ?? scrollEl;
    if (widthEl) {
      // Defer all layout reads to a single rAF after the next paint.
      // This avoids nesting queueMicrotask → rAF and coalesces multiple
      // rapid calls (from ViewChild setters, resize, explicit triggers)
      // into one measurement cycle per frame.
      requestAnimationFrame(() => {
        this.virtualGridDomBindingsScheduled = false;
        if (widthEl.clientWidth > 0) {
          this.virtualGrid.setContainerWidth(widthEl.clientWidth);
        }
        this.virtualGrid.virtualizer.measure();

        if (scrollEl) {
          scrollEl.dispatchEvent(new Event('scroll'));
        }

        this.cdr.markForCheck();
      });
    } else {
      this.virtualGridDomBindingsScheduled = false;
    }
  }

  private resetGridViewport(): void {
    const scrollEl = this.scrollContainer?.nativeElement;
    if (!scrollEl) {
      return;
    }

    queueMicrotask(() => {
      scrollEl.scrollTop = 0;
      scrollEl.dispatchEvent(new Event('scroll'));
    });
  }

  onGridScroll(event?: Event): void {
    if (event && !event.isTrusted) {
      return;
    }

    this.loadNextPagedPageIfNeeded(this.scrollContainer?.nativeElement ?? null);
  }

  onTableScroll(metrics: TableViewportMetrics): void {
    if (!this.pagedGridPilotService.isPagedActive()) {
      return;
    }

    this.pagedGridPilotService.loadNextPageIfNeeded(
      metrics.scrollTop,
      metrics.clientHeight,
      metrics.scrollHeight,
    );
  }

  private loadNextPagedPageIfNeeded(scrollElement: HTMLElement | null): void {
    if (!this.pagedGridPilotService.isPagedActive()) {
      return;
    }

    if (!scrollElement) {
      return;
    }

    this.pagedGridPilotService.loadNextPageIfNeeded(
      scrollElement.scrollTop,
      scrollElement.clientHeight,
      scrollElement.scrollHeight,
    );
  }

  private applyClientSideMultiSort(bookState: BookState, sortCriteria: SortOption[]): BookState {
    if (!bookState.books || sortCriteria.length <= 1) {
      return bookState;
    }
    return {
      ...bookState,
      books: this.sortService.applyMultiSort(bookState.books, sortCriteria)
    };
  }

  applySortOption(sortOption: SortOption): void {
    this.applySortCriteria([sortOption]);
  }

  private areSortCriteriaEqual(a: SortOption[], b: SortOption[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((criterion, index) =>
      criterion.field === b[index].field && criterion.direction === b[index].direction
    );
  }

  onSortCriteriaChange(criteria: SortOption[]): void {
    if (this.isDirectoryScopedView) {
      this.applyEffectiveSortCriteria();
      return;
    }

    this.bookSorter.setSortCriteria(criteria);
    this.onMultiSortChange(criteria);
  }

  onShowSubtitlesChange(value: boolean): void {
    this.showSubtitles = !!value;
    this.localStorageService.set(this.SHOW_SUBTITLES_STORAGE_KEY, this.showSubtitles);

    const previewBook = this.getPreviewBook();
    if (previewBook) {
      this.selectedBookTitle = this.getDisplayTitle(previewBook);
    }
  }

  get canSaveSort(): boolean {
    return this.entityType === EntityType.LIBRARY ||
           this.entityType === EntityType.SHELF ||
           this.entityType === EntityType.MAGIC_SHELF ||
           this.entityType === EntityType.ALL_BOOKS ||
           this.entityType === EntityType.NOT_SHELFED;
  }

  onSaveSortConfig(criteria: SortOption[]): void {
    if (!this.entityType) return;

    const user = this.userService.getCurrentUser();
    if (!user) return;

    const sortCriteria: SortCriterion[] = criteria.map(c => ({
      field: c.field,
      direction: c.direction === SortDirection.ASCENDING ? 'ASC' as const : 'DESC' as const
    }));

    const prefs: EntityViewPreferences = structuredClone(
      user.userSettings.entityViewPreferences ?? {global: {sortKey: 'title', sortDir: 'ASC', view: 'GRID', coverSize: 1.0, seriesCollapsed: false, overlayBookType: true, overlayAiPanelData: true, overlayIssueNumber: true}, overrides: []}
    );

    if (this.entityType === EntityType.ALL_BOOKS || this.entityType === EntityType.NOT_SHELFED) {
      prefs.global = {
        ...prefs.global,
        sortKey: sortCriteria[0]?.field ?? 'title',
        sortDir: sortCriteria[0]?.direction ?? 'ASC',
        sortCriteria
      };
    } else {
      if (!this.entity) return;
      if (!prefs.overrides) prefs.overrides = [];

      let overrideEntityType: 'LIBRARY' | 'SHELF' | 'MAGIC_SHELF';
      switch (this.entityType) {
        case EntityType.LIBRARY: overrideEntityType = 'LIBRARY'; break;
        case EntityType.SHELF: overrideEntityType = 'SHELF'; break;
        case EntityType.MAGIC_SHELF: overrideEntityType = 'MAGIC_SHELF'; break;
        default: return;
      }

      const existingIndex = prefs.overrides.findIndex(
        o => o.entityType === overrideEntityType && o.entityId === this.entity!.id
      );

      if (existingIndex >= 0) {
        prefs.overrides[existingIndex].preferences = {
          ...prefs.overrides[existingIndex].preferences,
          sortKey: sortCriteria[0]?.field ?? 'title',
          sortDir: sortCriteria[0]?.direction ?? 'ASC',
          sortCriteria
        };
      } else {
        prefs.overrides.push({
          entityType: overrideEntityType,
          entityId: this.entity!.id!,
          preferences: {
            sortKey: sortCriteria[0]?.field ?? 'title',
            sortDir: sortCriteria[0]?.direction ?? 'ASC',
            sortCriteria,
            view: 'GRID',
            coverSize: 1.0,
            seriesCollapsed: false,
            overlayBookType: true,
            overlayAiPanelData: true,
            overlayIssueNumber: true
          }
        });
      }
    }

    // Set flags to prevent sort reset during user state update
    this.isSavingSort = true;
    this.isSavingSortDefault = true;

    this.userService.updateUserSetting(user.id, 'entityViewPreferences', prefs);
    this.messageService.add({
      severity: 'success',
      summary: this.t.translate('book.browser.toast.sortSavedSummary'),
      detail: this.entityType === EntityType.ALL_BOOKS || this.entityType === EntityType.NOT_SHELFED
        ? this.t.translate('book.browser.toast.sortSavedGlobalDetail')
        : this.t.translate('book.browser.toast.sortSavedEntityDetail', {entityType: this.entityType.toLowerCase()})
    });
  }

  private getStoredMediaTypes(): string[] {
    return this.mediaTypePreferences.getCustomTypes();
  }

  private setStoredMediaTypes(types: string[]): void {
    this.mediaTypePreferences.setCustomTypes(types);
  }

  private openMediaTypeManagerDialog(): void {
    this.dynamicDialogRef = this.dialogHelperService.openMediaTypeManagerDialog();
    if (!this.dynamicDialogRef) {
      return;
    }

    this.dynamicDialogRef.onClose.subscribe((result: {
      changed?: boolean;
      renamed?: {from: string; to: string}[];
      deleted?: string[];
    } | boolean) => {
      if (!result || typeof result === 'boolean' || !result.changed) {
        return;
      }

      const active = this.activeMediaTypeFilter;
      if (!active) {
        return;
      }

      const renamedMatch = (result.renamed ?? [])
        .find(rename => rename.from.toLowerCase() === active.toLowerCase());

      if (renamedMatch) {
        this.queryParamsService.updateFilters(this.activatedRoute, {customMediaType: [renamedMatch.to]});
        return;
      }

      const deletedActive = (result.deleted ?? [])
        .some(type => type.toLowerCase() === active.toLowerCase());
      if (deletedActive) {
        this.clearFilter();
      }
    });
  }

  private openMediaTypeDeleteDialog(mediaType: string): void {
    this.dynamicDialogRef = this.dialogHelperService.openMediaTypeDeleteDialog(mediaType, this.getMediaTypeUsageCount(mediaType));
    if (!this.dynamicDialogRef) {
      return;
    }

    this.dynamicDialogRef.onClose.subscribe((result: {confirmed?: boolean} | boolean) => {
      const confirmed = typeof result === 'boolean' ? result : !!result?.confirmed;
      if (!confirmed) {
        return;
      }

      this.deleteMediaType(mediaType);
    });
  }

  private deleteMediaType(mediaType: string): void {
    const updated = this.getStoredMediaTypes().filter(type => type.toLowerCase() !== mediaType.toLowerCase());
    this.setStoredMediaTypes(updated);

    const ids = new Set((this.bookService.getCurrentBookState().books ?? [])
      .filter(book => (book.fileType ?? '').trim().toLowerCase() === mediaType.toLowerCase())
      .map(book => book.id));

    if (!ids.size) {
      if (this.activeMediaTypeFilter?.toLowerCase() === mediaType.toLowerCase()) {
        this.clearFilter();
      }
      this.messageService.add({severity: 'success', summary: 'Success', detail: 'Media Type deleted.'});
      return;
    }

    this.bookService.updateFileType(ids, null).subscribe({
      next: () => {
        if (this.activeMediaTypeFilter?.toLowerCase() === mediaType.toLowerCase()) {
          this.clearFilter();
        }
        this.messageService.add({severity: 'success', summary: 'Success', detail: 'Media Type deleted.'});
      },
      error: () => {
        this.messageService.add({severity: 'error', summary: 'Error', detail: 'Failed to delete Media Type.'});
      }
    });
  }

  private getMediaTypeUsageCount(mediaType: string): number {
    return (this.bookService.getCurrentBookState().books ?? [])
      .filter(book => (book.fileType ?? '').trim().toLowerCase() === mediaType.toLowerCase())
      .length;
  }

  private getEffectiveSortCriteria(baseSortCriteria: SortOption[]): SortOption[] {
    if (!isDirectoryScopeActive(this.activeDirFilterPath)) {
      return baseSortCriteria;
    }

    return [this.getDirectoryDefaultSortOption()];
  }

  private applyEffectiveSortCriteria(): void {
    const baseSortCriteria = this.baseSortCriteria.length > 0 ? this.baseSortCriteria : this.bookSorter.selectedSortCriteria;
    const effectiveSortCriteria = this.getEffectiveSortCriteria(baseSortCriteria);

    if (!this.areSortCriteriaEqual(this.bookSorter.selectedSortCriteria, effectiveSortCriteria)) {
      this.bookSorter.setSortCriteria(effectiveSortCriteria);
    }

    if (!this.areSortCriteriaEqual(this.lastAppliedSortCriteria, effectiveSortCriteria)) {
      this.lastAppliedSortCriteria = [...effectiveSortCriteria];
      this.applySortCriteria(effectiveSortCriteria);
    }
  }

  private getDirectoryDefaultSortOption(): SortOption {
    return this.bookSorter.sortOptions.find(option => option.field === 'fileName')
      ?? {field: 'fileName', direction: SortDirection.ASCENDING, label: 'File Name'};
  }

  get sortCriteriaCount(): number {
    return this.bookSorter.selectedSortCriteria.length;
  }

  onSearchTermChange(term: string): void {
    this.searchTerm$.next(term);

    if (this.getPagedPilotEntity()) {
      this.applySortCriteria(this.getEffectiveSortCriteria(this.bookSorter.selectedSortCriteria));
    }
  }

  private getPagedPilotEntity(): PagedBookBrowserEntity | null {
    switch (this.entityType) {
      case EntityType.ALL_BOOKS:
        return 'ALL_BOOKS';
      case EntityType.LIBRARY:
        return 'LIBRARY';
      case EntityType.SHELF:
        return 'SHELF';
      case EntityType.NOT_SHELFED:
        return 'NOT_SHELFED';
      default:
        return null;
    }
  }

  clearSearch(): void {
    this.bookTitle = '';
    this.onSearchTermChange('');
    this.resetFilters();
  }

  resetFilters(): void {
    this.resetFilterSubject.next();
  }

  clearFilter(): void {
    if (this.selectedFilter.value !== null) {
      this.selectedFilter.next(null);
    }
    this.parsedFilters = {};
    this.rawFilterParamFromUrl = null;
    this.currentFilterLabel = this.t.translate('book.browser.labels.allBooks');
    this.queryParamsService.updateFilters(this.activatedRoute, null);
    this.clearSearch();
  }

  toggleTableGrid(): void {
    this.currentViewMode = this.currentViewMode === VIEW_MODES.GRID ? VIEW_MODES.TABLE : VIEW_MODES.GRID;
    this.queryParamsService.updateViewMode(this.activatedRoute, this.currentViewMode as 'grid' | 'table');
  }

  unshelfBooks(): void {
    if (!this.entity) return;
    const count = this.selectedBooks.size;
    this.writeProgressService.show(this.t.translate('book.browser.loading.unshelving', {count}));

    this.bookService.updateBookShelves(this.selectedBooks, new Set(), new Set([this.entity.id!]))
      .subscribe({
        next: () => {
          this.writeProgressService.complete(this.t.translate('book.browser.toast.unshelveSuccessDetail'));
          this.messageService.add({severity: 'info', summary: this.t.translate('common.success'), detail: this.t.translate('book.browser.toast.unshelveSuccessDetail')});
          void this.bookService.refreshBooks().subscribe();
          this.bookSelectionService.deselectAll();
        },
        error: () => {
          this.writeProgressService.fail(this.t.translate('book.browser.toast.unshelveFailedDetail'));
          this.messageService.add({severity: 'error', summary: this.t.translate('common.error'), detail: this.t.translate('book.browser.toast.unshelveFailedDetail')});
        }
      });
  }

  openShelfAssigner(): void {
    this.dynamicDialogRef = this.dialogHelperService.openShelfAssignerDialog(null, this.selectedBooks);
    if (this.dynamicDialogRef) {
      this.dynamicDialogRef.onClose.subscribe(result => {
        if (result.assigned) {
          this.bookSelectionService.deselectAll();
        }
      });
    }
  }

  openBookTypeAssigner(): void {
    this.dynamicDialogRef = this.dialogHelperService.openBookTypeAssignerDialog(null, this.selectedBooks);
    if (this.dynamicDialogRef) {
      this.dynamicDialogRef.onClose.subscribe(result => {
        if (result.assigned) {
          this.bookSelectionService.deselectAll();
        }
      });
    }
  }

  lockUnlockMetadata(): void {
    this.dynamicDialogRef = this.dialogHelperService.openLockUnlockMetadataDialog(this.selectedBooks);
    if (this.dynamicDialogRef) {
      this.dynamicDialogRef.onClose.subscribe(() => {
        this.bookSelectionService.deselectAll();
      });
    }
  }

  autoFetchMetadata(): void {
    if (!this.selectedBooks || this.selectedBooks.size === 0) return;
    this.taskHelperService.refreshMetadataTask({
      refreshType: MetadataRefreshType.BOOKS,
      bookIds: Array.from(this.selectedBooks),
    }).subscribe(result => {
      if (result.success) {
        this.deselectAllBooks();
      }
    });
  }

  fetchMetadata(): void {
    this.dialogHelperService.openMetadataRefreshDialog(this.selectedBooks);
  }

  bulkEditMetadata(): void {
    this.dynamicDialogRef = this.dialogHelperService.openBulkMetadataEditDialog(this.selectedBooks);
    if (this.dynamicDialogRef) {
      this.dynamicDialogRef.onClose.subscribe(() => {
        this.bookSelectionService.deselectAll();
      });
    }
  }

  multiBookEditMetadata(): void {
    this.dynamicDialogRef = this.dialogHelperService.openMultibookMetadataEditorDialog(this.selectedBooks);
    if (this.dynamicDialogRef) {
      this.dynamicDialogRef.onClose.subscribe(() => {
        this.bookSelectionService.deselectAll();
      });
    }
  }

  wipeSelectedMetadata(): void {
    if (!this.selectedBooks || this.selectedBooks.size === 0) return;

    const count = this.selectedBooks.size;
    this.confirmationService.confirm({
      message: this.t.translate('book.browser.confirm.wipeMetadataMessage', {count}),
      header: this.t.translate('book.browser.confirm.wipeMetadataHeader'),
      icon: 'pi pi-database',
      acceptLabel: this.t.translate('common.delete'),
      rejectLabel: this.t.translate('common.cancel'),
      acceptButtonProps: {
        label: this.t.translate('common.delete'),
        severity: 'danger'
      },
      rejectButtonProps: {
        label: this.t.translate('common.cancel'),
        severity: 'secondary'
      },
      accept: () => {
        this.writeProgressService.show(this.t.translate('book.browser.loading.wipingMetadata', {count}));
        this.bookMetadataManageService.wipeBooksMetadata(Array.from(this.selectedBooks)).subscribe({
          next: () => {
            this.writeProgressService.complete(this.t.translate('book.browser.toast.wipeMetadataSuccessDetail', {count}));
            this.messageService.add({
              severity: 'success',
              summary: this.t.translate('common.success'),
              detail: this.t.translate('book.browser.toast.wipeMetadataSuccessDetail', {count})
            });
            this.bookSelectionService.deselectAll();
          },
          error: () => {
            this.writeProgressService.fail(this.t.translate('book.browser.toast.wipeMetadataFailedDetail'));
            this.messageService.add({
              severity: 'error',
              summary: this.t.translate('common.error'),
              detail: this.t.translate('book.browser.toast.wipeMetadataFailedDetail')
            });
          }
        });
      }
    });
  }

  restoreTitlesFromFilenamesForSelected(): void {
    if (!this.selectedBooks || this.selectedBooks.size === 0) return;

    const count = this.selectedBooks.size;
    this.confirmationService.confirm({
      message: this.t.translate('book.browser.confirm.restoreTitlesFromFilenamesMessage', {count}),
      header: this.t.translate('book.browser.confirm.restoreTitlesFromFilenamesHeader'),
      icon: 'pi pi-file-edit',
      acceptLabel: this.t.translate('common.yes'),
      rejectLabel: this.t.translate('common.no'),
      acceptButtonProps: {
        label: this.t.translate('common.yes'),
        severity: 'success'
      },
      rejectButtonProps: {
        label: this.t.translate('common.no'),
        severity: 'secondary'
      },
      accept: () => {
        this.writeProgressService.show(this.t.translate('book.browser.loading.restoringTitlesFromFilenames', {count}));
        this.bookMetadataManageService.restoreTitlesFromFilenames(Array.from(this.selectedBooks)).subscribe({
          next: (updatedCount) => {
            if (updatedCount > 0) {
              this.writeProgressService.complete(this.t.translate('book.browser.toast.restoreTitlesFromFilenamesSuccessDetail', {updatedCount, count}));
              this.messageService.add({
                severity: 'success',
                summary: this.t.translate('book.browser.toast.restoreTitlesFromFilenamesSuccessSummary'),
                detail: this.t.translate('book.browser.toast.restoreTitlesFromFilenamesSuccessDetail', {updatedCount, count})
              });
            } else {
              this.writeProgressService.complete(this.t.translate('book.browser.toast.restoreTitlesFromFilenamesNoEligibleDetail'));
              this.messageService.add({
                severity: 'info',
                summary: this.t.translate('book.browser.toast.restoreTitlesFromFilenamesNoEligibleSummary'),
                detail: this.t.translate('book.browser.toast.restoreTitlesFromFilenamesNoEligibleDetail')
              });
            }
            this.bookSelectionService.deselectAll();
          },
          error: () => {
            this.writeProgressService.fail(this.t.translate('book.browser.toast.restoreTitlesFromFilenamesFailedDetail'));
            this.messageService.add({
              severity: 'error',
              summary: this.t.translate('common.error'),
              detail: this.t.translate('book.browser.toast.restoreTitlesFromFilenamesFailedDetail')
            });
          }
        });
      }
    });
  }

  regenerateCoversForSelected(): void {
    if (!this.selectedBooks || this.selectedBooks.size === 0) return;
    const count = this.selectedBooks.size;
    this.confirmationService.confirm({
      message: this.t.translate('book.browser.confirm.regenCoverMessage', {count}),
      header: this.t.translate('book.browser.confirm.regenCoverHeader'),
      icon: 'pi pi-image',
      acceptLabel: this.t.translate('common.yes'),
      rejectLabel: this.t.translate('common.no'),
      acceptButtonProps: {
        label: this.t.translate('common.yes'),
        severity: 'success'
      },
      rejectButtonProps: {
        label: this.t.translate('common.no'),
        severity: 'secondary'
      },
      accept: () => {
        this.bookMetadataManageService.regenerateCoversForBooks(Array.from(this.selectedBooks)).subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: this.t.translate('book.browser.toast.regenCoverStartedSummary'),
              detail: this.t.translate('book.browser.toast.regenCoverStartedDetail', {count}),
              life: 3000
            });
            this.deselectAllBooks();
          },
          error: () => {
            this.messageService.add({
              severity: 'error',
              summary: this.t.translate('book.browser.toast.failedSummary'),
              detail: this.t.translate('book.browser.toast.regenCoverFailedDetail'),
              life: 3000
            });
          }
        });
      }
    });
  }

  generateCustomCoversForSelected(): void {
    if (!this.selectedBooks || this.selectedBooks.size === 0) return;
    const count = this.selectedBooks.size;
    this.confirmationService.confirm({
      message: this.t.translate('book.browser.confirm.customCoverMessage', {count}),
      header: this.t.translate('book.browser.confirm.customCoverHeader'),
      icon: 'pi pi-palette',
      acceptLabel: this.t.translate('common.yes'),
      rejectLabel: this.t.translate('common.no'),
      acceptButtonProps: {
        label: this.t.translate('common.yes'),
        severity: 'success'
      },
      rejectButtonProps: {
        label: this.t.translate('common.no'),
        severity: 'secondary'
      },
      accept: () => {
        this.bookMetadataManageService.generateCustomCoversForBooks(Array.from(this.selectedBooks)).subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: this.t.translate('book.browser.toast.customCoverStartedSummary'),
              detail: this.t.translate('book.browser.toast.customCoverStartedDetail', {count}),
              life: 3000
            });
            this.deselectAllBooks();
          },
          error: () => {
            this.messageService.add({
              severity: 'error',
              summary: this.t.translate('book.browser.toast.failedSummary'),
              detail: this.t.translate('book.browser.toast.customCoverFailedDetail'),
              life: 3000
            });
          }
        });
      }
    });
  }

  moveFiles(): void {
    this.dialogHelperService.openFileMoverDialog(this.selectedBooks);
  }

  attachFilesToBook(): void {
    const currentState = this.bookService.getCurrentBookState();
    const selectedBookIds = Array.from(this.selectedBooks);
    const sourceBooks = (currentState.books || []).filter(book =>
      selectedBookIds.includes(book.id)
    );

    if (sourceBooks.length === 0) {
      this.messageService.add({
        severity: 'warn',
        summary: this.t.translate('book.browser.toast.noEligibleBooksSummary'),
        detail: this.t.translate('book.browser.toast.noEligibleBooksDetail')
      });
      return;
    }

    const libraryIds = new Set(sourceBooks.map(b => b.libraryId));
    if (libraryIds.size > 1) {
      this.messageService.add({
        severity: 'warn',
        summary: this.t.translate('book.browser.toast.multipleLibrariesSummary'),
        detail: this.t.translate('book.browser.toast.multipleLibrariesDetail')
      });
      return;
    }

    this.dynamicDialogRef = this.dialogHelperService.openBulkBookFileAttacherDialog(sourceBooks);
    if (this.dynamicDialogRef) {
      this.dynamicDialogRef.onClose.subscribe(result => {
        if (result?.success) {
          this.bookSelectionService.deselectAll();
        }
      });
    }
  }

  canAttachFiles(): boolean {
    if (this.selectedBooks.size === 0) return false;

    const currentState = this.bookService.getCurrentBookState();
    const selectedBookIds = Array.from(this.selectedBooks);
    const selectedBooks = (currentState.books || []).filter(book =>
      selectedBookIds.includes(book.id)
    );

    if (selectedBooks.length === 0) return false;

    const libraryIds = new Set(selectedBooks.map(b => b.libraryId));
    return libraryIds.size === 1;
  }

  user() {
    return this.userService.getCurrentUser();
  }

  private updateSeriesCollapseContext(): void {
    let type: 'LIBRARY' | 'SHELF' | 'MAGIC_SHELF' | null = null;
    let id: number | null = null;

    if (this.entity && this.entityType) {
      switch (this.entityType) {
        case EntityType.LIBRARY:
          type = 'LIBRARY';
          id = this.entity.id ?? 0;
          break;
        case EntityType.SHELF:
          type = 'SHELF';
          id = this.entity.id ?? 0;
          break;
        case EntityType.MAGIC_SHELF:
          type = 'MAGIC_SHELF';
          id = this.entity.id ?? 0;
          break;
      }
    }

    this.seriesCollapseFilter.setContext(type, id);
    this.bookCardOverlayPreferenceService.setContext(type, id);
  }

  private applyBookFilters(bookState: BookState): Observable<BookState> {
    const forceExpandSeries = this.filterOrchestrationService.shouldForceExpandSeries(
      this.activatedRoute.snapshot.queryParamMap
    );

    const primarySort: SortOption = this.bookSorter.selectedSort ?? {
      field: 'addedOn',
      direction: SortDirection.DESCENDING,
      label: 'Added On'
    };

    return this.filterOrchestrationService.applyFilters(
      bookState,
      this.headerFilter,
      this.sideBarFilter,
      this.seriesCollapseFilter,
      forceExpandSeries,
      primarySort
    );
  }

  private syncActiveDirectoryFilter(): void {
    const scopeKey = this.directoryFilterService.getScopeKeyFromUrl(this.router.url);
    const scopedFilter = this.directoryFilterService.getScopedFilter(scopeKey);
    this.activeDirFilterPath = scopedFilter ? scopedFilter.fileSubPath : null;
  }

  private resetDirectoryScopeForCurrentRoute(): void {
    const scopeKey = this.directoryFilterService.getScopeKeyFromUrl(this.router.url);
    this.directoryFilterService.clearScope(scopeKey);
  }

  resetDirectoryScope(): void {
    if (!isDirectoryScopeActive(this.activeDirFilterPath)) {
      return;
    }

    this.resetDirectoryScopeForCurrentRoute();
  }

  private createGridViewportContext(sortCriteria: SortOption[]): GridViewportContext {
    return buildGridViewportContext({
      viewMode: this.currentViewMode,
      entityType: this.entityType,
      sortCriteria,
      filterMode: this.selectedFilterMode.getValue(),
      searchTerm: this.searchTerm$.getValue(),
      activeDirFilterPath: this.activeDirFilterPath,
      filterSignature: JSON.stringify(this.parsedFilters),
    });
  }

  setMobileColumns(columns: number): void {
    this.mobileColumnCount = columns;
    this.localStorageService.set(this.MOBILE_COLUMNS_STORAGE_KEY, columns);
  }

  setMobileTitleRows(rows: number): void {
    this.mobileTitleRows = Math.min(3, Math.max(1, rows));
    this.localStorageService.set(this.MOBILE_TITLE_ROWS_STORAGE_KEY, this.mobileTitleRows);
  }

  setDesktopTitleRows(rows: number): void {
    this.desktopTitleRows = Math.min(5, Math.max(1, rows));
    this.localStorageService.set(this.DESKTOP_TITLE_ROWS_STORAGE_KEY, this.desktopTitleRows);
  }

  private loadMobileColumnsPreference(): void {
    const saved = this.localStorageService.get<number>(this.MOBILE_COLUMNS_STORAGE_KEY);
    if (saved !== null && [2, 3, 4].includes(saved)) {
      this.mobileColumnCount = saved;
    }
  }

  private loadTitleRowsPreference(): void {
    const savedMobileRows = this.localStorageService.get<number>(this.MOBILE_TITLE_ROWS_STORAGE_KEY);
    if (savedMobileRows !== null && [1, 2, 3].includes(savedMobileRows)) {
      this.mobileTitleRows = savedMobileRows;
    }

    const savedDesktopRows = this.localStorageService.get<number>(this.DESKTOP_TITLE_ROWS_STORAGE_KEY);
    if (savedDesktopRows !== null && [1, 2, 3, 4, 5].includes(savedDesktopRows)) {
      this.desktopTitleRows = savedDesktopRows;
    }
  }

  private loadSubtitlePreference(): void {
    const saved = this.localStorageService.get<boolean>(this.SHOW_SUBTITLES_STORAGE_KEY);
    if (typeof saved === 'boolean') {
      this.showSubtitles = saved;
    }
  }

  private getPreviewBook(): Book | undefined {
    if (!this.selectedCoverUrl) {
      return undefined;
    }

    return this.bookService.getCurrentBookState().books?.find(book =>
      this.urlHelper.getCoverUrl(book.id, book.metadata?.coverUpdatedOn) === this.selectedCoverUrl
    );
  }

  private getDisplayTitle(book: Book): string {
    const fileName = book.fileName?.trim() || book.primaryFile?.fileName?.trim() || '';
    if (this.isDirectoryScopedView) {
      return fileName;
    }

    const title = book.metadata?.title?.trim() || '';
    const subtitle = book.metadata?.subtitle?.trim() || '';

    if (this.showSubtitles && title && subtitle) {
      return `${title} : ${subtitle}`;
    }

    return title || fileName;
  }

  private getMobileTitleBarHeight(): number {
    return this.MOBILE_TITLE_BAR_HEIGHT + (this.mobileTitleRows - 1) * 16;
  }
}
