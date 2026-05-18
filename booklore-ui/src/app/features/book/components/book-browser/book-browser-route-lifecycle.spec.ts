import {BehaviorSubject} from 'rxjs';
import {describe, expect, it, vi} from 'vitest';
import {BookBrowserComponent, EntityType} from './book-browser.component';
import {SortDirection} from '../../model/sort.model';

describe('BookBrowserComponent route reuse lifecycle', () => {
  it('does not reapply effective sort before the browser context is initialized', () => {
    const setSortCriteria = vi.fn();
    const getEffectiveSortCriteria = vi.fn();
    const areSortCriteriaEqual = vi.fn();
    const applySortCriteria = vi.fn();

    const componentLike = {
      entityType: undefined,
      currentViewMode: undefined,
      baseSortCriteria: [],
      bookSorter: {
        selectedSortCriteria: [{field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING}],
        setSortCriteria,
      },
      lastAppliedSortCriteria: [],
      getEffectiveSortCriteria,
      areSortCriteriaEqual,
      applySortCriteria,
    };

    const applyEffectiveSortCriteria = (BookBrowserComponent.prototype as unknown as {
      applyEffectiveSortCriteria: () => void;
    }).applyEffectiveSortCriteria;

    applyEffectiveSortCriteria.call(componentLike as never);

    expect(getEffectiveSortCriteria).not.toHaveBeenCalled();
    expect(areSortCriteriaEqual).not.toHaveBeenCalled();
    expect(setSortCriteria).not.toHaveBeenCalled();
    expect(applySortCriteria).not.toHaveBeenCalled();
  });

  it('marks the route detached and unsubscribes from shared paged state updates', () => {
    const unsubscribe = vi.fn();
    const componentLike = {
      isRouteAttached: true,
      bookStateSubscription: {unsubscribe},
    };

    BookBrowserComponent.prototype.onRouteDetached.call(componentLike as never);

    expect(componentLike.isRouteAttached).toBe(false);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(componentLike.bookStateSubscription).toBeUndefined();
  });

  it('does not reconnect paged state while the route is detached', () => {
    const createGridViewportContext = vi.fn();

    BookBrowserComponent.prototype.applySortCriteria.call({
      isRouteAttached: false,
      createGridViewportContext,
    } as never, [{field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING}]);

    expect(createGridViewportContext).not.toHaveBeenCalled();
  });

  it('reconnects the current entity query when a reused route is reattached', () => {
    const sortCriteria = [{field: 'title', label: 'Title', direction: SortDirection.ASCENDING}];
    const refreshAfterRouteAttach = vi.fn();
    const syncSelectionState = vi.fn();
    const refreshSelectionFromInputs = vi.fn();
    const restoreSavedScrollPosition = vi.fn();
    const invalidateEntity = vi.fn();
    const detectChanges = vi.fn();
    const getEffectiveSortCriteria = vi.fn(() => sortCriteria);
    const applySortCriteria = vi.fn();

    const componentLike = {
      isRouteAttached: false,
      bookFilterComponents: [{refreshAfterRouteAttach}],
      entityType: EntityType.LIBRARY,
      pagedBookBrowserStateService: {invalidateEntity},
      lastAppliedSortCriteria: sortCriteria,
      bookSorter: {selectedSortCriteria: []},
      getEffectiveSortCriteria,
      applySortCriteria,
      syncSelectionState,
      bookSelectionService: {selectedBooks: new Set([42])},
      bookTableComponent: {refreshSelectionFromInputs},
      restoreSavedScrollPosition,
      cdr: {detectChanges},
    };

    BookBrowserComponent.prototype.onRouteReattached.call(componentLike as never);

    expect(componentLike.isRouteAttached).toBe(true);
    expect(refreshAfterRouteAttach).toHaveBeenCalledTimes(1);
    expect(invalidateEntity).toHaveBeenCalledWith('ALL_BOOKS');
    expect(getEffectiveSortCriteria).toHaveBeenCalledWith(sortCriteria);
    expect(applySortCriteria).toHaveBeenCalledWith(sortCriteria);
    expect(syncSelectionState).toHaveBeenCalledWith(componentLike.bookSelectionService.selectedBooks);
    expect(refreshSelectionFromInputs).toHaveBeenCalledTimes(1);
    expect(restoreSavedScrollPosition).toHaveBeenCalledTimes(1);
    expect(detectChanges).toHaveBeenCalledTimes(1);
  });

  it('restores the current library title when a cached browser route is reattached', () => {
    const setPageTitle = vi.fn();

    BookBrowserComponent.prototype.onRouteReattached.call({
      isRouteAttached: false,
      bookFilterComponents: [],
      entityType: EntityType.LIBRARY,
      entity: {name: 'Library B'},
      pageTitle: {setPageTitle},
      pagedBookBrowserStateService: {invalidateEntity: vi.fn()},
      lastAppliedSortCriteria: [],
      bookSorter: {selectedSortCriteria: []},
      getEffectiveSortCriteria: vi.fn(() => []),
      applySortCriteria: vi.fn(),
      syncSelectionState: vi.fn(),
      bookSelectionService: {selectedBooks: new Set()},
      bookTableComponent: {refreshSelectionFromInputs: vi.fn()},
      restoreSavedScrollPosition: vi.fn(),
      cdr: {detectChanges: vi.fn()},
    } as never);

    expect(setPageTitle).toHaveBeenCalledWith('Library B');
  });

  it('reapplies the library data source immediately when sidebar filters change', () => {
    const sortCriteria = [{field: 'title', label: 'Title', direction: SortDirection.ASCENDING}];
    const applySortCriteria = vi.fn();
    const getEffectiveSortCriteria = vi.fn(() => sortCriteria);
    const updateFilters = vi.fn();
    const selectedFilterNext = vi.fn();

    const componentLike = {
      settingFiltersFromUrl: false,
      selectedFilter: {next: selectedFilterNext},
      rawFilterParamFromUrl: 'author:old',
      parsedFilters: {},
      currentFilterLabel: null,
      computedFilterLabel: 'Author: Frank Herbert',
      t: {translate: vi.fn(() => 'All Books')},
      queryParamsService: {updateFilters},
      activatedRoute: {},
      entityType: EntityType.LIBRARY,
      getEffectiveSortCriteria,
      bookSorter: {selectedSortCriteria: sortCriteria},
      applySortCriteria,
    };

    BookBrowserComponent.prototype.onFilterSelected.call(componentLike as never, {author: ['Frank Herbert']});

    expect(selectedFilterNext).toHaveBeenCalledWith({author: ['Frank Herbert']});
    expect(componentLike.parsedFilters).toEqual({author: ['Frank Herbert']});
    expect(updateFilters).toHaveBeenCalledWith(componentLike.activatedRoute, {author: ['Frank Herbert']});
    expect(getEffectiveSortCriteria).toHaveBeenCalledWith(sortCriteria);
    expect(applySortCriteria).toHaveBeenCalledWith(sortCriteria);
  });

  it('reapplies the shelf data source immediately when filter mode changes', () => {
    const sortCriteria = [{field: 'title', label: 'Title', direction: SortDirection.ASCENDING}];
    const applySortCriteria = vi.fn();
    const getEffectiveSortCriteria = vi.fn(() => sortCriteria);
    const clearSidebarFiltersState = vi.fn();
    const updateFilterMode = vi.fn();
    const persistFilterModePreference = vi.fn();
    const selectedFilterMode = new BehaviorSubject<'and' | 'or' | 'single'>('and');

    const componentLike = {
      settingFiltersFromUrl: false,
      selectedFilterMode,
      clearSidebarFiltersState,
      queryParamsService: {updateFilterMode},
      activatedRoute: {},
      persistFilterModePreference,
      entityType: EntityType.SHELF,
      getEffectiveSortCriteria,
      bookSorter: {selectedSortCriteria: sortCriteria},
      applySortCriteria,
    };

    BookBrowserComponent.prototype.onFilterModeChanged.call(componentLike as never, 'or');

    expect(clearSidebarFiltersState).toHaveBeenCalledWith(true);
    expect(selectedFilterMode.getValue()).toBe('or');
    expect(updateFilterMode).toHaveBeenCalledWith(componentLike.activatedRoute, 'or', {}, true);
    expect(persistFilterModePreference).toHaveBeenCalledWith('or');
    expect(getEffectiveSortCriteria).toHaveBeenCalledWith(sortCriteria);
    expect(applySortCriteria).toHaveBeenCalledWith(sortCriteria);
  });
});