import {describe, expect, it} from 'vitest';
import {SortDirection} from '../../model/sort.model';
import {getDirectoryScopedSortCriteria, isDirectoryScopeActive} from './book-browser-directory-scope.util';

describe('isDirectoryScopeActive', () => {
  it('treats a root directory selection as an active scope', () => {
    expect(isDirectoryScopeActive('')).toBe(true);
  });

  it('treats nested directory selections as an active scope', () => {
    expect(isDirectoryScopeActive('Comics/Marvel')).toBe(true);
  });

  it('treats a null directory selection as inactive', () => {
    expect(isDirectoryScopeActive(null)).toBe(false);
  });

  it('preserves the filename sort direction while directory scope is active', () => {
    expect(getDirectoryScopedSortCriteria(
      [{field: 'fileName', label: 'File Name', direction: SortDirection.DESCENDING}],
      {field: 'fileName', label: 'File Name', direction: SortDirection.ASCENDING},
    )).toEqual([
      {field: 'fileName', label: 'File Name', direction: SortDirection.DESCENDING},
    ]);
  });

  it('falls back to the default filename direction when filename is not selected', () => {
    expect(getDirectoryScopedSortCriteria(
      [{field: 'title', label: 'Title', direction: SortDirection.DESCENDING}],
      {field: 'fileName', label: 'File Name', direction: SortDirection.ASCENDING},
    )).toEqual([
      {field: 'fileName', label: 'File Name', direction: SortDirection.ASCENDING},
    ]);
  });
});