import {convertToParamMap, ActivatedRoute} from '@angular/router';
import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BookBrowserQueryParamsService, QUERY_PARAMS} from './book-browser-query-params.service';
import {Router} from '@angular/router';
import {SortDirection} from '../../model/sort.model';

function createRoute(queryParams: Record<string, string | null> = {}): ActivatedRoute {
  return {
    snapshot: {
      queryParams,
      queryParamMap: convertToParamMap(queryParams),
    },
  } as ActivatedRoute;
}

describe('BookBrowserQueryParamsService', () => {
  const navigate = vi.fn();

  beforeEach(() => {
    navigate.mockReset();

    TestBed.configureTestingModule({
      providers: [
        BookBrowserQueryParamsService,
        { provide: Router, useValue: { navigate } },
      ],
    });
  });

  function createService(): BookBrowserQueryParamsService {
    return TestBed.inject(BookBrowserQueryParamsService);
  }

  it('writes filter mode relative to the supplied route', () => {
    const service = createService();
    const notShelfedRoute = createRoute({ [QUERY_PARAMS.FMODE]: 'not' });
    const libraryRoute = createRoute({ [QUERY_PARAMS.FMODE]: 'or' });

    service.updateFilterMode(libraryRoute, 'single', {}, true);

    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({
      relativeTo: libraryRoute,
      queryParams: {
        [QUERY_PARAMS.FMODE]: 'single',
        [QUERY_PARAMS.FILTER]: null,
      },
    }));
    expect(navigate).not.toHaveBeenCalledWith([], expect.objectContaining({ relativeTo: notShelfedRoute }));
  });

  it('uses the supplied route query params when updating multi-sort', () => {
    const service = createService();
    const route = createRoute({ existing: '1', [QUERY_PARAMS.FMODE]: 'not' });

    service.updateMultiSort(route, [{ field: 'title', label: 'Title', direction: SortDirection.ASCENDING }]);

    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({
      relativeTo: route,
      queryParams: expect.objectContaining({
        existing: '1',
        [QUERY_PARAMS.FMODE]: 'not',
        [QUERY_PARAMS.SORT]: 'title:asc',
        [QUERY_PARAMS.DIRECTION]: null,
      }),
      replaceUrl: true,
    }));
  });

  it('does not navigate when the supplied route already has the same filter query', () => {
    const service = createService();
    const route = createRoute({ [QUERY_PARAMS.FILTER]: 'author:John' });

    service.updateFilters(route, { author: ['John'] });

    expect(navigate).not.toHaveBeenCalled();
  });

  it('syncs query params relative to the supplied route', () => {
    const service = createService();
    const route = createRoute({ keep: 'yes' });

    service.syncQueryParams(route, 'grid', 'single', { tag: ['fiction'] });

    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({
      relativeTo: route,
      queryParams: expect.objectContaining({
        keep: 'yes',
        [QUERY_PARAMS.VIEW]: 'grid',
        [QUERY_PARAMS.FMODE]: 'single',
        [QUERY_PARAMS.FILTER]: 'tag:fiction',
      }),
      replaceUrl: true,
    }));
  });
});