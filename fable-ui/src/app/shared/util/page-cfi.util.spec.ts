import {describe, expect, it} from 'vitest';
import {parsePageCfi} from './page-cfi.util';

describe('parsePageCfi', () => {
  it('parses plain page numbers', () => {
    expect(parsePageCfi('12')).toBe(12);
    expect(parsePageCfi('1')).toBe(1);
  });

  it('parses page= forms', () => {
    expect(parsePageCfi('page=12')).toBe(12);
    expect(parsePageCfi('page=12:uuid-here')).toBe(12);
  });

  it('rejects invalid values', () => {
    expect(parsePageCfi(null)).toBeNull();
    expect(parsePageCfi(undefined)).toBeNull();
    expect(parsePageCfi('')).toBeNull();
    expect(parsePageCfi('  ')).toBeNull();
    expect(parsePageCfi('0')).toBeNull();
    expect(parsePageCfi('-1')).toBeNull();
    expect(parsePageCfi('abc')).toBeNull();
    expect(parsePageCfi('page=')).toBeNull();
    expect(parsePageCfi('page=abc')).toBeNull();
  });
});
