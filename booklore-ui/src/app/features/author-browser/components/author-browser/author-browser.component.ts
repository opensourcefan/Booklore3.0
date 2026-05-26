import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild
} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {combineLatest, Observable, BehaviorSubject, Subscription} from 'rxjs';
import {filter, map} from 'rxjs/operators';
import {ProgressSpinner} from 'primeng/progressspinner';
import {InputText} from 'primeng/inputtext';
import {Select} from 'primeng/select';
import {Slider} from 'primeng/slider';
import {Popover} from 'primeng/popover';
import {Button} from 'primeng/button';

import {Tooltip} from 'primeng/tooltip';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {injectVirtualGrid} from '../../../../shared/util/virtual-grid.util';
import {BookBrowserScrollService} from '../../../book/components/book-browser/book-browser-scroll.service';
import {MessageService} from 'primeng/api';
import {AuthorService} from '../../service/author.service';
import {AuthorSummary, EnrichedAuthor, AuthorFilters, NameQuality, DEFAULT_AUTHOR_FILTERS} from '../../model/author.model';
import {AuthorCardComponent} from '../author-card/author-card.component';
import {AuthorScalePreferenceService} from '../../service/author-scale-preference.service';
import {AuthorSelectionService, AuthorCheckboxClickEvent} from '../../service/author-selection.service';
import {PageTitleService} from '../../../../shared/service/page-title.service';
import {ActivatedRoute, NavigationStart, Router} from '@angular/router';
import {UserService} from '../../../settings/user-management/user.service';
import {BookService} from '../../../book/service/book.service';
import {Book, ReadStatus} from '../../../book/model/book.model';
import {MobileUxService} from '../../../../core/services/mobile-ux.service';
import {LocalStorageService} from '../../../../shared/service/local-storage.service';

type SortDirection = 'asc' | 'desc';

interface SortOption {
  label: string;
  value: string;
}

interface FilterOption {
  label: string;
  value: string;
}

const DEFAULT_SORT_DIRECTIONS: Record<string, SortDirection> = {
  'name': 'asc',
  'book-count': 'desc',
  'matched': 'desc',
  'recently-added': 'desc',
  'recently-read': 'desc',
  'reading-progress': 'desc',
  'avg-rating': 'desc',
  'photo': 'desc',
  'series-count': 'desc'
};

@Component({
  selector: 'app-author-browser',
  standalone: true,
  templateUrl: './author-browser.component.html',
  styleUrls: ['./author-browser.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe,
    FormsModule,
    ProgressSpinner,
    InputText,
    Select,
    Slider,
    Popover,
    Button,
    Tooltip,
    TranslocoDirective,
    AuthorCardComponent,
  ]
})
export class AuthorBrowserComponent implements OnInit, AfterViewInit, OnDestroy {

  private static readonly BASE_WIDTH = 165;
  private static readonly BASE_HEIGHT = 290;
  private static readonly MOBILE_BASE_WIDTH = 140;
  private static readonly MOBILE_BASE_HEIGHT = 250;
  private readonly GRID_GAP_MOBILE = 8;
  private readonly GRID_GAP_DESKTOP = 20;

  private authorService = inject(AuthorService);
  private bookService = inject(BookService);
  private messageService = inject(MessageService);
  private pageTitle = inject(PageTitleService);
  private scrollService = inject(BookBrowserScrollService);
  private t = inject(TranslocoService);
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);
  protected userService = inject(UserService);
  protected authorScaleService = inject(AuthorScalePreferenceService);
  private cdr = inject(ChangeDetectorRef);
  protected selectionService = inject(AuthorSelectionService);
  private mobileUx = inject(MobileUxService);
  private localStorage = inject(LocalStorageService);
  private readonly STORAGE_KEY = 'authorBrowserState';

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

  private subscriptions: Subscription[] = [];

  loading = true;
  private authorsLoaded = false;
  private booksLoaded = false;
  screenWidth = window.innerWidth;
  selectedCount = 0;
  isCheckboxEnabled = false;
  thumbnailCacheBusters = new Map<number, number>();

  private readonly gridItemCountSig = signal(0);
  private readonly cardWidthSig = signal(this.cardWidth);
  private readonly cardHeightSig = signal(this.cardHeight);
  private readonly gapSig = signal(this.isMobile ? this.GRID_GAP_MOBILE : this.GRID_GAP_DESKTOP);

  readonly virtualGrid = injectVirtualGrid(() => ({
    itemCount: this.gridItemCountSig(),
    cardWidth: this.cardWidthSig(),
    cardHeight: this.cardHeightSig(),
    gap: this.gapSig(),
    overscan: 5,
  }));

  get isMobile(): boolean {
    return this.screenWidth <= 767;
  }

  get cardWidth(): number {
    const base = this.isMobile
      ? AuthorBrowserComponent.MOBILE_BASE_WIDTH
      : AuthorBrowserComponent.BASE_WIDTH;
    return Math.round(base * this.authorScaleService.scaleFactor);
  }

  get cardHeight(): number {
    const base = this.isMobile
      ? AuthorBrowserComponent.MOBILE_BASE_HEIGHT
      : AuthorBrowserComponent.BASE_HEIGHT;
    return Math.round(base * this.authorScaleService.scaleFactor);
  }

  get gridColumnMinWidth(): string {
    return `${this.cardWidth}px`;
  }

  searchTerm$ = new BehaviorSubject<string>('');
  sortBy$ = new BehaviorSubject<string>('name');
  sortDirection$ = new BehaviorSubject<SortDirection>('asc');
  allAuthors$ = new BehaviorSubject<AuthorSummary[]>([]);
  filters$ = new BehaviorSubject<AuthorFilters>({...DEFAULT_AUTHOR_FILTERS});

  sortOptions: SortOption[] = [];
  libraryOptions: FilterOption[] = [];
  genreOptions: FilterOption[] = [];
  nameQualityOptions: FilterOption[] = [];
  activeFilterCount = 0;

  private readonly validSortValues = [
    'name', 'book-count', 'matched', 'recently-added', 'recently-read',
    'reading-progress', 'avg-rating', 'photo', 'series-count'
  ];

  filteredAuthors$!: Observable<EnrichedAuthor[]>;
  private enrichedAuthors$ = new BehaviorSubject<EnrichedAuthor[]>([]);

  ngOnInit(): void {
    this.pageTitle.setPageTitle(this.t.translate('authorBrowser.pageTitle'));

    this.nameQualityOptions = [
      {label: this.t.translate('authorBrowser.filters.all'), value: 'all'},
      {label: this.t.translate('authorBrowser.filters.nameQualityValid'), value: 'valid'},
      {label: this.t.translate('authorBrowser.filters.nameQualityInitials'), value: 'initials'},
      {label: this.t.translate('authorBrowser.filters.nameQualitySymbols'), value: 'symbols'},
      {label: this.t.translate('authorBrowser.filters.nameQualityYears'), value: 'years'},
      {label: this.t.translate('authorBrowser.filters.nameQualitySingleChar'), value: 'single-char'},
      {label: this.t.translate('authorBrowser.filters.nameQualityNumeric'), value: 'numeric'}
    ];

    this.sortOptions = [
      {label: this.t.translate('authorBrowser.sort.name'), value: 'name'},
      {label: this.t.translate('authorBrowser.sort.bookCount'), value: 'book-count'},
      {label: this.t.translate('authorBrowser.sort.matched'), value: 'matched'},
      {label: this.t.translate('authorBrowser.sort.recentlyAdded'), value: 'recently-added'},
      {label: this.t.translate('authorBrowser.sort.recentlyRead'), value: 'recently-read'},
      {label: this.t.translate('authorBrowser.sort.readingProgress'), value: 'reading-progress'},
      {label: this.t.translate('authorBrowser.sort.avgRating'), value: 'avg-rating'},
      {label: this.t.translate('authorBrowser.sort.photo'), value: 'photo'},
      {label: this.t.translate('authorBrowser.sort.seriesCount'), value: 'series-count'}
    ];

    const sortParam = this.activatedRoute.snapshot.queryParamMap.get('sort');
    const dirParam = this.activatedRoute.snapshot.queryParamMap.get('dir') as SortDirection | null;
    
    // Load from local storage
    const savedState = this.localStorage.get<{
      searchTerm?: string;
      sortBy?: string;
      sortDirection?: SortDirection;
      filters?: AuthorFilters;
    }>(this.STORAGE_KEY);
    
    if (savedState) {
      if (savedState.searchTerm) this.searchTerm$.next(savedState.searchTerm);
      if (savedState.sortBy && this.validSortValues.includes(savedState.sortBy)) this.sortBy$.next(savedState.sortBy);
      if (savedState.sortDirection) this.sortDirection$.next(savedState.sortDirection);
      if (savedState.filters) this.filters$.next({...DEFAULT_AUTHOR_FILTERS, ...savedState.filters});
    }

    if (sortParam && this.validSortValues.includes(sortParam)) {
      this.sortBy$.next(sortParam);
      this.sortDirection$.next(dirParam === 'asc' || dirParam === 'desc' ? dirParam : DEFAULT_SORT_DIRECTIONS[sortParam]);
    }
    
    this.updateActiveFilterCount();

    // Ensure fresh authors are fetched on component init
    this.subscriptions.push(
      this.authorService.getAllAuthors().subscribe()
    );

    this.subscriptions.push(
      this.authorService.allAuthors$.pipe(
        filter((authors): authors is AuthorSummary[] => authors !== null)
      ).subscribe(authors => {
        this.allAuthors$.next(authors);
        this.authorsLoaded = true;
        this.updateLoading();
        this.cdr.markForCheck();
      })
    );

    this.subscriptions.push(
      combineLatest([
        this.allAuthors$,
        this.bookService.bookState$.pipe(
          filter(state => state.loaded && !!state.books),
          map(state => state.books || [])
        )
      ]).subscribe(([authors, books]) => {
        this.booksLoaded = true;
        this.updateLoading();
        const enriched = this.enrichAuthors(authors, books);
        this.updateDynamicFilterOptions(enriched);
        this.enrichedAuthors$.next(enriched);
        this.cdr.markForCheck();
      })
    );

    this.filteredAuthors$ = combineLatest([
      this.enrichedAuthors$,
      this.searchTerm$,
      this.sortBy$,
      this.sortDirection$,
      this.filters$
    ]).pipe(
      map(([enriched, search, sortBy, sortDir, filters]) => {
        // Save state on any change
        this.localStorage.set(this.STORAGE_KEY, {
          searchTerm: search,
          sortBy,
          sortDirection: sortDir,
          filters
        });

        let result = enriched;

        if (search.trim()) {
          const term = search.trim().toLowerCase();
          result = result.filter(a => a.name.toLowerCase().includes(term));
        }

        result = this.applyFilters(result, filters);
        result = this.applySort(result, sortBy, sortDir);
        this.selectionService.setCurrentAuthors(result);
        return result;
      })
    );

    this.subscriptions.push(
      this.selectionService.selectedAuthors$.subscribe(selected => {
        this.selectedCount = selected.size;
        this.isCheckboxEnabled = selected.size > 0;
        this.cdr.markForCheck();
      })
    );

    this.subscriptions.push(
      this.filteredAuthors$.subscribe(authors => {
        this.gridItemCountSig.set(authors.length);
        this.cardWidthSig.set(this.cardWidth);
        this.cardHeightSig.set(this.cardHeight);
        this.gapSig.set(this.isMobile ? this.GRID_GAP_MOBILE : this.GRID_GAP_DESKTOP);
        queueMicrotask(() => this.updateVirtualGridDomBindings());
      })
    );

    this.subscriptions.push(
      this.mobileUx.screenWidth$.subscribe(width => {
        this.screenWidth = width;
        this.cardWidthSig.set(this.cardWidth);
        this.cardHeightSig.set(this.cardHeight);
        this.gapSig.set(this.isMobile ? this.GRID_GAP_MOBILE : this.GRID_GAP_DESKTOP);
        this.updateVirtualGridDomBindings();
      })
    );

    this.setupScrollPositionTracking();
  }

  ngAfterViewInit(): void {
    this.updateVirtualGridDomBindings();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
    this.selectionService.deselectAll();
  }

  onSearchChange(value: string): void {
    this.searchTerm$.next(value);
  }

  onSortChange(value: string): void {
    this.sortBy$.next(value);
    this.sortDirection$.next(DEFAULT_SORT_DIRECTIONS[value] || 'asc');
    this.updateSortQueryParams(value, this.sortDirection$.value);
  }

  toggleSortDirection(): void {
    const next: SortDirection = this.sortDirection$.value === 'asc' ? 'desc' : 'asc';
    this.sortDirection$.next(next);
    this.updateSortQueryParams(this.sortBy$.value, next);
  }

  onFilterChange(key: keyof AuthorFilters, value: string | boolean): void {
    const current = this.filters$.value;
    this.filters$.next({...current, [key]: value});
    this.updateActiveFilterCount();
  }

  toggleHideLowQuality(): void {
    const current = this.filters$.value;
    this.filters$.next({...current, hideLowQuality: !current.hideLowQuality});
    this.updateActiveFilterCount();
  }

  resetFilters(): void {
    this.filters$.next({...DEFAULT_AUTHOR_FILTERS});
    this.activeFilterCount = 0;
  }

  updateScale(): void {
    this.authorScaleService.setScale(this.authorScaleService.scaleFactor);
    this.cardWidthSig.set(this.cardWidth);
    this.cardHeightSig.set(this.cardHeight);
    queueMicrotask(() => this.updateVirtualGridDomBindings());
  }

  get canEditMetadata(): boolean {
    const user = this.userService.getCurrentUser();
    return !!user?.permissions?.admin || !!user?.permissions?.canEditMetadata;
  }

  get canDeleteBook(): boolean {
    const user = this.userService.getCurrentUser();
    return !!user?.permissions?.admin || !!user?.permissions?.canDeleteBook;
  }

  isAuthorSelected(authorId: number): boolean {
    return this.selectionService.selectedAuthors.has(authorId);
  }

  onCheckboxClicked(event: AuthorCheckboxClickEvent): void {
    this.selectionService.handleCheckboxClick(event);
  }

  selectAllAuthors(): void {
    this.selectionService.selectAll();
  }

  deselectAllAuthors(): void {
    this.selectionService.deselectAll();
  }

  navigateToAuthor(author: AuthorSummary): void {
    this.router.navigate(['/author', author.id]);
  }

  navigateToAuthorEdit(author: AuthorSummary): void {
    this.router.navigate(['/author', author.id], {queryParams: {tab: 'edit'}});
  }

  deleteAuthor(author: AuthorSummary): void {
    this.authorService.deleteAuthors([author.id]).subscribe({
      next: () => {
        this.removeAuthorsFromList([author.id]);
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('authorBrowser.toast.deleteSuccessSummary'),
          detail: this.t.translate('authorBrowser.toast.deleteSuccessDetail')
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('authorBrowser.toast.deleteFailedSummary'),
          detail: this.t.translate('authorBrowser.toast.deleteFailedDetail')
        });
      }
    });
  }

  onAuthorQuickMatched(updated: AuthorSummary): void {
    this.thumbnailCacheBusters.set(updated.id, Date.now());
    const current = this.allAuthors$.value;
    const updatedList = current.map(a => a.id === updated.id ? updated : a);
    this.allAuthors$.next(updatedList);
  }

  autoMatchSelected(): void {
    const ids = this.selectionService.getSelectedIds();
    this.selectionService.deselectAll();
    this.authorService.autoMatchAuthors(ids).subscribe({
      next: (matched) => {
        this.thumbnailCacheBusters.set(matched.id, Date.now());
        const current = this.allAuthors$.value;
        this.allAuthors$.next(current.map(a => a.id === matched.id
          ? {...a, asin: matched.asin, hasPhoto: matched.hasPhoto}
          : a
        ));
      },
      complete: () => {
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('authorBrowser.toast.autoMatchSuccessSummary'),
          detail: this.t.translate('authorBrowser.toast.autoMatchSuccessDetail')
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('authorBrowser.toast.autoMatchFailedSummary'),
          detail: this.t.translate('authorBrowser.toast.autoMatchFailedDetail')
        });
      }
    });
  }

  deleteSelected(): void {
    const ids = this.selectionService.getSelectedIds();
    this.authorService.deleteAuthors(ids).subscribe({
      next: () => {
        this.selectionService.deselectAll();
        this.removeAuthorsFromList(ids);
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('authorBrowser.toast.deleteSelectedSuccessSummary'),
          detail: this.t.translate('authorBrowser.toast.deleteSelectedSuccessDetail')
        });
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('authorBrowser.toast.deleteFailedSummary'),
          detail: this.t.translate('authorBrowser.toast.deleteFailedDetail')
        });
      }
    });
  }

  private updateSortQueryParams(sort: string, dir: SortDirection): void {
    this.router.navigate([], {
      queryParams: {sort, dir},
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  private updateLoading(): void {
    this.loading = !this.authorsLoaded || !this.booksLoaded;
  }

  private updateActiveFilterCount(): void {
    const f = this.filters$.value;
    let count = 0;
    if (f.matchStatus !== 'all') count++;
    if (f.photoStatus !== 'all') count++;
    if (f.readStatus !== 'all') count++;
    if (f.bookCount !== 'all') count++;
    if (f.library !== 'all') count++;
    if (f.genre !== 'all') count++;
    if (f.nameQuality !== 'all') count++;
    if (f.hideLowQuality) count++;
    this.activeFilterCount = count;
  }

  private updateDynamicFilterOptions(authors: EnrichedAuthor[]): void {
    const allLabel = this.t.translate('authorBrowser.filters.all');

    const librarySet = new Set<string>();
    const genreSet = new Set<string>();
    for (const a of authors) {
      for (const lib of a.libraryNames) librarySet.add(lib);
      for (const cat of a.categories) genreSet.add(cat);
    }

    this.libraryOptions = [
      {label: allLabel, value: 'all'},
      ...[...librarySet].sort().map(lib => ({label: lib, value: lib}))
    ];

    this.genreOptions = [
      {label: allLabel, value: 'all'},
      ...[...genreSet].sort().map(cat => ({label: cat, value: cat}))
    ];
  }

  private enrichAuthors(authors: AuthorSummary[], books: Book[]): EnrichedAuthor[] {
    const booksByAuthor = new Map<string, Book[]>();
    for (const book of books) {
      if (book.metadata?.authors) {
        for (const authorName of book.metadata.authors) {
          const key = authorName.toLowerCase();
          let list = booksByAuthor.get(key);
          if (!list) {
            list = [];
            booksByAuthor.set(key, list);
          }
          list.push(book);
        }
      }
    }

    return authors.map(author => {
      const authorBooks = booksByAuthor.get(author.name.toLowerCase()) || [];

      const libraryIds = new Set<number>();
      const libraryNameSet = new Set<string>();
      const categorySet = new Set<string>();
      const seriesSet = new Set<string>();
      let latestAddedOn: string | null = null;
      let lastReadTime: string | null = null;
      let readCount = 0;
      let inProgressCount = 0;
      let ratingSum = 0;
      let ratingCount = 0;

      for (const book of authorBooks) {
        libraryIds.add(book.libraryId);
        if (book.libraryName) libraryNameSet.add(book.libraryName);

        if (book.metadata?.categories) {
          for (const cat of book.metadata.categories) categorySet.add(cat);
        }
        if (book.metadata?.seriesName) {
          seriesSet.add(book.metadata.seriesName.toLowerCase());
        }
        if (book.addedOn && (!latestAddedOn || book.addedOn > latestAddedOn)) {
          latestAddedOn = book.addedOn;
        }
        if (book.lastReadTime && (!lastReadTime || book.lastReadTime > lastReadTime)) {
          lastReadTime = book.lastReadTime;
        }
        if (book.readStatus === ReadStatus.READ) readCount++;
        if (book.readStatus === ReadStatus.READING || book.readStatus === ReadStatus.RE_READING) inProgressCount++;
        if (book.personalRating != null) {
          ratingSum += book.personalRating;
          ratingCount++;
        }
      }

      const totalBooks = authorBooks.length;
      let readStatus: EnrichedAuthor['readStatus'] = 'unread';
      if (totalBooks > 0) {
        if (readCount === totalBooks) {
          readStatus = 'all-read';
        } else if (inProgressCount > 0) {
          readStatus = 'in-progress';
        } else if (readCount > 0) {
          readStatus = 'some-read';
        }
      }

      return {
        ...author,
        libraryIds,
        libraryNames: [...libraryNameSet].sort(),
        categories: [...categorySet].sort(),
        readStatus,
        hasSeries: seriesSet.size > 0,
        seriesCount: seriesSet.size,
        latestAddedOn,
        lastReadTime,
        readingProgress: totalBooks > 0 ? Math.round((readCount / totalBooks) * 100) : 0,
        avgPersonalRating: ratingCount > 0 ? ratingSum / ratingCount : null
      };
    });
  }

  private classifyNameQuality(name: string): NameQuality {
    if (/^[^a-zA-Z0-9\s]+$/.test(name)) return 'symbols';
    if (/^[\w.-]+\.[\w.-]+$/.test(name)) return 'symbols';
    if (/^\d{4}\s*-\s*\d{4}$/.test(name)) return 'years';
    if (/^\d{4}$/.test(name)) return 'years';
    if (/^\d{4}[\s-]/.test(name)) return 'years';
    if (/^[A-Z]\.?[A-Z]?\.?\s*[A-Z]?\.?$/.test(name)) return 'initials';
    if (/^.$/.test(name)) return 'single-char';
    if (/^\d+$/.test(name)) return 'numeric';
    if (/^[a-zA-Z]+\d+.*$/.test(name)) return 'numeric';
    if (/^[A-Za-z]+$/.test(name)) return 'initials';
    if (!/\s/.test(name)) return 'initials';
    return 'valid';
  }

  private isLowQualityName(name: string): boolean {
    const quality = this.classifyNameQuality(name);
    return quality !== 'valid';
  }

  private applyFilters(authors: EnrichedAuthor[], filters: AuthorFilters): EnrichedAuthor[] {
    return authors.filter(a => {
      if (filters.matchStatus === 'matched' && !a.asin) return false;
      if (filters.matchStatus === 'unmatched' && a.asin) return false;

      if (filters.photoStatus === 'has-photo' && !a.hasPhoto) return false;
      if (filters.photoStatus === 'no-photo' && a.hasPhoto) return false;

      if (filters.readStatus !== 'all' && a.readStatus !== filters.readStatus) return false;

      if (filters.bookCount !== 'all') {
        const c = a.bookCount;
        switch (filters.bookCount) {
          case '0': if (c !== 0) return false; break;
          case '1': if (c !== 1) return false; break;
          case '2': if (c !== 2) return false; break;
          case '3': if (c !== 3) return false; break;
          case '4': if (c !== 4) return false; break;
          case '5': if (c !== 5) return false; break;
          case '2+': if (c < 2) return false; break;
          case '6-10': if (c < 6 || c > 10) return false; break;
          case '11-20': if (c < 11 || c > 20) return false; break;
          case '21-35': if (c < 21 || c > 35) return false; break;
          case '36+': if (c < 36) return false; break;
        }
      }

      if (filters.library !== 'all' && !a.libraryNames.includes(filters.library)) return false;
      if (filters.genre !== 'all' && !a.categories.includes(filters.genre)) return false;

      if (filters.nameQuality !== 'all' && this.classifyNameQuality(a.name) !== filters.nameQuality) return false;

      if (filters.hideLowQuality && this.isLowQualityName(a.name)) return false;

      return true;
    });
  }

  private getScrollPositionKey(): string {
    const path = this.activatedRoute.snapshot.routeConfig?.path ?? '';
    return this.scrollService.createKey(path, this.activatedRoute.snapshot.params);
  }

  private setupScrollPositionTracking(): void {
    this.subscriptions.push(
      this.router.events.pipe(
        filter(event => event instanceof NavigationStart)
      ).subscribe(() => {
        this.dismissBodyMenus();
        this.saveScrollPosition();
      })
    );
  }

  private dismissBodyMenus(): void {
    document.querySelectorAll('.p-tieredmenu-overlay').forEach(el => el.remove());
  }

  private saveScrollPosition(): void {
    const el = this.scrollContainer?.nativeElement;
    if (!el) return;
    const key = this.getScrollPositionKey();
    this.scrollService.savePosition(key, el.scrollTop ?? 0);
  }

  private updateVirtualGridDomBindings(): void {
    const scrollEl = this.scrollContainer?.nativeElement ?? null;
    this.virtualGrid.setScrollElement(scrollEl);

    const widthEl = this.gridContainer?.nativeElement ?? scrollEl;
    if (widthEl) {
      queueMicrotask(() => {
        if (widthEl.clientWidth > 0) {
          this.virtualGrid.setContainerWidth(widthEl.clientWidth);
        }
        if (scrollEl) {
          scrollEl.dispatchEvent(new Event('scroll'));
        }
      });
    }
  }

  private removeAuthorsFromList(ids: number[]): void {
    const idSet = new Set(ids);
    const updated = this.allAuthors$.value.filter(a => !idSet.has(a.id));
    this.allAuthors$.next(updated);
  }

  private applySort(authors: EnrichedAuthor[], sortBy: string, direction: SortDirection): EnrichedAuthor[] {
    const sorted = [...authors];
    const dir = direction === 'asc' ? 1 : -1;

    switch (sortBy) {
      case 'name':
        return sorted.sort((a, b) => dir * a.name.localeCompare(b.name));
      case 'book-count':
        return sorted.sort((a, b) => dir * (a.bookCount - b.bookCount));
      case 'matched':
        return sorted.sort((a, b) => {
          const aVal = a.asin ? 1 : 0;
          const bVal = b.asin ? 1 : 0;
          if (aVal !== bVal) return dir * (aVal - bVal);
          return a.name.localeCompare(b.name);
        });
      case 'recently-added':
        return sorted.sort((a, b) => {
          if (!a.latestAddedOn && !b.latestAddedOn) return a.name.localeCompare(b.name);
          if (!a.latestAddedOn) return 1;
          if (!b.latestAddedOn) return -1;
          return dir * a.latestAddedOn.localeCompare(b.latestAddedOn);
        });
      case 'recently-read':
        return sorted.sort((a, b) => {
          if (!a.lastReadTime && !b.lastReadTime) return a.name.localeCompare(b.name);
          if (!a.lastReadTime) return 1;
          if (!b.lastReadTime) return -1;
          return dir * a.lastReadTime.localeCompare(b.lastReadTime);
        });
      case 'reading-progress':
        return sorted.sort((a, b) => dir * (a.readingProgress - b.readingProgress));
      case 'avg-rating':
        return sorted.sort((a, b) => {
          if (a.avgPersonalRating == null && b.avgPersonalRating == null) return a.name.localeCompare(b.name);
          if (a.avgPersonalRating == null) return 1;
          if (b.avgPersonalRating == null) return -1;
          return dir * (a.avgPersonalRating - b.avgPersonalRating);
        });
      case 'photo':
        return sorted.sort((a, b) => {
          const aVal = a.hasPhoto ? 1 : 0;
          const bVal = b.hasPhoto ? 1 : 0;
          if (aVal !== bVal) return dir * (aVal - bVal);
          return a.name.localeCompare(b.name);
        });
      case 'series-count':
        return sorted.sort((a, b) => dir * (a.seriesCount - b.seriesCount));
      default:
        return sorted;
    }
  }
}
