import {describe, expect, it} from 'vitest';
import {sortBookmarksChronological} from './sort-bookmarks.util';
import {BookMark} from '../service/book-mark.service';

function bm(partial: Partial<BookMark> & Pick<BookMark, 'id' | 'createdAt'>): BookMark {
  return {
    bookId: 1,
    title: 't',
    ...partial,
  };
}

describe('sortBookmarksChronological', () => {
  it('orders oldest to newest', () => {
    const input = [
      bm({id: 2, createdAt: '2026-07-02T00:00:00Z'}),
      bm({id: 1, createdAt: '2026-07-01T00:00:00Z'}),
      bm({id: 3, createdAt: '2026-07-03T00:00:00Z'}),
    ];
    expect(sortBookmarksChronological(input).map(b => b.id)).toEqual([1, 2, 3]);
  });
});
