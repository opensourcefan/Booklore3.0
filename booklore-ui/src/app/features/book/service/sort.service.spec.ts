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

  it('sorts numeric filename chunks naturally', () => {
    const service = new SortService();
    const books = [
      createBook({id: 10, fileName: 'Issue 10.cbz'}),
      createBook({id: 2, fileName: 'Issue 2.cbz'}),
      createBook({id: 1, fileName: 'Issue 1.cbz'}),
      createBook({id: 11, fileName: 'Issue 11.cbz'}),
    ];

    const sorted = service.applyMultiSort(books, [{field: 'fileName', direction: SortDirection.ASCENDING, label: 'File Name'}]);

    expect(sorted.map(book => book.id)).toEqual([1, 2, 10, 11]);
  });

  it('sorts zero-padded title numbers naturally', () => {
    const service = new SortService();
    const books = [
      createBook({id: 10, metadata: {title: 'Chapter 10'} as Book['metadata']}),
      createBook({id: 2, metadata: {title: 'Chapter 02'} as Book['metadata']}),
      createBook({id: 1, metadata: {title: 'Chapter 01'} as Book['metadata']}),
    ];

    const sorted = service.applyMultiSort(books, [{field: 'title', direction: SortDirection.ASCENDING, label: 'Title'}]);

    expect(sorted.map(book => book.id)).toEqual([1, 2, 10]);
  });
});