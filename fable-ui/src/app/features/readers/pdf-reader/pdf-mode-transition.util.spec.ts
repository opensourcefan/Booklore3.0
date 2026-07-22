import {describe, expect, it} from 'vitest';
import type {PageViewModeType} from 'ngx-extended-pdf-viewer';

import {needsRelayoutForPageViewModeTransition} from './pdf-mode-transition.util';

describe('needsRelayoutForPageViewModeTransition', () => {
  const allModes: PageViewModeType[] = [
    'single',
    'multiple',
    'infinite-scroll',
    'book',
  ];

  it('returns false when the mode does not change', () => {
    for (const mode of allModes) {
      expect(needsRelayoutForPageViewModeTransition(mode, mode)).toBe(false);
    }
  });

  it('returns false when either side is undefined (defensive)', () => {
    expect(needsRelayoutForPageViewModeTransition(undefined, 'book')).toBe(false);
    expect(needsRelayoutForPageViewModeTransition('book', undefined)).toBe(false);
  });

  it('returns true for every transition INTO Book Mode', () => {
    for (const from of allModes) {
      if (from === 'book') continue;
      expect(needsRelayoutForPageViewModeTransition(from, 'book')).toBe(true);
    }
  });

  it('returns true for every transition OUT OF Book Mode', () => {
    for (const to of allModes) {
      if (to === 'book') continue;
      expect(needsRelayoutForPageViewModeTransition('book', to)).toBe(true);
    }
  });

  it('returns false for non-book ↔ non-book transitions', () => {
    // pdf.js's own scroll-mode logic handles these correctly; adding a
    // relayout on top would cause a visible scroll jump.
    const nonBook = allModes.filter((m) => m !== 'book');
    for (const from of nonBook) {
      for (const to of nonBook) {
        if (from === to) continue;
        expect(needsRelayoutForPageViewModeTransition(from, to)).toBe(false);
      }
    }
  });
});
