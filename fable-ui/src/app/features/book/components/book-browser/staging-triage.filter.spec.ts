import {describe, expect, it} from 'vitest';
import {Book} from '../../model/book.model';
import {filterBooksByStagingTriage} from './staging-triage.filter';

function book(id: number): Book {
  return {id} as Book;
}

describe('filterBooksByStagingTriage', () => {
  const books = [book(1), book(2), book(3), book(4)];
  const inbox = new Set([1, 2]);
  const completed = new Set([3]);
  const review = new Set([4]);

  it('returns all books for staging mode before triage ids load', () => {
    expect(filterBooksByStagingTriage(books, 'staging', new Set(), new Set(), new Set()))
      .toEqual(books);
  });

  it('filters staging inbox after triage loads', () => {
    expect(filterBooksByStagingTriage(books, 'staging', inbox, completed, review).map(b => b.id))
      .toEqual([1, 2]);
  });

  it('filters completed books', () => {
    expect(filterBooksByStagingTriage(books, 'completed', inbox, completed, review).map(b => b.id))
      .toEqual([3]);
  });

  it('filters review books', () => {
    expect(filterBooksByStagingTriage(books, 'review', inbox, completed, review).map(b => b.id))
      .toEqual([4]);
  });

  it('returns empty when the selected bucket has no matching loaded books', () => {
    expect(filterBooksByStagingTriage(books, 'completed', inbox, new Set(), review))
      .toEqual([]);
  });
});
