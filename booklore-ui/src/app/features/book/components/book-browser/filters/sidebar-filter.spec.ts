import {describe, expect, it} from 'vitest';
import {Book} from '../../../model/book.model';
import {doesBookMatchFilter, filterBooksByFilters} from './sidebar-filter';

function createBook(overrides: Partial<Book>): Book {
  return {
    id: overrides.id ?? 1,
    libraryId: overrides.libraryId ?? 1,
    libraryName: overrides.libraryName ?? 'Library',
    ...overrides,
  } as Book;
}

describe('sidebar-filter physical media type handling', () => {
  it('matches physical placeholders for navigation-level media type filters', () => {
    const physicalBook = createBook({
      id: 10,
      isPhysical: true,
      fileType: undefined,
    });

    expect(doesBookMatchFilter(physicalBook, 'customMediaType', ['PHYSICAL'], 'and')).toBe(true);
    expect(doesBookMatchFilter(physicalBook, 'customBookType', ['PHYSICAL'], 'and')).toBe(true);
  });

  it('keeps PHYSICAL navigation filters scoped to physical books only', () => {
    const physicalBook = createBook({
      id: 10,
      isPhysical: true,
      fileType: undefined,
    });
    const digitalBook = createBook({
      id: 11,
      isPhysical: false,
      fileType: 'PDF',
      primaryFile: {id: 1, bookId: 11, bookType: 'PDF'},
    });

    const filtered = filterBooksByFilters(
      [physicalBook, digitalBook],
      {customMediaType: ['PHYSICAL']},
      'and'
    );

    expect(filtered).toEqual([physicalBook]);
  });
});