import {ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, inject, Input, OnDestroy, OnInit, Output} from '@angular/core';
import {BehaviorSubject, Observable, of, Subject, takeUntil} from 'rxjs';
import {Library} from '../../../model/library.model';
import {Shelf} from '../../../model/shelf.model';
import {EntityType} from '../book-browser.component';
import {Accordion, AccordionContent, AccordionHeader, AccordionPanel} from 'primeng/accordion';
import {AsyncPipe, NgClass} from '@angular/common';
import {Badge} from 'primeng/badge';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {Tooltip} from 'primeng/tooltip';
import {BookFilterMode, DEFAULT_VISIBLE_FILTERS, UserService, VisibleFilterType} from '../../../../settings/user-management/user.service';
import {MagicShelf} from '../../../../magic-shelf/service/magic-shelf.service';
import {Filter, FILTER_LABEL_KEYS, FilterType, UserFilterSort} from './book-filter.config';
import {BookFilterService} from './book-filter.service';
import {filter} from 'rxjs/operators';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {normalizeFilterMode} from '../filters/sidebar-filter';

interface FilterModeOption {
  label: string;
  value: BookFilterMode;
  tooltip: string;
}

@Component({
  selector: 'app-book-filter',
  templateUrl: './book-filter.component.html',
  styleUrls: ['./book-filter.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    Accordion, AccordionPanel, AccordionHeader, AccordionContent,
    NgClass, Badge, AsyncPipe, FormsModule, Button, Tooltip,
    TranslocoDirective
  ]
})
export class BookFilterComponent implements OnInit, OnDestroy {
  @Input() entity$: Observable<Library | Shelf | MagicShelf | null> | undefined;
  @Input() entityType$: Observable<EntityType> | undefined;
  @Input() resetFilter$!: Subject<void>;
  @Input() showFilter = false;
  @Input() urlFilter$: Observable<Record<string, string[]> | null> | undefined;
  @Input()
  set filterMode(mode: BookFilterMode | null | undefined) {
    const safe = normalizeFilterMode(mode);
    if (safe === this._selectedFilterMode) {
      return;
    }

    this._selectedFilterMode = safe;
    this.filterMode$.next(safe);
  }

  @Output() filterSelected = new EventEmitter<Record<string, string[]> | null>();
  @Output() filterModeChanged = new EventEmitter<BookFilterMode>();

  private readonly filterService = inject(BookFilterService);
  private readonly userService = inject(UserService);
  private readonly t = inject(TranslocoService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroy$ = new Subject<void>();

  private readonly activeFilters$ = new BehaviorSubject<Record<string, unknown[]> | null>(null);
  private readonly filterMode$ = new BehaviorSubject<BookFilterMode>('and');
  private readonly filterExpandedPanelsKey = 'bl-filter-expanded-panels';
  private readonly filterSortKey = 'bl-filter-sort';

  activeFilters: Record<string, unknown[]> = {};
  filterStreams: Record<FilterType, Observable<Filter[]>> = {} as Record<FilterType, Observable<Filter[]>>;
  filterTypes: FilterType[] = [];
  visibleFilterTypes: FilterType[] = [];
  expandedPanels: number[] = [0];
  truncatedFilters: Record<string, boolean> = {};
  filterSort: UserFilterSort = 'count';

  private _selectedFilterMode: BookFilterMode = 'and';
  private _visibleFilters: VisibleFilterType[] = [...DEFAULT_VISIBLE_FILTERS];
  private readonly filterSort$ = new BehaviorSubject<UserFilterSort>('count');
  private currentUserId: number | null = null;

  readonly filterLabelKeys = FILTER_LABEL_KEYS;

  getFilterLabel(type: FilterType): string {
    const key = this.filterLabelKeys[type];
    return key ? this.t.translate(key) : type;
  }

  get filterModeOptions(): FilterModeOption[] {
    return [
      {label: 'AND', value: 'and', tooltip: 'Keep only books that match every selected sidebar filter and every selected value within the same filter.'},
      {label: 'OR', value: 'or', tooltip: 'Keep books that match any selected sidebar filter or any selected value within the same filter.'},
      {label: 'NOT', value: 'not', tooltip: 'Hide books that match the selected sidebar filters.'},
      {label: '1', value: 'single', tooltip: 'Allow only one active selection at a time when clicking sidebar filters.'}
    ];
  }

  get selectedFilterMode(): BookFilterMode {
    return this._selectedFilterMode;
  }

  changeFilterMode(mode: BookFilterMode): void {
    const safe = normalizeFilterMode(mode);
    if (safe === this._selectedFilterMode) return;
    this.filterModeChanged.emit(safe);
  }

  ngOnInit(): void {
    this.loadLegacyPreferences();
    this.subscribeToUserSettings();
    this.initializeFilterStreams();
    this.subscribeToReset();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  refreshAfterRouteAttach(): void {
    this.initializeFilterStreams();
    this.cdr.markForCheck();
  }

  handleFilterClick(filterType: string, value: unknown): void {
    if (this._selectedFilterMode === 'single') {
      this.handleSingleMode(filterType, value);
    } else {
      this.handleMultiMode(filterType, value);
    }
    this.emitFilters();
  }

  setFilters(filters: Record<string, unknown>): void {
    this.activeFilters = {};
    for (const [key, value] of Object.entries(filters)) {
      const values = Array.isArray(value) ? value : [value];
      this.activeFilters[key] = values.map(v => this.filterService.processFilterValue(key, v));
    }
    this.emitFilters();
  }

  clearActiveFilter(): void {
    this.activeFilters = {};
    this.expandedPanels = [0];
    this.activeFilters$.next(null);
    this.filterSelected.emit(null);
  }

  onExpandedPanelsChange(value: string | number | string[] | number[] | null | undefined): void {
    if (Array.isArray(value)) {
      this.expandedPanels = value.map(Number);
      this.persistFilterExpandedPanels();
    }
  }

  onFiltersChanged(): void {
    this.updateExpandedPanels();
  }

  setFilterSort(sort: UserFilterSort): void {
    if (sort === this.filterSort) return;
    this.applyFilterSort(sort, false);
    this.persistFilterSort(sort);
  }

  trackByFilterType = (_: number, type: FilterType): string => type;

  trackByFilter = (_: number, f: Filter): unknown => this.getFilterValueId(f);

  getFilterValueId(f: Filter): unknown {
    const value = f.value;
    return typeof value === 'object' && value !== null && 'id' in value
      ? value.id
      : f.value;
  }

  getFilterValueDisplay(f: Filter): string {
    const value = f.value;
    if (typeof value === 'object' && value !== null && 'name' in value) {
      return String(value.name ?? '');
    }
    return String(value ?? '');
  }

  isFilterActive(filterType: string, value: unknown): boolean {
    return this.activeFilters[filterType]?.some(selected => this.valuesMatch(selected, value)) ?? false;
  }

  private subscribeToUserSettings(): void {
    this.userService.userState$.pipe(
      filter(state => !!state?.user && state.loaded),
      takeUntil(this.destroy$)
    ).subscribe(state => {
      const settings = state.user!.userSettings;
      this.currentUserId = state.user!.id;
      this._visibleFilters = settings.visibleFilters ?? [...DEFAULT_VISIBLE_FILTERS];
      this.applyPersistedFilterSort(settings.filterSortingMode);
      this.applyPersistedExpandedPanels(settings.filterExpandedPanels);
      this.updateVisibleFilterTypes();
    });
  }

  private loadLegacyPreferences(): void {
    try {
      const savedPanels = localStorage.getItem(this.filterExpandedPanelsKey);
      if (savedPanels) {
        this.expandedPanels = this.normalizeExpandedPanels(JSON.parse(savedPanels));
      }

      const savedSort = localStorage.getItem(this.filterSortKey) as UserFilterSort | null;
      if (savedSort && ['count', 'az', 'za'].includes(savedSort)) {
        this.applyFilterSort(savedSort, false);
      }
    } catch { /* ignore */ }
  }

  private initializeFilterStreams(): void {
    const entity$ = this.entity$ ?? of(null);
    const entityType$ = this.entityType$ ?? of(EntityType.ALL_BOOKS);

    this.filterStreams = this.filterService.createFilterStreams(
      entity$,
      entityType$,
      this.activeFilters$,
      this.filterMode$,
      this.urlFilter$ ?? of(null),
      this.filterSort$
    );
    this.filterTypes = Object.keys(this.filterStreams) as FilterType[];
    this.updateVisibleFilterTypes();
    this.updateExpandedPanels();
  }

  private updateVisibleFilterTypes(): void {
    this.visibleFilterTypes = this._visibleFilters.filter(
      vf => this.filterTypes.includes(vf as FilterType)
    ) as FilterType[];
  }

  private subscribeToReset(): void {
    this.resetFilter$?.pipe(takeUntil(this.destroy$)).subscribe(() => this.clearActiveFilter());
  }

  private handleSingleMode(filterType: string, value: unknown): void {
    const id = this.extractId(value);
    const current = this.activeFilters[filterType];
    const isSame = current?.length === 1 && this.valuesMatch(current[0], id);

    // Preserve navigation-level pre-filters (customMediaType / customBookType) so
    // that clicking a tag in single mode doesn't lose the active media type.
    const preserved: Record<string, unknown[]> = {};
    for (const key of ['customMediaType', 'customBookType']) {
      if (this.activeFilters[key]) preserved[key] = this.activeFilters[key];
    }

    this.activeFilters = isSame ? preserved : {...preserved, [filterType]: [id]};
  }

  private handleMultiMode(filterType: string, value: unknown): void {
    const id = this.extractId(value);

    if (!this.activeFilters[filterType]) {
      this.activeFilters[filterType] = [];
    }

    const arr = this.activeFilters[filterType];
    const index = arr.findIndex(v => this.valuesMatch(v, id));

    if (index > -1) {
      arr.splice(index, 1);
      if (arr.length === 0) delete this.activeFilters[filterType];
    } else {
      arr.push(id);
    }
  }

  private extractId(value: unknown): unknown {
    return typeof value === 'object' && value !== null && 'id' in value
      ? (value as { id: unknown }).id
      : value;
  }

  private valuesMatch(a: unknown, b: unknown): boolean {
    return a === b || String(a) === String(b);
  }

  private emitFilters(): void {
    const hasFilters = Object.keys(this.activeFilters).length > 0;
    const filtersToEmit = hasFilters ? {...this.activeFilters} : null;
    this.activeFilters$.next(filtersToEmit);
    this.filterSelected.emit(filtersToEmit as Record<string, string[]> | null);
  }

  private updateExpandedPanels(): void {
    const panels = new Set(this.expandedPanels);
    this.visibleFilterTypes.forEach((type, i) => {
      if (this.activeFilters[type]?.length) panels.add(i);
    });
    this.expandedPanels = panels.size > 0 ? [...panels] : [0];
  }

  private applyFilterSort(sort: UserFilterSort, persist = true): void {
    this.filterSort = sort;
    this.filterSort$.next(sort);
    if (persist) {
      this.persistFilterSort(sort);
    }
  }

  private applyPersistedFilterSort(sort: UserFilterSort | undefined): void {
    if (sort && ['count', 'az', 'za'].includes(sort)) {
      this.applyFilterSort(sort, false);
      return;
    }

    const legacySort = localStorage.getItem(this.filterSortKey) as UserFilterSort | null;
    if (legacySort && ['count', 'az', 'za'].includes(legacySort)) {
      this.applyFilterSort(legacySort, false);
      this.persistFilterSort(legacySort);
      localStorage.removeItem(this.filterSortKey);
    }
  }

  private applyPersistedExpandedPanels(panels: number[] | undefined): void {
    if (Array.isArray(panels)) {
      this.expandedPanels = this.normalizeExpandedPanels(panels);
      return;
    }

    try {
      const savedPanels = localStorage.getItem(this.filterExpandedPanelsKey);
      if (!savedPanels) {
        return;
      }

      this.expandedPanels = this.normalizeExpandedPanels(JSON.parse(savedPanels));
      this.persistFilterExpandedPanels();
      localStorage.removeItem(this.filterExpandedPanelsKey);
    } catch {
      // Ignore malformed legacy data.
    }
  }

  private persistFilterSort(sort: UserFilterSort): void {
    if (this.currentUserId != null) {
      this.userService.updateUserSetting(this.currentUserId, 'filterSortingMode', sort);
    } else {
      localStorage.setItem(this.filterSortKey, sort);
    }
  }

  private persistFilterExpandedPanels(): void {
    const normalized = this.normalizeExpandedPanels(this.expandedPanels);
    this.expandedPanels = normalized;
    if (this.currentUserId != null) {
      this.userService.updateUserSetting(this.currentUserId, 'filterExpandedPanels', normalized);
    } else {
      localStorage.setItem(this.filterExpandedPanelsKey, JSON.stringify(normalized));
    }
  }

  private normalizeExpandedPanels(panels: number[]): number[] {
    const normalized = [...new Set(panels.map(Number).filter(value => Number.isInteger(value) && value >= 0))];
    return normalized.length > 0 ? normalized : [0];
  }
}
