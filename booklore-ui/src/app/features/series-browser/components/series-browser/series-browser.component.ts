import {
  AfterViewInit,
  ChangeDetectionStrategy,
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
import {BehaviorSubject, combineLatest, Observable, Subscription} from 'rxjs';
import {map} from 'rxjs/operators';
import {ProgressSpinner} from 'primeng/progressspinner';
import {InputText} from 'primeng/inputtext';
import {Select} from 'primeng/select';
import {Slider} from 'primeng/slider';
import {Popover} from 'primeng/popover';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {injectVirtualGrid} from '../../../../shared/util/virtual-grid.util';
import {SeriesDataService} from '../../service/series-data.service';
import {SeriesSummary} from '../../model/series.model';
import {SeriesCardComponent} from '../series-card/series-card.component';
import {BookService} from '../../../book/service/book.service';
import {ReadStatus} from '../../../book/model/book.model';
import {PageTitleService} from '../../../../shared/service/page-title.service';
import {SeriesScalePreferenceService} from '../../service/series-scale-preference.service';
import {Router} from '@angular/router';
import {naturalCompareStrings} from '../../../../shared/util/natural-sort.util';
import {MobileUxService} from '../../../../core/services/mobile-ux.service';

interface FilterOption {
  label: string;
  value: string;
}

interface SortOption {
  label: string;
  value: string;
}

@Component({
  selector: 'app-series-browser',
  standalone: true,
  templateUrl: './series-browser.component.html',
  styleUrls: ['./series-browser.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe,
    FormsModule,
    ProgressSpinner,
    InputText,
    Select,
    Slider,
    Popover,
    TranslocoDirective,
    SeriesCardComponent,
  ]
})
export class SeriesBrowserComponent implements OnInit, AfterViewInit, OnDestroy {

  private static readonly BASE_WIDTH = 230;
  private static readonly BASE_HEIGHT = 285;
  private static readonly MOBILE_BASE_WIDTH = 180;
  private static readonly MOBILE_BASE_HEIGHT = 250;
  private readonly GRID_GAP_MOBILE = 8;
  private readonly GRID_GAP_DESKTOP = 20;

  private seriesDataService = inject(SeriesDataService);
  private bookService = inject(BookService);
  private pageTitle = inject(PageTitleService);
  private t = inject(TranslocoService);
  private router = inject(Router);
  protected seriesScaleService = inject(SeriesScalePreferenceService);
  private mobileUx = inject(MobileUxService);

  bookState$ = this.bookService.bookState$;

  screenWidth = window.innerWidth;

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

  private gridSub?: Subscription;
  private resizeSub?: Subscription;

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
      ? SeriesBrowserComponent.MOBILE_BASE_WIDTH
      : SeriesBrowserComponent.BASE_WIDTH;
    return Math.round(base * this.seriesScaleService.scaleFactor);
  }

  get cardHeight(): number {
    const base = this.isMobile
      ? SeriesBrowserComponent.MOBILE_BASE_HEIGHT
      : SeriesBrowserComponent.BASE_HEIGHT;
    return Math.round(base * this.seriesScaleService.scaleFactor);
  }

  get gridColumnMinWidth(): string {
    return `${this.cardWidth}px`;
  }

  // Search and filter state
  searchTerm$ = new BehaviorSubject<string>('');
  statusFilter$ = new BehaviorSubject<string>('all');
  sortBy$ = new BehaviorSubject<string>('name-asc');

  filterOptions: FilterOption[] = [];
  sortOptions: SortOption[] = [];

  // Filtered grid
  filteredSeries$!: Observable<SeriesSummary[]>;

  ngOnInit(): void {
    this.pageTitle.setPageTitle(this.t.translate('seriesBrowser.pageTitle'));

    this.filterOptions = [
      {label: this.t.translate('seriesBrowser.filters.all'), value: 'all'},
      {label: this.t.translate('seriesBrowser.filters.notStarted'), value: 'not-started'},
      {label: this.t.translate('seriesBrowser.filters.inProgress'), value: 'in-progress'},
      {label: this.t.translate('seriesBrowser.filters.completed'), value: 'completed'},
      {label: this.t.translate('seriesBrowser.filters.abandoned'), value: 'abandoned'}
    ];

    this.sortOptions = [
      {label: this.t.translate('seriesBrowser.sort.nameAsc'), value: 'name-asc'},
      {label: this.t.translate('seriesBrowser.sort.nameDesc'), value: 'name-desc'},
      {label: this.t.translate('seriesBrowser.sort.bookCount'), value: 'book-count'},
      {label: this.t.translate('seriesBrowser.sort.progress'), value: 'progress'},
      {label: this.t.translate('seriesBrowser.sort.recentlyRead'), value: 'recently-read'},
      {label: this.t.translate('seriesBrowser.sort.recentlyAdded'), value: 'recently-added'}
    ];

    this.filteredSeries$ = combineLatest([
      this.seriesDataService.allSeries$,
      this.searchTerm$,
      this.statusFilter$,
      this.sortBy$
    ]).pipe(
      map(([allSeries, search, statusFilter, sortBy]) => {
        let result = allSeries;

        if (search.trim()) {
          const term = search.trim().toLowerCase();
          result = result.filter(s =>
            s.seriesName.toLowerCase().includes(term) ||
            s.authors.some(a => a.toLowerCase().includes(term))
          );
        }

        result = this.applyStatusFilter(result, statusFilter);
        result = this.applySort(result, sortBy);

        return result;
      })
    );

    this.gridSub = this.filteredSeries$.subscribe(series => {
      this.gridItemCountSig.set(series.length);
      this.cardWidthSig.set(this.cardWidth);
      this.cardHeightSig.set(this.cardHeight);
      this.gapSig.set(this.isMobile ? this.GRID_GAP_MOBILE : this.GRID_GAP_DESKTOP);
      queueMicrotask(() => this.updateVirtualGridDomBindings());
    });

    this.resizeSub = this.mobileUx.screenWidth$.subscribe(width => {
      this.screenWidth = width;
      this.cardWidthSig.set(this.cardWidth);
      this.cardHeightSig.set(this.cardHeight);
      this.gapSig.set(this.isMobile ? this.GRID_GAP_MOBILE : this.GRID_GAP_DESKTOP);
      this.updateVirtualGridDomBindings();
    });
  }

  ngAfterViewInit(): void {
    this.updateVirtualGridDomBindings();
  }

  ngOnDestroy(): void {
    this.gridSub?.unsubscribe();
    this.resizeSub?.unsubscribe();
  }

  onSearchChange(value: string): void {
    this.searchTerm$.next(value);
  }

  onStatusFilterChange(value: string): void {
    this.statusFilter$.next(value);
  }

  onSortChange(value: string): void {
    this.sortBy$.next(value);
  }

  updateScale(): void {
    this.seriesScaleService.setScale(this.seriesScaleService.scaleFactor);
    this.cardWidthSig.set(this.cardWidth);
    this.cardHeightSig.set(this.cardHeight);
    queueMicrotask(() => this.updateVirtualGridDomBindings());
  }

  navigateToSeries(series: SeriesSummary): void {
    this.router.navigate(['/series', series.seriesName]);
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

  private applyStatusFilter(series: SeriesSummary[], filterValue: string): SeriesSummary[] {
    switch (filterValue) {
      case 'not-started':
        return series.filter(s => s.seriesStatus === ReadStatus.UNREAD);
      case 'in-progress':
        return series.filter(s =>
          s.seriesStatus === ReadStatus.READING ||
          s.seriesStatus === ReadStatus.PARTIALLY_READ
        );
      case 'completed':
        return series.filter(s => s.seriesStatus === ReadStatus.READ);
      case 'abandoned':
        return series.filter(s =>
          s.seriesStatus === ReadStatus.ABANDONED ||
          s.seriesStatus === ReadStatus.WONT_READ
        );
      default:
        return series;
    }
  }

  private applySort(series: SeriesSummary[], sortBy: string): SeriesSummary[] {
    const sorted = [...series];
    switch (sortBy) {
      case 'name-asc':
        return sorted.sort((a, b) => naturalCompareStrings(a.seriesName, b.seriesName));
      case 'name-desc':
        return sorted.sort((a, b) => naturalCompareStrings(b.seriesName, a.seriesName));
      case 'book-count':
        return sorted.sort((a, b) => b.bookCount - a.bookCount);
      case 'progress':
        return sorted.sort((a, b) => b.progress - a.progress);
      case 'recently-read':
        return sorted.sort((a, b) => {
          const aTime = a.lastReadTime ? new Date(a.lastReadTime).getTime() : 0;
          const bTime = b.lastReadTime ? new Date(b.lastReadTime).getTime() : 0;
          return bTime - aTime;
        });
      case 'recently-added':
        return sorted.sort((a, b) => {
          const aTime = a.addedOn ? new Date(a.addedOn).getTime() : 0;
          const bTime = b.addedOn ? new Date(b.addedOn).getTime() : 0;
          return bTime - aTime;
        });
      default:
        return sorted;
    }
  }
}
