import {describe, expect, it} from 'vitest';
import {DirectoryFilterService} from './directory-filter.service';

describe('DirectoryFilterService', () => {
  it('clears only the active matching scope', () => {
    const service = new DirectoryFilterService();

    service.setFilter({
      libraryPathId: 5,
      fileSubPath: 'Comics/Batman',
      scopeKey: 'library:5'
    });

    service.clearScope('library:5');

    expect(service.currentFilter).toBeNull();
  });

  it('does not clear a different scope', () => {
    const service = new DirectoryFilterService();

    service.setFilter({
      libraryPathId: 8,
      fileSubPath: 'Manga',
      scopeKey: 'library:8'
    });

    service.clearScope('library:3');

    expect(service.currentFilter).toEqual({
      libraryPathId: 8,
      fileSubPath: 'Manga',
      scopeKey: 'library:8'
    });
  });
});