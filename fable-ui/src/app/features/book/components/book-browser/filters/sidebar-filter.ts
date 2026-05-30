import {combineLatest, Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {BookFilter} from './BookFilter';
import {BookState} from '../../../model/state/book-state.model';
import {fileSizeRanges, matchScoreRanges, pageCountRanges, ratingRanges} from '../book-filter/book-filter.config';
import {Book, ReadStatus} from '../../../model/book.model';
import {BookFilterMode} from '../../../../settings/user-management/user.service';

export function isRatingInRange(rating: number | undefined | null, rangeId: string | number): boolean {
  if (rating == null) return false;
  const numericId = typeof rangeId === 'string' ? Number(rangeId) : rangeId;
  const range = ratingRanges.find(r => r.id === numericId);
  if (!range) return false;
  return rating >= range.min && rating < range.max;
}

export function isRatingInRange10(rating: number | undefined | null, rangeId: string | number): boolean {
  if (rating == null) return false;
  const numericId = typeof rangeId === 'string' ? Number(rangeId) : rangeId;
  return Math.round(rating) === numericId;
}

export function isFileSizeInRange(fileSizeKb: number | undefined, rangeId: string | number): boolean {
  if (fileSizeKb == null) return false;
  const numericId = typeof rangeId === 'string' ? Number(rangeId) : rangeId;
  const range = fileSizeRanges.find(r => r.id === numericId);
  if (!range) return false;
  return fileSizeKb >= range.min && fileSizeKb < range.max;
}

export function isPageCountInRange(pageCount: number | undefined, rangeId: string | number): boolean {
  if (pageCount == null) return false;
  const numericId = typeof rangeId === 'string' ? Number(rangeId) : rangeId;
  const range = pageCountRanges.find(r => r.id === numericId);
  if (!range) return false;
  return pageCount >= range.min && pageCount < range.max;
}

export function isMatchScoreInRange(score: number | undefined | null, rangeId: string | number): boolean {
  if (score == null) return false;
  const normalizedScore = score > 1 ? score / 100 : score;
  const numericId = typeof rangeId === 'string' ? Number(rangeId) : rangeId;
  const range = matchScoreRanges.find(r => r.id === numericId);
  if (!range) return false;
  return normalizedScore >= range.min && normalizedScore < range.max;
}

export function doesBookMatchReadStatus(book: Book, selected: unknown[]): boolean {
  const status = book.readStatus ?? ReadStatus.UNSET;
  return selected.includes(status);
}

export function doesBookMatchFilter(
  book: Book,
  filterType: string,
  filterValues: unknown[],
  mode: BookFilterMode
): boolean {
  if (!Array.isArray(filterValues) || filterValues.length === 0) {
    return mode === 'or';
  }

  const effectiveMode = mode === 'not' ? 'or' : mode;

  switch (filterType) {
    case 'author':
      return effectiveMode === 'or'
        ? filterValues.some(val => book.metadata?.authors?.includes(val as string))
        : filterValues.every(val => book.metadata?.authors?.includes(val as string));
    case 'category':
      return effectiveMode === 'or'
        ? filterValues.some(val => book.metadata?.categories?.includes(val as string))
        : filterValues.every(val => book.metadata?.categories?.includes(val as string));
    case 'series':
      return effectiveMode === 'or'
        ? filterValues.some(val => book.metadata?.seriesName?.trim() === val)
        : filterValues.every(val => book.metadata?.seriesName?.trim() === val);
    case 'bookType':
      return book.isPhysical ? filterValues.includes('PHYSICAL') : filterValues.includes(book.primaryFile?.bookType);
    case 'customMediaType':
    case 'customBookType':
      return filterValues.includes((book.fileType ?? '').trim() || (book.isPhysical ? 'PHYSICAL' : undefined));
    case 'readStatus':
      return doesBookMatchReadStatus(book, filterValues);
    case 'personalRating':
      return filterValues.some(range => isRatingInRange10(book.personalRating, range as string | number));
    case 'publisher':
      return effectiveMode === 'or'
        ? filterValues.some(val => book.metadata?.publisher === val)
        : filterValues.every(val => book.metadata?.publisher === val);
    case 'matchScore':
      return filterValues.some(range => isMatchScoreInRange(book.metadataMatchScore, range as string | number));
    case 'library':
      return effectiveMode === 'or'
        ? filterValues.some(val => val == book.libraryId)
        : filterValues.every(val => val == book.libraryId);
    case 'shelf':
      return effectiveMode === 'or'
        ? filterValues.some(val => book.shelves?.some(s => s.id == val))
        : filterValues.every(val => book.shelves?.some(s => s.id == val));
    case 'shelfStatus': {
      const shelved = book.shelves && book.shelves.length > 0 ? 'shelved' : 'not-shelfed';
      return filterValues.includes(shelved);
    }
    case 'tag':
      return effectiveMode === 'or'
        ? filterValues.some(val => book.metadata?.tags?.includes(val as string))
        : filterValues.every(val => book.metadata?.tags?.includes(val as string));
    case 'publishedDate': {
      const bookYear = book.metadata?.publishedDate
        ? new Date(book.metadata.publishedDate).getFullYear()
        : null;
      return bookYear ? filterValues.some(val => val == bookYear || val == bookYear.toString()) : false;
    }
    case 'fileSize':
      return filterValues.some(range => isFileSizeInRange(book.fileSizeKb, range as string | number));
    case 'amazonRating':
      return filterValues.some(range => isRatingInRange(book.metadata?.amazonRating, range as string | number));
    case 'goodreadsRating':
      return filterValues.some(range => isRatingInRange(book.metadata?.goodreadsRating, range as string | number));
    case 'hardcoverRating':
      return filterValues.some(range => isRatingInRange(book.metadata?.hardcoverRating, range as string | number));
    case 'language':
      return filterValues.includes(book.metadata?.language);
    case 'pageCount':
      return filterValues.some(range => isPageCountInRange(book.metadata?.pageCount ?? undefined, range as string | number));
    case 'mood':
      return effectiveMode === 'or'
        ? filterValues.some(val => book.metadata?.moods?.includes(val as string))
        : filterValues.every(val => book.metadata?.moods?.includes(val as string));
    case 'ageRating':
      return filterValues.some(val => {
        const numVal = typeof val === 'string' ? Number(val) : val;
        return book.metadata?.ageRating === numVal;
      });
    case 'contentRating':
      return filterValues.includes(book.metadata?.contentRating);
    case 'narrator':
      return filterValues.includes(book.metadata?.narrator);
    case 'comicCharacter':
      return effectiveMode === 'or'
        ? filterValues.some(val => book.metadata?.comicMetadata?.characters?.includes(val as string))
        : filterValues.every(val => book.metadata?.comicMetadata?.characters?.includes(val as string));
    case 'comicTeam':
      return effectiveMode === 'or'
        ? filterValues.some(val => book.metadata?.comicMetadata?.teams?.includes(val as string))
        : filterValues.every(val => book.metadata?.comicMetadata?.teams?.includes(val as string));
    case 'comicLocation':
      return effectiveMode === 'or'
        ? filterValues.some(val => book.metadata?.comicMetadata?.locations?.includes(val as string))
        : filterValues.every(val => book.metadata?.comicMetadata?.locations?.includes(val as string));
    case 'comicCreator': {
      const comic = book.metadata?.comicMetadata;
      if (!comic) return false;
      const allCreators: string[] = [];
      const roles: [string[] | undefined, string][] = [
        [comic.pencillers, 'penciller'],
        [comic.inkers, 'inker'],
        [comic.colorists, 'colorist'],
        [comic.letterers, 'letterer'],
        [comic.coverArtists, 'coverArtist'],
        [comic.editors, 'editor']
      ];
      for (const [names, role] of roles) {
        if (names) {
          for (const name of names) {
            allCreators.push(`${name}:${role}`);
          }
        }
      }
      return effectiveMode === 'or'
        ? filterValues.some(val => allCreators.includes(val as string))
        : filterValues.every(val => allCreators.includes(val as string));
    }
    case 'addedOn': {
      if (!book.addedOn) return false;
      const daysAgo = (Date.now() - new Date(book.addedOn).getTime()) / (1000 * 60 * 60 * 24);
      let rangeId: number;
      if (daysAgo < 1) rangeId = 0;
      else if (daysAgo < 7) rangeId = 1;
      else if (daysAgo < 30) rangeId = 2;
      else if (daysAgo < 365) rangeId = 3;
      else rangeId = 4;
      return filterValues.some(val => {
        const numVal = typeof val === 'string' ? Number(val) : val;
        return numVal === rangeId;
      });
    }
    case 'folderPath': {
      const subPath = book.primaryFile?.fileSubPath;
      if (!subPath || subPath.trim() === '') return false;
      return effectiveMode === 'or'
        ? filterValues.some(val => val === subPath)
        : filterValues.every(val => val === subPath);
    }
    default:
      return false;
  }
}

const NAV_FILTER_TYPES = new Set(['customMediaType', 'customBookType']);
const VALID_FILTER_MODES = new Set<string>(['and', 'or', 'not', 'single']);

export function normalizeFilterMode(mode: unknown): BookFilterMode {
  if (typeof mode === 'string') {
    const normalized = mode.trim().toLowerCase();
    if (VALID_FILTER_MODES.has(normalized)) return normalized as BookFilterMode;
  }
  return 'and';
}

export function filterBooksByFilters(
  books: Book[],
  activeFilters: Record<string, unknown[]> | null,
  mode: BookFilterMode,
  excludeFilterType?: string
): Book[] {
  if (!activeFilters) return books;

  const safeMode = normalizeFilterMode(mode);

  // Navigation-level pre-filters (customMediaType / customBookType) always
  // act as mandatory AND constraints regardless of the active mode. They
  // represent the navigation scope chosen from the left sidebar and must
  // never participate in NOT / OR logic.
  let pool = books;
  for (const navKey of NAV_FILTER_TYPES) {
    const vals = activeFilters[navKey];
    if (vals?.length && navKey !== excludeFilterType) {
      pool = pool.filter(book => doesBookMatchFilter(book, navKey, vals, 'and'));
    }
  }

  const filterEntries = Object.entries(activeFilters)
    .filter(([type]) => type !== excludeFilterType && !NAV_FILTER_TYPES.has(type));

  if (filterEntries.length === 0) return pool;

  return pool.filter(book => {
    const matches = filterEntries.map(([filterType, filterValues]) =>
      doesBookMatchFilter(book, filterType, filterValues, safeMode)
    );
    if (safeMode === 'not') return matches.every(m => !m);
    return safeMode === 'or' ? matches.some(m => m) : matches.every(m => m);
  });
}

export class SideBarFilter implements BookFilter {

  constructor(private selectedFilter$: Observable<unknown>, private selectedFilterMode$: Observable<BookFilterMode>) {
  }

  filter(bookState: BookState): Observable<BookState> {
    return combineLatest([this.selectedFilter$, this.selectedFilterMode$]).pipe(
      map(([activeFilters, mode]) => {
        if (bookState.books == null) return bookState;
        if (!activeFilters) return bookState;
        const safeMode = normalizeFilterMode(mode);
        const filteredBooks = filterBooksByFilters(
          bookState.books || [],
          activeFilters as Record<string, unknown[]>,
          safeMode
        );
        return {...bookState, books: filteredBooks};
      })
    );
  }
}
