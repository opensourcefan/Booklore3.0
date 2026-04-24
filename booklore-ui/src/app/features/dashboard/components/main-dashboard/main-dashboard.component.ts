import {Component, DestroyRef, ElementRef, OnDestroy, OnInit, ViewChild, inject} from '@angular/core';
import {LibraryService} from '../../../book/service/library.service';
import {Observable} from 'rxjs';
import {map, shareReplay, switchMap} from 'rxjs/operators';
import {Button} from 'primeng/button';
import {AsyncPipe} from '@angular/common';
import {CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray} from '@angular/cdk/drag-drop';
import {DashboardScrollerComponent} from '../dashboard-scroller/dashboard-scroller.component';
import {BookService} from '../../../book/service/book.service';
import {BookState} from '../../../book/model/state/book-state.model';
import {Book, ReadStatus} from '../../../book/model/book.model';
import {UserService} from '../../../settings/user-management/user.service';
import {ProgressSpinner} from 'primeng/progressspinner';
import {TooltipModule} from 'primeng/tooltip';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {DashboardConfigService} from '../../services/dashboard-config.service';
import {cloneDashboardConfig, DashboardConfig, DEFAULT_DASHBOARD_CONFIG, DEFAULT_MAX_ITEMS, getDefaultScrollerTitleKey, MAX_DASHBOARD_GRID_COLUMNS, ScrollerConfig, ScrollerType} from '../../models/dashboard-config.model';
import {MagicShelfService} from '../../../magic-shelf/service/magic-shelf.service';
import {BookRuleEvaluatorService} from '../../../magic-shelf/service/book-rule-evaluator.service';
import {GroupRule} from '../../../magic-shelf/component/magic-shelf-component';
import {DialogLauncherService} from '../../../../shared/services/dialog-launcher.service';
import {SortService} from '../../../book/service/sort.service';
import {PageTitleService} from "../../../../shared/service/page-title.service";
import {SortDirection, SortOption} from '../../../book/model/sort.model';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';

const DASHBOARD_GRID_GAP_PX = 20;
const DASHBOARD_PANEL_HORIZONTAL_PADDING_PX = 64;
const DASHBOARD_BOOK_CARD_WIDTH_PX = 124;
const DASHBOARD_SQUARE_CARD_WIDTH_PX = 160;
const DASHBOARD_BOOK_CARD_WIDTH_MOBILE_PX = 108;
const DASHBOARD_SQUARE_CARD_WIDTH_MOBILE_PX = 150;
const DASHBOARD_CARD_GAP_PX = 32;

@Component({
  selector: 'app-main-dashboard',
  templateUrl: './main-dashboard.component.html',
  styleUrls: ['./main-dashboard.component.scss'],
  imports: [
    Button,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    DashboardScrollerComponent,
    AsyncPipe,
    ProgressSpinner,
    TooltipModule,
    TranslocoDirective
  ],
  standalone: true
})
export class MainDashboardComponent implements OnInit, OnDestroy {

  @ViewChild('dashboardGrid')
  set dashboardGridRef(ref: ElementRef<HTMLElement> | undefined) {
    this.attachDashboardGrid(ref?.nativeElement);
  }

  private bookService = inject(BookService);
  private dialogLauncher = inject(DialogLauncherService);
  protected userService = inject(UserService);
  private dashboardConfigService = inject(DashboardConfigService);
  private magicShelfService = inject(MagicShelfService);
  private ruleEvaluatorService = inject(BookRuleEvaluatorService);
  private sortService = inject(SortService);
  private pageTitle = inject(PageTitleService);
  private libraryService = inject(LibraryService);
  private destroyRef = inject(DestroyRef);
  private readonly t = inject(TranslocoService);

  bookState$ = this.bookService.bookState$;
  dashboardConfig$ = this.dashboardConfigService.config$;

  private scrollerBooksCache = new Map<string, Observable<Book[]>>();
  private resizeObserver?: ResizeObserver;
  private currentConfig = cloneDashboardConfig(DEFAULT_DASHBOARD_CONFIG);
  private dashboardGridElement?: HTMLElement;

  workspaceWidth = 1200;
  gridColumns = MAX_DASHBOARD_GRID_COLUMNS;

  isLibrariesEmpty$: Observable<boolean> = this.libraryService.libraryState$.pipe(
    map(state => !state.libraries || state.libraries.length === 0)
  );

  ScrollerType = ScrollerType;

  ngOnInit(): void {
    this.pageTitle.setPageTitle(this.t.translate('dashboard.main.pageTitle'));

    this.dashboardConfig$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(config => {
        this.currentConfig = cloneDashboardConfig(config);
        this.scrollerBooksCache.clear();
      });

    this.magicShelfService.shelvesState$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.scrollerBooksCache.clear();
      });
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private attachDashboardGrid(element?: HTMLElement): void {
    this.dashboardGridElement = element;
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;

    if (!element) {
      return;
    }

    this.refreshWorkspaceMetrics();

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        if (this.dashboardGridElement === element) {
          this.refreshWorkspaceMetrics();
        }
      });
    }

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    this.resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      this.updateWorkspaceMetrics(entry.contentRect.width);
    });
    this.resizeObserver.observe(element);
  }

  private refreshWorkspaceMetrics(): void {
    if (!this.dashboardGridElement) {
      return;
    }

    this.updateWorkspaceMetrics(this.dashboardGridElement.clientWidth);
  }

  private updateWorkspaceMetrics(width: number): void {
    this.workspaceWidth = width;
    this.gridColumns = this.resolveGridColumns(width);
  }

  private resolveGridColumns(width: number): number {
    if (width < 640) {
      return 4;
    }

    if (width < 900) {
      return 6;
    }

    if (width < 1200) {
      return 8;
    }

    if (width < 1500) {
      return 10;
    }

    return MAX_DASHBOARD_GRID_COLUMNS;
  }

  private filterBooksByLibrary(books: Book[], libraryId: number | null | undefined): Book[] {
    if (libraryId == null) {
      return books;
    }

    return books.filter(book => book.libraryId === libraryId);
  }

  private getLastReadBooks(maxItems: number, libraryId: number | null, _sortBy?: string): Observable<Book[]> {
    return this.bookService.bookState$.pipe(
      map((state: BookState) => {
        let books = (state.books || []).filter(book =>
          book.lastReadTime &&
          (book.readStatus === ReadStatus.READING || book.readStatus === ReadStatus.RE_READING || book.readStatus === ReadStatus.PAUSED) &&
          this.hasEbookProgress(book)
        );
        books = this.filterBooksByLibrary(books, libraryId);
        books = books.sort((a, b) => {
          const aTime = new Date(a.lastReadTime!).getTime();
          const bTime = new Date(b.lastReadTime!).getTime();
          return bTime - aTime;
        });
        return books.slice(0, maxItems);
      })
    );
  }

  private getLastListenedBooks(maxItems: number, libraryId: number | null): Observable<Book[]> {
    return this.bookService.bookState$.pipe(
      map((state: BookState) => {
        let books = (state.books || []).filter(book =>
          book.lastReadTime &&
          (book.readStatus === ReadStatus.READING || book.readStatus === ReadStatus.RE_READING || book.readStatus === ReadStatus.PAUSED) &&
          book.audiobookProgress
        );
        books = this.filterBooksByLibrary(books, libraryId);
        books = books.sort((a, b) => {
          const aTime = new Date(a.lastReadTime!).getTime();
          const bTime = new Date(b.lastReadTime!).getTime();
          return bTime - aTime;
        });
        return books.slice(0, maxItems);
      })
    );
  }

  private hasEbookProgress(book: Book): boolean {
    return !!(book.epubProgress || book.pdfProgress || book.cbxProgress || book.koreaderProgress || book.koboProgress);
  }

  private getLatestAddedBooks(maxItems: number, libraryId: number | null, _sortBy?: string): Observable<Book[]> {
    return this.bookService.bookState$.pipe(
      map((state: BookState) => {
        let books = (state.books || []).filter(book => book.addedOn);
        books = this.filterBooksByLibrary(books, libraryId);

        books = books.sort((a, b) => {
          const aTime = new Date(a.addedOn!).getTime();
          const bTime = new Date(b.addedOn!).getTime();
          return bTime - aTime;
        });

        return books.slice(0, maxItems);
      })
    );
  }

  private getRandomBooks(maxItems: number, libraryId: number | null, _sortBy?: string): Observable<Book[]> {
    return this.bookService.bookState$.pipe(
      map((state: BookState) => {
        const excludedStatuses = new Set<ReadStatus>([
          ReadStatus.READ,
          ReadStatus.PARTIALLY_READ,
          ReadStatus.READING,
          ReadStatus.PAUSED,
          ReadStatus.WONT_READ,
          ReadStatus.ABANDONED
        ]);

        const candidates = (state.books || []).filter(book =>
          !book.readStatus || !excludedStatuses.has(book.readStatus)
        );

        const filteredCandidates = this.filterBooksByLibrary(candidates, libraryId);

        return this.shuffleBooks(filteredCandidates, maxItems);
      })
    );
  }

  private getMagicShelfBooks(shelfId: number, libraryId: number | null, maxItems?: number, _sortBy?: string): Observable<Book[]> {
    return this.magicShelfService.getShelf(shelfId).pipe(
      switchMap((shelf) => {
        if (!shelf) return this.bookService.bookState$.pipe(map(() => []));

        let group: GroupRule;
        try {
          group = JSON.parse(shelf.filterJson);
        } catch (e) {
          console.error('Invalid filter JSON', e);
          return this.bookService.bookState$.pipe(map(() => []));
        }

        return this.bookService.bookState$.pipe(
          map((state: BookState) => {
            const allBooks = state.books || [];
            const filteredBooks = allBooks.filter((book) =>
              this.ruleEvaluatorService.evaluateGroup(book, group, allBooks)
            );

            const libraryFilteredBooks = this.filterBooksByLibrary(filteredBooks, libraryId);

            return maxItems ? libraryFilteredBooks.slice(0, maxItems) : libraryFilteredBooks;
          })
        );
      })
    );
  }

  private getCurrentlyReadingBooks(maxItems: number, libraryId: number | null): Observable<Book[]> {
    return this.bookService.bookState$.pipe(
      map((state: BookState) => {
        let books = (state.books || []).filter(book =>
          book.isCurrentlyReading === true
        );
        books = this.filterBooksByLibrary(books, libraryId);
        books = books.sort((a, b) => {
          const aTime = new Date(a.addedOn || '').getTime();
          const bTime = new Date(b.addedOn || '').getTime();
          return bTime - aTime;
        });
        return books.slice(0, maxItems);
      })
    );
  }

  getBooksForScroller(config: ScrollerConfig): Observable<Book[]> {
    if (!this.scrollerBooksCache.has(config.id)) {
      let books$: Observable<Book[]>;

      switch (config.type) {
        case ScrollerType.LAST_READ:
          books$ = this.getLastReadBooks(config.maxItems || DEFAULT_MAX_ITEMS, config.libraryId ?? null);
          break;
        case ScrollerType.LAST_LISTENED:
          books$ = this.getLastListenedBooks(config.maxItems || DEFAULT_MAX_ITEMS, config.libraryId ?? null);
          break;
        case ScrollerType.LATEST_ADDED:
          books$ = this.getLatestAddedBooks(config.maxItems || DEFAULT_MAX_ITEMS, config.libraryId ?? null);
          break;
        case ScrollerType.RANDOM:
          books$ = this.getRandomBooks(config.maxItems || DEFAULT_MAX_ITEMS, config.libraryId ?? null);
          break;
        case ScrollerType.MAGIC_SHELF:
          books$ = this.getMagicShelfBooks(config.magicShelfId!, config.libraryId ?? null, config.maxItems).pipe(
            map(books => {
              if (config.sortField && config.sortDirection) {
                const sortOption = this.createSortOption(config.sortField, config.sortDirection);
                return this.sortService.applySort(books, sortOption);
              }
              return books;
            })
          );
          break;
        case ScrollerType.CURRENTLY_READING:
          books$ = this.getCurrentlyReadingBooks(config.maxItems || DEFAULT_MAX_ITEMS, config.libraryId ?? null);
          break;
        default:
          books$ = this.bookService.bookState$.pipe(map(() => []));
      }

      this.scrollerBooksCache.set(config.id, books$.pipe(shareReplay(1)));
    }

    return this.scrollerBooksCache.get(config.id)!;
  }

  getEnabledScrollers(config: DashboardConfig): ScrollerConfig[] {
    return [...config.scrollers]
      .filter(scroller => scroller.enabled)
      .sort((a, b) => a.order - b.order);
  }

  getScrollerDisplayTitle(config: ScrollerConfig): string {
    const baseTitle = config.type === ScrollerType.MAGIC_SHELF
      ? config.title || this.t.translate('dashboard.scroller.magicShelf')
      : this.t.translate(getDefaultScrollerTitleKey(config.type));
    const libraryName = config.libraryId != null
      ? this.libraryService.findLibraryById(config.libraryId)?.name ?? ''
      : '';

    return libraryName ? `${baseTitle}: ${libraryName}` : baseTitle;
  }

  getScrollerColumnSpan(config: ScrollerConfig): number {
    const activeGridColumns = this.getActiveGridColumns();

    if (config.columnSpan != null) {
      return Math.max(1, Math.min(config.columnSpan, activeGridColumns));
    }

    return this.getAutomaticScrollerColumnSpan(config);
  }

  getScrollerPanelWidth(config: ScrollerConfig): number {
    return this.getGridSpanWidth(this.getScrollerColumnSpan(config));
  }

  private getAutomaticScrollerColumnSpan(config: ScrollerConfig): number {
    const contentWidth = this.getAutomaticScrollerContentWidth(config);
    const cellWidth = this.getGridCellWidth();
    const span = Math.ceil(contentWidth / Math.max(cellWidth, 1));

    return Math.max(2, Math.min(span, this.getActiveGridColumns()));
  }

  private getAutomaticScrollerContentWidth(config: ScrollerConfig): number {
    const visibleItems = Math.max(1, Math.min(config.maxItems || DEFAULT_MAX_ITEMS, 8));
    const cardWidth = this.getScrollerCardWidth(config);

    return (visibleItems * cardWidth)
      + (Math.max(visibleItems - 1, 0) * DASHBOARD_CARD_GAP_PX)
      + DASHBOARD_PANEL_HORIZONTAL_PADDING_PX;
  }

  private getGridSpanWidth(span: number): number {
    const safeSpan = Math.max(1, Math.min(span, this.getActiveGridColumns()));

    return (safeSpan * this.getGridCellWidth()) + (Math.max(safeSpan - 1, 0) * DASHBOARD_GRID_GAP_PX);
  }

  private getGridCellWidth(): number {
    const availableWidth = Math.max(this.workspaceWidth, 640);
    const activeGridColumns = this.getActiveGridColumns();

    return (availableWidth - (Math.max(activeGridColumns - 1, 0) * DASHBOARD_GRID_GAP_PX)) / activeGridColumns;
  }

  private getActiveGridColumns(): number {
    return Math.max(this.gridColumns || MAX_DASHBOARD_GRID_COLUMNS, 1);
  }

  private getScrollerCardWidth(config: ScrollerConfig): number {
    const isCompactLayout = this.workspaceWidth < 768;

    return config.type === ScrollerType.LAST_LISTENED
      ? (isCompactLayout ? DASHBOARD_SQUARE_CARD_WIDTH_MOBILE_PX : DASHBOARD_SQUARE_CARD_WIDTH_PX)
      : (isCompactLayout ? DASHBOARD_BOOK_CARD_WIDTH_MOBILE_PX : DASHBOARD_BOOK_CARD_WIDTH_PX);
  }

  onDashboardDrop(event: CdkDragDrop<ScrollerConfig[]>, config: DashboardConfig): void {
    if (config.layoutLocked || event.previousIndex === event.currentIndex) {
      return;
    }

    const enabledScrollers = this.getEnabledScrollers(config).map(scroller => ({...scroller}));
    moveItemInArray(enabledScrollers, event.previousIndex, event.currentIndex);

    const disabledScrollers = [...config.scrollers]
      .filter(scroller => !scroller.enabled)
      .sort((a, b) => a.order - b.order)
      .map(scroller => ({...scroller}));

    const reordered = [...enabledScrollers, ...disabledScrollers].map((scroller, index) => ({
      ...scroller,
      order: index + 1
    }));

    this.dashboardConfigService.saveConfig({...config, scrollers: reordered});
  }

  private createSortOption(field: string, direction: string): SortOption {
    return {
      field: field,
      direction: direction === 'asc' ? SortDirection.ASCENDING : SortDirection.DESCENDING,
      label: ''
    };
  }

  private shuffleBooks(books: Book[], maxItems: number): Book[] {
    const shuffled = [...books];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, maxItems);
  }

  openDashboardSettings(): void {
    this.dialogLauncher.openDashboardSettingsDialog();
  }

  createNewLibrary() {
    this.dialogLauncher.openLibraryCreateDialog();
  }
}
