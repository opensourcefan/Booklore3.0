import { Injectable } from '@angular/core';
import { SortOption, SortDirection } from '../model/sort.model';
import { PagedBooksParams } from './book.service';

const SUPPORTED_SORT_FIELD_MAP: Readonly<Record<string, string>> = {
  addedOn: 'addedOn',
  title: 'metadata.title',
  seriesName: 'metadata.seriesName',
  seriesNumber: 'metadata.seriesNumber',
  publisher: 'metadata.publisher',
  publishedDate: 'metadata.publishedDate',
  pageCount: 'metadata.pageCount',
  rating: 'metadata.rating',
  amazonRating: 'metadata.amazonRating',
  amazonReviewCount: 'metadata.amazonReviewCount',
  goodreadsRating: 'metadata.goodreadsRating',
  goodreadsReviewCount: 'metadata.goodreadsReviewCount',
  hardcoverRating: 'metadata.hardcoverRating',
  hardcoverReviewCount: 'metadata.hardcoverReviewCount',
  ranobedbRating: 'metadata.ranobedbRating',
  narrator: 'metadata.narrator',
  personalRating: 'personalRating',
  lastReadTime: 'lastReadTime',
  dateFinished: 'dateFinished',
  readStatus: 'readStatus',
};

const SUPPORTED_FILTER_KEYS = new Set<string>([
  'author',
  'category',
  'series',
  'publisher',
  'language',
  'readStatus',
  'bookType',
  'customMediaType',
  'customBookType',
  'contentRating',
]);

/**
 * Translates client-side filter state (as used by SideBarFilter / BookFilterOrchestrationService)
 * into PagedBooksParams suitable for the server-side GET /api/v1/books/paged endpoint.
 *
 * This service provides the bridge between the existing UI filter model
 * and the new server-side sort/filter integration (Phase 3).
 */
@Injectable({ providedIn: 'root' })
export class ServerFilterAdapter {

  supportsSortCriteria(sortCriteria: SortOption[]): boolean {
    return this.getUnsupportedSortFields(sortCriteria).length === 0;
  }

  getUnsupportedSortFields(sortCriteria: SortOption[]): string[] {
    return sortCriteria
      .map(sort => sort.field)
      .filter(field => !SUPPORTED_SORT_FIELD_MAP[field]);
  }

  supportsFilters(selectedFilters: Record<string, unknown[]>): boolean {
    return this.getUnsupportedFilterKeys(selectedFilters).length === 0;
  }

  getUnsupportedFilterKeys(selectedFilters: Record<string, unknown[]>): string[] {
    return Object.entries(selectedFilters)
      .filter(([, values]) => values?.length)
      .map(([key]) => key)
      .filter(key => !SUPPORTED_FILTER_KEYS.has(key));
  }

  /**
   * Build paginated query params from sort criteria.
   * Each SortOption becomes a "field,direction" pair (e.g. "title,asc").
   */
  buildSortParams(sortCriteria: SortOption[]): Pick<PagedBooksParams, 'sorts'> {
    if (!sortCriteria?.length) {
      return {};
    }

    const supportedSorts = sortCriteria.filter(sort => !!SUPPORTED_SORT_FIELD_MAP[sort.field]);
    if (supportedSorts.length === 0) {
      return {};
    }

    return {
      sorts: supportedSorts.map(s =>
        `${SUPPORTED_SORT_FIELD_MAP[s.field]},${s.direction === SortDirection.DESCENDING ? 'desc' : 'asc'}`
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

      if (!SUPPORTED_FILTER_KEYS.has(key)) {
        continue;
      }

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
        case 'customMediaType':
        case 'customBookType':
          params.mediaTypes = strings;
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
