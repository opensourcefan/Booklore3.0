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

  it('shift+click selects the inclusive index range', () => {
    const service = createService();
    const books = [
      {id: 10} as never,
      {id: 20} as never,
      {id: 30} as never,
      {id: 40} as never,
    ];
    service.setCurrentBooks(books);

    service.handleCheckboxClick({
      index: 0,
      book: books[0],
      selected: true,
      shiftKey: false,
    });
    service.handleCheckboxClick({
      index: 3,
      book: books[3],
      selected: true,
      shiftKey: true,
    });

    expect([...service.selectedBooks].sort((a, b) => a - b)).toEqual([10, 20, 30, 40]);
  });
});