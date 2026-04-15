import {TestBed} from '@angular/core/testing';
import {describe, expect, it} from 'vitest';
import {BookSelectionService} from './book-selection.service';

describe('BookSelectionService', () => {
  function createService(): BookSelectionService {
    return TestBed.runInInjectionContext(() => new BookSelectionService());
  }

  it('returns a snapshot instead of the live selection set', () => {
    const service = createService();

    service.setSelectedBooks(new Set([1, 2]));

    const snapshot = service.selectedBooks;
    snapshot.clear();

    expect(service.selectedBooks.size).toBe(2);
  });
});