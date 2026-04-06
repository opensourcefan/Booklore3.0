import {describe, expect, it} from 'vitest';
import {Book} from '../../../model/book.model';
import {getFacetSourceBooks} from '../book-filter/book-filter.service';
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

  it('matches any selected tags in OR mode', () => {
    const tagAOnly = createBook({
      id: 1,
      metadata: {tags: ['Tag A']} as Book['metadata'],
    });
    const tagBOnly = createBook({
      id: 2,
      metadata: {tags: ['Tag B']} as Book['metadata'],
    });
    const bothTags = createBook({
      id: 3,
      metadata: {tags: ['Tag A', 'Tag B']} as Book['metadata'],
    });

    const filtered = filterBooksByFilters(
      [tagAOnly, tagBOnly, bothTags],
      {tag: ['Tag A', 'Tag B']},
      'or'
    );

    expect(filtered).toEqual([tagAOnly, tagBOnly, bothTags]);
  });

  it('requires all selected tags in AND mode', () => {
    const tagAOnly = createBook({
      id: 1,
      metadata: {tags: ['Tag A']} as Book['metadata'],
    });
    const bothTags = createBook({
      id: 2,
      metadata: {tags: ['Tag A', 'Tag B']} as Book['metadata'],
    });

    const filtered = filterBooksByFilters(
      [tagAOnly, bothTags],
      {tag: ['Tag A', 'Tag B']},
      'and'
    );

    expect(filtered).toEqual([bothTags]);
  });

  it('narrows same-facet options in AND mode to only co-occurring tags', () => {
    const tagAOnly = createBook({
      id: 1,
      metadata: {tags: ['Tag A']} as Book['metadata'],
    });
    const bothTags = createBook({
      id: 2,
      metadata: {tags: ['Tag A', 'Tag B']} as Book['metadata'],
    });
    const unrelated = createBook({
      id: 3,
      metadata: {tags: ['Tag C']} as Book['metadata'],
    });

    const facetBooks = getFacetSourceBooks(
      [tagAOnly, bothTags, unrelated],
      {tag: ['Tag A']},
      'and',
      'tag'
    );

    expect(facetBooks).toEqual([tagAOnly, bothTags]);
  });

  it('keeps same-facet options broad in OR mode', () => {
    const tagAOnly = createBook({
      id: 1,
      metadata: {tags: ['Tag A']} as Book['metadata'],
    });
    const bothTags = createBook({
      id: 2,
      metadata: {tags: ['Tag A', 'Tag B']} as Book['metadata'],
    });
    const unrelated = createBook({
      id: 3,
      metadata: {tags: ['Tag C']} as Book['metadata'],
    });

    const facetBooks = getFacetSourceBooks(
      [tagAOnly, bothTags, unrelated],
      {tag: ['Tag A']},
      'or',
      'tag'
    );

    expect(facetBooks).toEqual([tagAOnly, bothTags, unrelated]);
  });
});