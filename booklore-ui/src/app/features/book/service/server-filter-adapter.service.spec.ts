import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {SortDirection} from '../model/sort.model';
import {ServerFilterAdapter} from './server-filter-adapter.service';

describe('ServerFilterAdapter', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ServerFilterAdapter],
    });
  });

  function createService(): ServerFilterAdapter {
    return TestBed.inject(ServerFilterAdapter);
  }

  it('builds server multi-sort params from browser sort criteria', () => {
    const service = createService();

    expect(service.buildSortParams([
      {field: 'title', label: 'Title', direction: SortDirection.ASCENDING},
      {field: 'personalRating', label: 'Personal Rating', direction: SortDirection.DESCENDING},
      {field: 'publisher', label: 'Publisher', direction: SortDirection.DESCENDING},
      {field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING},
    ])).toEqual({
      sorts: ['metadata.title,asc', 'personalRating,desc', 'metadata.publisher,desc', 'addedOn,desc'],
    });
  });

  it('reports unsupported sort fields and filter keys for guarded fallback decisions', () => {
    const service = createService();

    expect(service.getUnsupportedSortFields([
      {field: 'random', label: 'Random', direction: SortDirection.ASCENDING},
      {field: 'personalRating', label: 'Personal Rating', direction: SortDirection.DESCENDING},
      {field: 'lastReadTime', label: 'Last Read', direction: SortDirection.DESCENDING},
      {field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING},
    ])).toEqual(['random']);

    expect(service.getUnsupportedFilterKeys({
      author: ['Jane Doe'],
      tag: ['favorite'],
    })).toEqual(['tag']);
  });

  it('translates supported browser filters and leaves unsupported ones on the client path', () => {
    const service = createService();

    expect(service.buildFilterParams({
      author: ['Jane Doe'],
      category: ['Science Fiction'],
      series: ['Saga'],
      publisher: ['Orbit'],
      language: ['en'],
      readStatus: ['READ'],
      bookType: ['CBX'],
      contentRating: ['Teen'],
      tag: ['favorite'],
    }, 'or')).toEqual({
      authors: ['Jane Doe'],
      categories: ['Science Fiction'],
      series: 'Saga',
      publisher: 'Orbit',
      language: 'en',
      readStatus: 'READ',
      bookType: 'CBX',
      contentRating: 'Teen',
      filterMode: 'or',
    });
  });

  it('merges partial param objects with later values taking precedence', () => {
    const service = createService();

    expect(service.mergeParams(
      {page: 0, size: 50, sort: 'title'},
      {size: 100},
      {authors: ['Jane Doe']},
    )).toEqual({
      page: 0,
      size: 100,
      sort: 'title',
      authors: ['Jane Doe'],
    });
  });
});