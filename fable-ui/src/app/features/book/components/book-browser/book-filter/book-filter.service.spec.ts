import {beforeEach, describe, expect, it} from 'vitest';
import {BookFilterService} from './book-filter.service';
import {EntityType} from '../book-browser.component';
import {Book} from '../../../model/book.model';

describe('BookFilterService.filterBooksByEntity', () => {
  let service: BookFilterService;

  beforeEach(() => {
    service = Object.create(BookFilterService.prototype) as BookFilterService;
  });

  const books = [
    {id: 1, libraryId: 1, libraryName: 'A', staged: true, shelves: []} as Book,
    {id: 2, libraryId: 1, libraryName: 'A', staged: false, shelves: []} as Book,
    {id: 3, libraryId: 1, libraryName: 'A', staged: true, shelves: [{id: 9, name: 'S'}]} as Book,
  ];

  it('scopes Staging facets to staged books only', () => {
    const result = service.filterBooksByEntity(books, null, EntityType.STAGING);
    expect(result.map(book => book.id)).toEqual([1, 3]);
  });

  it('scopes Not Shelfed facets to unshelved books', () => {
    const result = service.filterBooksByEntity(books, null, EntityType.NOT_SHELFED);
    expect(result.map(book => book.id)).toEqual([1, 2]);
  });

  it('returns all books for All Books when entity is null', () => {
    const result = service.filterBooksByEntity(books, null, EntityType.ALL_BOOKS);
    expect(result.map(book => book.id)).toEqual([1, 2, 3]);
  });
});
