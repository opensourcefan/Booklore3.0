import {describe, expect, it, vi} from 'vitest';
import {BookBrowserComponent, EntityType} from './book-browser.component';
import {SortDirection} from '../../model/sort.model';

describe('BookBrowserComponent route reuse lifecycle', () => {
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
});