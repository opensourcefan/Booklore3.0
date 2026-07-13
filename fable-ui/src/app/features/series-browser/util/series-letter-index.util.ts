/** Ordered alphabet rail labels used by the mobile series browser. */
export const SERIES_ALPHABET_LETTERS = [
  '#',
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
] as const;

export type SeriesAlphabetLetter = (typeof SERIES_ALPHABET_LETTERS)[number];

/**
 * Maps a series name to its alphabet bucket.
 * A–Z use the first letter; everything else (digits, symbols, empty) → `#`.
 */
export function getSeriesLetterBucket(seriesName: string): SeriesAlphabetLetter {
  const trimmed = (seriesName ?? '').trim();
  if (!trimmed) {
    return '#';
  }
  const first = trimmed.charAt(0).toLocaleUpperCase();
  if (first >= 'A' && first <= 'Z') {
    return first as SeriesAlphabetLetter;
  }
  return '#';
}

/**
 * Builds a map of letter → first item index for the current (already sorted) list.
 */
export function buildSeriesLetterIndexMap(seriesNames: readonly string[]): Map<string, number> {
  const map = new Map<string, number>();
  seriesNames.forEach((name, index) => {
    const letter = getSeriesLetterBucket(name);
    if (!map.has(letter)) {
      map.set(letter, index);
    }
  });
  return map;
}

/**
 * When the exact letter has no series, pick the nearest available letter on the rail.
 */
export function resolveNearestLetter(
  letter: string,
  available: ReadonlySet<string>,
  orderedLetters: readonly string[] = SERIES_ALPHABET_LETTERS
): string | null {
  if (available.has(letter)) {
    return letter;
  }
  const start = orderedLetters.indexOf(letter);
  if (start < 0) {
    return null;
  }
  for (let dist = 1; dist < orderedLetters.length; dist++) {
    const up = orderedLetters[start - dist];
    const down = orderedLetters[start + dist];
    // Prefer the earlier letter on ties so name-asc jumps land at the prior bucket.
    if (up && available.has(up)) {
      return up;
    }
    if (down && available.has(down)) {
      return down;
    }
  }
  return null;
}
