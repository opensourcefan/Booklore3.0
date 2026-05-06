import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {BookStateService} from './book-state.service';
import {Book} from '../model/book.model';

function createBook(id: number, title = `Book ${id}`): Book {
  return {
    id,
    libraryId: 1,
    libraryName: 'Library',
    metadata: {
      title,
    },
  } as Book;
}

describe('BookStateService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BookStateService],
    });
  });

  function createService(): BookStateService {
    return TestBed.inject(BookStateService);
  }

  it('manages the full-state books array with getBookById', () => {
    const service = createService();
    const book1 = createBook(1, 'Book One');
    const book2 = createBook(2, 'Book Two');

    service.setBooks([book1, book2]);

    expect(service.getBookById(1)?.metadata?.title).toBe('Book One');
    expect(service.getBookById(2)?.metadata?.title).toBe('Book Two');
    expect(service.getBookById(999)).toBeUndefined();
  });

  it('retrieves multiple books with getBooksByIds maintaining order', () => {
    const service = createService();
    const books = [createBook(10), createBook(20), createBook(30)];

    service.setBooks(books);

    expect(service.getBooksByIds([30, 10, 30]).map(b => b.id)).toEqual([30, 10]);
  });

  it('replaces individual book with replaceBook', () => {
    const service = createService();
    const original = createBook(5, 'Original Title');
    service.setBooks([original]);

    const updated = createBook(5, 'Updated Title');
    service.replaceBook(updated);

    expect(service.getBookById(5)?.metadata?.title).toBe('Updated Title');
  });

  it('replaces book metadata with replaceBookMetadata', () => {
    const service = createService();
    const book = createBook(7, 'Original Title');
    service.setBooks([book]);

    const newMetadata = {title: 'New Title', author: 'New Author'};
    service.replaceBookMetadata(7, newMetadata);

    expect(service.getBookById(7)?.metadata?.title).toBe('New Title');
    expect(service.getBookById(7)?.metadata?.author).toBe('New Author');
  });

  it('patches book cover updates with patchBookCoverUpdates', () => {
    const service = createService();
    const book = createBook(3);
    book.metadata = {title: 'Book', coverUpdatedOn: '2024-01-01'};
    service.setBooks([book]);

    service.patchBookCoverUpdates([{id: 3, coverUpdatedOn: '2024-12-15'}]);

    expect(service.getBookById(3)?.metadata?.coverUpdatedOn).toBe('2024-12-15');
  });

  it('inserts or updates book with upsertBook', () => {
    const service = createService();
    const existing = createBook(4, 'Existing');
    service.setBooks([existing]);

    const newBook = createBook(5, 'New Book');
    service.upsertBook(newBook);

    expect(service.getBookById(4)?.metadata?.title).toBe('Existing');
    expect(service.getBookById(5)?.metadata?.title).toBe('New Book');

    const updated = createBook(4, 'Updated Existing');
    service.upsertBook(updated);

    expect(service.getBookById(4)?.metadata?.title).toBe('Updated Existing');
  });

  it('removes books with removeBooks', () => {
    const service = createService();
    const books = [createBook(1), createBook(2), createBook(3)];
    service.setBooks(books);

    service.removeBooks([2]);

    expect(service.getBookById(1)?.id).toBe(1);
    expect(service.getBookById(2)).toBeUndefined();
    expect(service.getBookById(3)?.id).toBe(3);
  });

  it('updates book state with updateBookState', () => {
    const service = createService();

    service.updateBookState({
      books: [createBook(100)],
      loaded: true,
      error: null,
    });

    expect(service.getBookById(100)?.id).toBe(100);

    service.updateBookState({
      books: null,
      loaded: false,
      error: 'Loading failed',
    });

    expect(service.getCurrentBookState().error).toBe('Loading failed');
  });
});