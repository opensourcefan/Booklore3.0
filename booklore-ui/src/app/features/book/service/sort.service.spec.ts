import {describe, expect, it} from 'vitest';
import {SortService} from './sort.service';
import {SortDirection} from '../model/sort.model';
import {Book} from '../model/book.model';

function createBook(overrides: Partial<Book>): Book {
  return {
    id: overrides.id ?? 1,
    libraryId: overrides.libraryId ?? 1,
    libraryName: overrides.libraryName ?? 'Library',
    ...overrides,
  } as Book;
}

describe('SortService fileName sorting', () => {
  it('falls back to the primary file name when the top-level file name is missing', () => {
    const service = new SortService();
    const books = [
      createBook({
        id: 1,
        fileName: undefined,
        primaryFile: {id: 101, bookId: 1, fileName: 'Zulu.cbz', bookType: 'CBX'} as Book['primaryFile']
      }),
      createBook({
        id: 2,
        fileName: undefined,
        primaryFile: {id: 102, bookId: 2, fileName: 'Alpha.cbz', bookType: 'CBX'} as Book['primaryFile']
      })
    ];

    const sorted = service.applyMultiSort(books, [{field: 'fileName', direction: SortDirection.ASCENDING, label: 'File Name'}]);

    expect(sorted.map(book => book.id)).toEqual([2, 1]);
  });
});