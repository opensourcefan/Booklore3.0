import {describe, expect, it} from 'vitest';
import {Book} from '../../../model/book.model';
import {getFacetSourceBooks} from '../book-filter/book-filter.service';
import {doesBookMatchFilter, filterBooksByFilters, normalizeFilterMode, SideBarFilter} from './sidebar-filter';
import {BehaviorSubject, firstValueFrom} from 'rxjs';
import {BookFilterMode} from '../../../../settings/user-management/user.service';
import {BookState} from '../../../model/state/book-state.model';

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

describe('sidebar-filter NOT mode', () => {
  const bookJohn = createBook({id: 1, metadata: {authors: ['John'], tags: ['fiction']} as Book['metadata']});
  const bookJane = createBook({id: 2, metadata: {authors: ['Jane'], tags: ['science']} as Book['metadata']});
  const bookBob  = createBook({id: 3, metadata: {authors: ['Bob'], tags: ['fiction']} as Book['metadata']});
  const books = [bookJohn, bookJane, bookBob];

  it('excludes books matching a single NOT filter', () => {
    const result = filterBooksByFilters(books, {author: ['John']}, 'not');
    expect(result.map(b => b.id)).toEqual([2, 3]);
  });

  it('excludes books matching any value in a multi-value NOT filter', () => {
    const result = filterBooksByFilters(books, {author: ['John', 'Jane']}, 'not');
    expect(result.map(b => b.id)).toEqual([3]);
  });

  it('excludes books matching any selected cross-category NOT filters', () => {
    // NOT author=John AND NOT tag=fiction → only Jane's science book survives
    const result = filterBooksByFilters(books, {author: ['John'], tag: ['fiction']}, 'not');
    expect(result.map(b => b.id)).toEqual([2]);
  });

  it('returns all books when NOT filters are null', () => {
    const result = filterBooksByFilters(books, null, 'not');
    expect(result.map(b => b.id)).toEqual([1, 2, 3]);
  });

  it('returns all books when NOT filters are empty', () => {
    const result = filterBooksByFilters(books, {}, 'not');
    expect(result.map(b => b.id)).toEqual([1, 2, 3]);
  });
});

describe('sidebar-filter single mode', () => {
  const bookJohn = createBook({id: 1, metadata: {authors: ['John'], tags: ['fiction']} as Book['metadata']});
  const bookJane = createBook({id: 2, metadata: {authors: ['Jane'], tags: ['science']} as Book['metadata']});
  const bookBob  = createBook({id: 3, metadata: {authors: ['Bob'], tags: ['fiction']} as Book['metadata']});
  const books = [bookJohn, bookJane, bookBob];

  it('keeps only books matching all active single-mode filters (AND semantics)', () => {
    const result = filterBooksByFilters(books, {author: ['John']}, 'single');
    expect(result.map(b => b.id)).toEqual([1]);
  });

  it('supports single-mode with cross-category filters using AND semantics', () => {
    // Technically single mode only allows one filter but if two exist, AND semantics apply
    const result = filterBooksByFilters(books, {author: ['Bob'], tag: ['fiction']}, 'single');
    expect(result.map(b => b.id)).toEqual([3]);
  });
});

describe('sidebar-filter addedOn matching', () => {
  const today = new Date().toISOString();
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
  const fifteenDaysAgo = new Date(Date.now() - 15 * 86400000).toISOString();
  const sixMonthsAgo = new Date(Date.now() - 180 * 86400000).toISOString();
  const twoYearsAgo = new Date(Date.now() - 730 * 86400000).toISOString();

  const bookToday = createBook({id: 1, addedOn: today});
  const bookWeek = createBook({id: 2, addedOn: threeDaysAgo});
  const bookMonth = createBook({id: 3, addedOn: fifteenDaysAgo});
  const bookYear = createBook({id: 4, addedOn: sixMonthsAgo});
  const bookOld = createBook({id: 5, addedOn: twoYearsAgo});
  const bookNoDate = createBook({id: 6});
  const books = [bookToday, bookWeek, bookMonth, bookYear, bookOld, bookNoDate];

  it('matches addedOn range id 0 (Today) in AND mode', () => {
    const result = filterBooksByFilters(books, {addedOn: [0]}, 'and');
    expect(result.map(b => b.id)).toEqual([1]);
  });

  it('matches addedOn range id 1 (Last 7 Days) in AND mode', () => {
    const result = filterBooksByFilters(books, {addedOn: [1]}, 'and');
    expect(result.map(b => b.id)).toEqual([2]);
  });

  it('matches multiple addedOn ranges in OR-style with AND mode', () => {
    const result = filterBooksByFilters(books, {addedOn: [0, 1]}, 'and');
    expect(result.map(b => b.id)).toEqual([1, 2]);
  });

  it('excludes addedOn matches in NOT mode', () => {
    const result = filterBooksByFilters(books, {addedOn: [4]}, 'not');
    // Older is id 4 → exclude bookOld (id 5); bookNoDate has no addedOn → doesBookMatch returns false → !false = true → passes
    expect(result.map(b => b.id)).toEqual([1, 2, 3, 4, 6]);
  });

  it('handles string addedOn range ids from URL deserialization', () => {
    const result = filterBooksByFilters(books, {addedOn: ['0']}, 'and');
    expect(result.map(b => b.id)).toEqual([1]);
  });
});

describe('sidebar-filter folderPath matching', () => {
  const bookA = createBook({id: 1, primaryFile: {fileSubPath: 'comics/marvel'} as Book['primaryFile']});
  const bookB = createBook({id: 2, primaryFile: {fileSubPath: 'comics/dc'} as Book['primaryFile']});
  const bookC = createBook({id: 3, primaryFile: {fileSubPath: 'novels'} as Book['primaryFile']});
  const bookNoPath = createBook({id: 4});
  const books = [bookA, bookB, bookC, bookNoPath];

  it('matches folderPath in AND mode', () => {
    const result = filterBooksByFilters(books, {folderPath: ['comics/marvel']}, 'and');
    expect(result.map(b => b.id)).toEqual([1]);
  });

  it('matches multiple folderPaths in OR mode', () => {
    const result = filterBooksByFilters(books, {folderPath: ['comics/marvel', 'novels']}, 'or');
    expect(result.map(b => b.id)).toEqual([1, 3]);
  });

  it('excludes folderPath in NOT mode', () => {
    const result = filterBooksByFilters(books, {folderPath: ['comics/marvel']}, 'not');
    expect(result.map(b => b.id)).toEqual([2, 3, 4]);
  });
});

describe('sidebar-filter NOT mode with tags (user scenario)', () => {
  // Books with diverse, overlapping tags matching the user's scenario
  const bookFantasy = createBook({id: 1, metadata: {tags: ['Fantasy', 'Adventure']} as Book['metadata']});
  const bookHorror = createBook({id: 2, metadata: {tags: ['Horror', 'Thriller']} as Book['metadata']});
  const bookSciFi = createBook({id: 3, metadata: {tags: ['Sci-Fi']} as Book['metadata']});
  const bookBothGenres = createBook({id: 4, metadata: {tags: ['Fantasy', 'Horror']} as Book['metadata']});
  const bookNoTags = createBook({id: 5, metadata: {} as Book['metadata']});
  const bookNullMeta = createBook({id: 6});
  const books = [bookFantasy, bookHorror, bookSciFi, bookBothGenres, bookNoTags, bookNullMeta];

  it('NOT with 1 tag excludes ONLY books having that tag', () => {
    const result = filterBooksByFilters(books, {tag: ['Fantasy']}, 'not');
    // Fantasy is on books 1 and 4 → excluded; books 2,3,5,6 remain
    expect(result.map(b => b.id)).toEqual([2, 3, 5, 6]);
  });

  it('NOT with 2 tags excludes books having EITHER tag', () => {
    const result = filterBooksByFilters(books, {tag: ['Fantasy', 'Horror']}, 'not');
    // Fantasy on 1,4; Horror on 2,4 → excluded: 1,2,4; remains: 3,5,6
    expect(result.map(b => b.id)).toEqual([3, 5, 6]);
  });

  it('NOT with 1 tag differs from single/1 mode (single shows matches, NOT hides them)', () => {
    const notResult = filterBooksByFilters(books, {tag: ['Fantasy']}, 'not');
    const singleResult = filterBooksByFilters(books, {tag: ['Fantasy']}, 'single');
    // NOT excludes Fantasy books, single includes them
    expect(notResult.map(b => b.id)).toEqual([2, 3, 5, 6]);
    expect(singleResult.map(b => b.id)).toEqual([1, 4]);
    // They must produce disjoint (non-overlapping) results
    const overlap = notResult.filter(b => singleResult.some(s => s.id === b.id));
    expect(overlap).toEqual([]);
  });

  it('NOT with all popular tags can empty the results (correct behavior)', () => {
    // Select all tags that cover every book → nothing survives
    const result = filterBooksByFilters(books, {tag: ['Fantasy', 'Horror', 'Sci-Fi', 'Adventure', 'Thriller']}, 'not');
    // Books 1-4 all have at least one matching tag → excluded
    // Books 5,6 have no tags → doesBookMatchFilter returns false → !false = true → survive
    expect(result.map(b => b.id)).toEqual([5, 6]);
  });

  it('NOT keeps books with no tags (no metadata match)', () => {
    const result = filterBooksByFilters(books, {tag: ['Fantasy']}, 'not');
    expect(result.map(b => b.id)).toContain(5); // empty metadata tags
    expect(result.map(b => b.id)).toContain(6); // no metadata at all
  });
});

describe('normalizeFilterMode', () => {
  it('passes through valid lowercase modes unchanged', () => {
    expect(normalizeFilterMode('and')).toBe('and');
    expect(normalizeFilterMode('or')).toBe('or');
    expect(normalizeFilterMode('not')).toBe('not');
    expect(normalizeFilterMode('single')).toBe('single');
  });

  it('normalizes uppercase mode to lowercase', () => {
    expect(normalizeFilterMode('NOT')).toBe('not');
    expect(normalizeFilterMode('AND')).toBe('and');
    expect(normalizeFilterMode('Or')).toBe('or');
    expect(normalizeFilterMode('SINGLE')).toBe('single');
  });

  it('trims whitespace', () => {
    expect(normalizeFilterMode(' not ')).toBe('not');
    expect(normalizeFilterMode('  and')).toBe('and');
  });

  it('defaults to and for invalid values', () => {
    expect(normalizeFilterMode('invalid')).toBe('and');
    expect(normalizeFilterMode('')).toBe('and');
    expect(normalizeFilterMode(null)).toBe('and');
    expect(normalizeFilterMode(undefined)).toBe('and');
  });

  it('filterBooksByFilters applies NOT correctly even with uppercase mode', () => {
    const books = [
      createBook({id: 1, metadata: {tags: ['Fantasy']} as Book['metadata']}),
      createBook({id: 2, metadata: {tags: ['Horror']} as Book['metadata']}),
    ];
    // Cast to bypass TypeScript — at runtime the mode could be uppercase
    const result = filterBooksByFilters(books, {tag: ['Fantasy']}, 'NOT' as unknown as BookFilterMode);
    expect(result.map(b => b.id)).toEqual([2]);
  });
});

describe('SideBarFilter integration', () => {
  it('applies NOT mode through the observable chain', async () => {
    const books = [
      createBook({id: 1, metadata: {tags: ['Fantasy']} as Book['metadata']}),
      createBook({id: 2, metadata: {tags: ['Horror']} as Book['metadata']}),
      createBook({id: 3, metadata: {tags: ['Sci-Fi']} as Book['metadata']}),
    ];
    const bookState: BookState = {books, loaded: true, error: null};

    const selectedFilter$ = new BehaviorSubject<Record<string, string[]> | null>(null);
    const selectedFilterMode$ = new BehaviorSubject<BookFilterMode>('and');
    const sideBar = new SideBarFilter(selectedFilter$, selectedFilterMode$);

    // Initially no filters → all books
    let result = await firstValueFrom(sideBar.filter(bookState));
    expect(result.books?.map(b => b.id)).toEqual([1, 2, 3]);

    // Switch to NOT mode, then set filter
    selectedFilterMode$.next('not');
    selectedFilter$.next({tag: ['Fantasy']});
    result = await firstValueFrom(sideBar.filter(bookState));
    expect(result.books?.map(b => b.id)).toEqual([2, 3]);

    // Add a second tag in NOT mode
    selectedFilter$.next({tag: ['Fantasy', 'Horror']});
    result = await firstValueFrom(sideBar.filter(bookState));
    expect(result.books?.map(b => b.id)).toEqual([3]);
  });

  it('switches between NOT and single mode correctly', async () => {
    const books = [
      createBook({id: 1, metadata: {tags: ['Fantasy']} as Book['metadata']}),
      createBook({id: 2, metadata: {tags: ['Horror']} as Book['metadata']}),
      createBook({id: 3, metadata: {tags: ['Sci-Fi']} as Book['metadata']}),
    ];
    const bookState: BookState = {books, loaded: true, error: null};

    const selectedFilter$ = new BehaviorSubject<Record<string, string[]> | null>(null);
    const selectedFilterMode$ = new BehaviorSubject<BookFilterMode>('not');
    const sideBar = new SideBarFilter(selectedFilter$, selectedFilterMode$);

    // NOT mode: exclude Fantasy
    selectedFilter$.next({tag: ['Fantasy']});
    let result = await firstValueFrom(sideBar.filter(bookState));
    expect(result.books?.map(b => b.id)).toEqual([2, 3]);

    // Switch to single mode: Fantasy now included
    selectedFilterMode$.next('single');
    result = await firstValueFrom(sideBar.filter(bookState));
    expect(result.books?.map(b => b.id)).toEqual([1]);
  });
});