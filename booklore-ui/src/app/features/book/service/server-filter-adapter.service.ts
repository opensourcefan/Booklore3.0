import { Injectable } from '@angular/core';
import { SortOption, SortDirection } from '../model/sort.model';
import { PagedBooksParams } from './book.service';

/**
 * Translates client-side filter state (as used by SideBarFilter / BookFilterOrchestrationService)
 * into PagedBooksParams suitable for the server-side GET /api/v1/books/paged endpoint.
 *
 * This service provides the bridge between the existing UI filter model
 * and the new server-side sort/filter integration (Phase 3).
 */
@Injectable({ providedIn: 'root' })
export class ServerFilterAdapter {

  /**
   * Build paginated query params from sort criteria.
   * Each SortOption becomes a "field,direction" pair (e.g. "title,asc").
   */
  buildSortParams(sortCriteria: SortOption[]): Pick<PagedBooksParams, 'sorts'> {
    if (!sortCriteria?.length) {
      return {};
    }
    return {
      sorts: sortCriteria.map(s =>
        `${s.field},${s.direction === SortDirection.DESCENDING ? 'desc' : 'asc'}`
      ),
    };
  }

  /**
   * Build paginated query params from the selected filter state
   * (Record<string, string[]|unknown[]> as used by SideBarFilter).
   *
   * Recognized filter keys are mapped to server-side query parameters.
   * Unknown keys are silently ignored.
   */
  buildFilterParams(
    selectedFilters: Record<string, unknown[]>,
    filterMode?: string,
  ): Partial<PagedBooksParams> {
    const params: Partial<PagedBooksParams> = {};

    for (const [key, values] of Object.entries(selectedFilters)) {
      if (!values?.length) continue;

      const strings = values.map(v => String(v));

      switch (key) {
        case 'author':
          params.authors = strings;
          break;
        case 'category':
          params.categories = strings;
          break;
        case 'series':
          params.series = strings[0];
          break;
        case 'publisher':
          params.publisher = strings[0];
          break;
        case 'language':
          params.language = strings[0];
          break;
        case 'readStatus':
          params.readStatus = strings[0];
          break;
        case 'bookType':
          params.bookType = strings[0];
          break;
        case 'contentRating':
          params.contentRating = strings[0];
          break;
        default:
          // Filters not yet supported server-side (tag, isbn, rating ranges, etc.)
          // are ignored here and continue to be applied client-side.
          break;
      }
    }

    if (filterMode) {
      params.filterMode = filterMode;
    }

    return params;
  }

  /**
   * Combine multiple partial param objects into a single PagedBooksParams.
   * Later entries override earlier ones.
   */
  mergeParams(...sources: Partial<PagedBooksParams>[]): PagedBooksParams {
    return Object.assign({}, ...sources);
  }
}
