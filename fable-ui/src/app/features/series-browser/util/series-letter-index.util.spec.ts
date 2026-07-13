import {describe, expect, it} from 'vitest';
import {
  SERIES_ALPHABET_LETTERS,
  buildSeriesLetterIndexMap,
  getSeriesLetterBucket,
  resolveNearestLetter,
} from './series-letter-index.util';

describe('getSeriesLetterBucket', () => {
  it('maps A–Z from the first character case-insensitively', () => {
    expect(getSeriesLetterBucket('dune')).toBe('D');
    expect(getSeriesLetterBucket(' Foundation')).toBe('F');
  });

  it('buckets digits, symbols, and empty names under #', () => {
    expect(getSeriesLetterBucket('1984 Chronicles')).toBe('#');
    expect(getSeriesLetterBucket('*** Secret')).toBe('#');
    expect(getSeriesLetterBucket('')).toBe('#');
    expect(getSeriesLetterBucket('   ')).toBe('#');
  });
});

describe('buildSeriesLetterIndexMap', () => {
  it('records the first index for each letter in list order', () => {
    const map = buildSeriesLetterIndexMap([
      '1984',
      'Animal Farm',
      'Dune',
      'Dune Messiah',
      'Foundation',
    ]);
    expect(map.get('#')).toBe(0);
    expect(map.get('A')).toBe(1);
    expect(map.get('D')).toBe(2);
    expect(map.get('F')).toBe(4);
    expect(map.has('B')).toBe(false);
  });
});

describe('resolveNearestLetter', () => {
  it('returns the exact letter when present', () => {
    const available = new Set(['A', 'D', 'F']);
    expect(resolveNearestLetter('D', available, SERIES_ALPHABET_LETTERS)).toBe('D');
  });

  it('finds the nearest available letter when the target is empty', () => {
    const available = new Set(['A', 'D', 'F']);
    expect(resolveNearestLetter('C', available, SERIES_ALPHABET_LETTERS)).toBe('D');
    expect(resolveNearestLetter('E', available, SERIES_ALPHABET_LETTERS)).toBe('D');
  });

  it('returns null when nothing is available', () => {
    expect(resolveNearestLetter('A', new Set(), SERIES_ALPHABET_LETTERS)).toBeNull();
  });
});
