import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it} from 'vitest';
import {Book, BookMetadata} from '../model/book.model';
import {PagedBookBrowserCacheEntry} from '../model/state/paged-book-browser-state.model';
import {BookSocketService} from './book-socket.service';
import {BookStateService} from './book-state.service';

function createBook(id: number, title = `Book ${id}`, libraryId = 1): Book {
  return {
    id,
    libraryId,
    libraryName: `Library ${libraryId}`,
    metadata: {
      bookId: id,
      title,
    },
  } as Book;
}

function createMetadata(bookId: number, title: string, coverUpdatedOn?: string): BookMetadata {
  return {
    bookId,
    title,
    coverUpdatedOn,
  };
}

function createCacheEntry(
  entity: 'ALL_BOOKS' | 'LIBRARY',
  entityId: number | null,
  books: Book[],
  totalElements = books.length
): PagedBookBrowserCacheEntry {
  return {
    key: {
      entity,
      entityId,
      viewMode: 'grid',
      page: 0,
      size: 80,
      sorts: ['addedOn,desc'],
      filterMode: 'and',
      search: null,
      filters: {},
    },
    status: 'loaded',
    page: {
      content: books,
      page: 0,
      size: 80,
      totalElements,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    },
    error: null,
    loadedAt: Date.now(),
    fallbackReason: null,
  };
}

describe('BookSocketService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [BookSocketService, BookStateService],
    });
  });

  function createServices() {
    return {
      socketService: TestBed.inject(BookSocketService),
      bookStateService: TestBed.inject(BookStateService),
    };
  }

  it('invalidates all-books and matching library caches when a new book arrives', () => {
    const {socketService, bookStateService} = createServices();

    bookStateService.updateBookState({
      books: [createBook(11, 'Existing Book', 1)],
      loaded: true,
      error: null,
    });

    bookStateService.setPagedCache({
      allBooks: createCacheEntry('ALL_BOOKS', null, [createBook(11, 'Existing Book', 1)], 10),
      matchingLibrary: createCacheEntry('LIBRARY', 1, [createBook(11, 'Existing Book', 1)], 4),
      otherLibrary: createCacheEntry('LIBRARY', 9, [createBook(99, 'Other Library Book', 9)], 2),
    });

    socketService.handleNewlyCreatedBook(createBook(22, 'New Book', 1));

    const state = bookStateService.getCurrentBookState();

    expect(state.books?.map(book => book.id)).toEqual([11, 22]);
    expect(Object.keys(state.pagedCache ?? {})).toEqual(['otherLibrary']);
    expect(state.totalCount).toBe(2);
  });

  it('invalidates impacted caches when books are removed', () => {
    const {socketService, bookStateService} = createServices();

    bookStateService.updateBookState({
      books: [createBook(11, 'Library One', 1), createBook(22, 'Library Two', 2)],
      loaded: true,
      error: null,
    });

    bookStateService.setPagedCache({
      allBooks: createCacheEntry('ALL_BOOKS', null, [createBook(11, 'Library One', 1)], 10),
      libraryOne: createCacheEntry('LIBRARY', 1, [createBook(11, 'Library One', 1)], 5),
      libraryTwo: createCacheEntry('LIBRARY', 2, [createBook(22, 'Library Two', 2)], 5),
      otherLibrary: createCacheEntry('LIBRARY', 9, [createBook(99, 'Other Library Book', 9)], 2),
    });

    socketService.handleRemovedBookIds([11, 22]);

    const state = bookStateService.getCurrentBookState();

    expect(state.books).toEqual([]);
    expect(Object.keys(state.pagedCache ?? {})).toEqual(['otherLibrary']);
    expect(state.totalCount).toBe(0);
  });

  it('patches cached pages in place for realtime book updates', () => {
    const {socketService, bookStateService} = createServices();

    bookStateService.updateBookState({
      books: [createBook(44, 'Old Title', 1)],
      loaded: true,
      error: null,
    });

    bookStateService.setPagedCache({
      allBooks: createCacheEntry('ALL_BOOKS', null, [createBook(44, 'Old Title', 1)], 12),
    });

    socketService.handleBookUpdate(createBook(44, 'New Title', 1));

    const state = bookStateService.getCurrentBookState();

    expect(state.books?.[0].metadata?.title).toBe('New Title');
    expect(state.pagedCache?.['allBooks']?.page?.content[0].metadata?.title).toBe('New Title');
    expect(state.totalCount).toBe(12);
  });

  it('patches metadata and cover updates without clearing the paged cache', () => {
    const {socketService, bookStateService} = createServices();
    const initialBook = {
      ...createBook(77, 'Original Title', 1),
      metadata: createMetadata(77, 'Original Title', '2024-01-01T00:00:00Z'),
    };

    bookStateService.updateBookState({
      books: [initialBook],
      loaded: true,
      error: null,
    });

    bookStateService.setPagedCache({
      allBooks: createCacheEntry('ALL_BOOKS', null, [initialBook], 6),
    });

    socketService.handleBookMetadataUpdate(77, createMetadata(77, 'Updated Title', '2024-01-01T00:00:00Z'));
    socketService.handleMultipleBookCoverPatches([{id: 77, coverUpdatedOn: '2025-05-05T12:00:00Z'}]);

    const state = bookStateService.getCurrentBookState();

    expect(state.books?.[0].metadata?.title).toBe('Updated Title');
    expect(state.books?.[0].metadata?.coverUpdatedOn).toBe('2025-05-05T12:00:00Z');
    expect(state.pagedCache?.['allBooks']?.page?.content[0].metadata?.title).toBe('Updated Title');
    expect(state.pagedCache?.['allBooks']?.page?.content[0].metadata?.coverUpdatedOn).toBe('2025-05-05T12:00:00Z');
    expect(state.totalCount).toBe(6);
  });
});