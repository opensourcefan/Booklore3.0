import {describe, expect, it} from 'vitest';
import {SortDirection} from '../../model/sort.model';
import {
  buildGridViewportContext,
  shouldResetGridViewport,
} from './book-browser-grid-reset.util';

describe('book browser grid reset helpers', () => {
  it('requests a grid reset when the Added On direction changes', () => {
    const previous = buildGridViewportContext({
      viewMode: 'grid',
      entityType: 'All Books',
      sortCriteria: [{field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING}],
      filterMode: 'and',
      searchTerm: '',
      activeDirFilterPath: null,
      filterSignature: '{}',
    });

    const next = buildGridViewportContext({
      viewMode: 'grid',
      entityType: 'All Books',
      sortCriteria: [{field: 'addedOn', label: 'Added On', direction: SortDirection.ASCENDING}],
      filterMode: 'and',
      searchTerm: '',
      activeDirFilterPath: null,
      filterSignature: '{}',
    });

    expect(shouldResetGridViewport(previous, next)).toBe(true);
  });

  it('requests a grid reset when directory scope is cleared', () => {
    const previous = buildGridViewportContext({
      viewMode: 'grid',
      entityType: 'All Books',
      sortCriteria: [{field: 'fileName', label: 'File Name', direction: SortDirection.ASCENDING}],
      filterMode: 'and',
      searchTerm: '',
      activeDirFilterPath: '',
      filterSignature: '{}',
    });

    const next = buildGridViewportContext({
      viewMode: 'grid',
      entityType: 'All Books',
      sortCriteria: [{field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING}],
      filterMode: 'and',
      searchTerm: '',
      activeDirFilterPath: null,
      filterSignature: '{}',
    });

    expect(shouldResetGridViewport(previous, next)).toBe(true);
  });

  it('does not request a grid reset when only the view is table', () => {
    const previous = buildGridViewportContext({
      viewMode: 'table',
      entityType: 'All Books',
      sortCriteria: [{field: 'addedOn', label: 'Added On', direction: SortDirection.DESCENDING}],
      filterMode: 'and',
      searchTerm: '',
      activeDirFilterPath: null,
      filterSignature: '{}',
    });

    const next = buildGridViewportContext({
      viewMode: 'table',
      entityType: 'All Books',
      sortCriteria: [{field: 'addedOn', label: 'Added On', direction: SortDirection.ASCENDING}],
      filterMode: 'and',
      searchTerm: '',
      activeDirFilterPath: null,
      filterSignature: '{}',
    });

    expect(shouldResetGridViewport(previous, next)).toBe(false);
  });
});