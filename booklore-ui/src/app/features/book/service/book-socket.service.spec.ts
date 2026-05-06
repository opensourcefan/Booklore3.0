import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {of} from 'rxjs';
import {Book, BookMetadata} from '../model/book.model';
import {BookSocketService} from './book-socket.service';
import {BookStateService} from './book-state.service';
import {PagedBookBrowserStateService} from './paged-book-browser-state.service';
import {BookService} from './book.service';

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

describe('BookSocketService', () => {
  beforeEach(() => {
    const bookServiceMock = {
      getBookByIdFromState: vi.fn(),
      getBooksByIdsFromState: vi.fn(() => []),
      getBookByIdFromAPI: vi.fn((id: number) => of(createBook(id))),
    };

    TestBed.configureTestingModule({
      providers: [
        BookSocketService,
        BookStateService,
        PagedBookBrowserStateService,
        {provide: BookService, useValue: bookServiceMock},
      ],
    });
  });

  function createService(): BookSocketService {
    return TestBed.inject(BookSocketService);
  }

  function getBookStateService(): BookStateService {
    return TestBed.inject(BookStateService);
  }

  it('upserts new book to legacy state and triggers paged cache invalidation', () => {
    const socketService = createService();
    const stateService = getBookStateService();

    stateService.setBooks([createBook(11, 'Existing Book', 1)]);

    socketService.handleNewlyCreatedBook(createBook(22, 'New Book', 1));

    expect(stateService.getBookById(11)?.id).toBe(11);
    expect(stateService.getBookById(22)?.id).toBe(22);
  });

  it('removes books from legacy state and triggers paged cache invalidation', () => {
    const socketService = createService();
    const stateService = getBookStateService();

    stateService.setBooks([
      createBook(11, 'Library One', 1),
      createBook(22, 'Library Two', 2),
    ]);

    socketService.handleRemovedBookIds([11, 22]);

    expect(stateService.getBookById(11)).toBeUndefined();
    expect(stateService.getBookById(22)).toBeUndefined();
  });

  it('patches books in legacy state and paged cache', () => {
    const socketService = createService();
    const stateService = getBookStateService();

    stateService.setBooks([createBook(44, 'Old Title', 1)]);

    socketService.handleBookUpdate(createBook(44, 'New Title', 1));

    expect(stateService.getBookById(44)?.metadata?.title).toBe('New Title');
  });

  it('patches metadata updates in legacy state', () => {
    const socketService = createService();
    const stateService = getBookStateService();

    stateService.setBooks([createBook(77, 'Original Title', 1)]);

    const newMetadata: BookMetadata = {title: 'Updated Title'};
    socketService.handleBookMetadataUpdate(77, newMetadata);

    expect(stateService.getBookById(77)?.metadata?.title).toBe('Updated Title');
  });

  it('handles multiple book updates across legacy state and paged cache', () => {
    const socketService = createService();
    const stateService = getBookStateService();

    stateService.setBooks([
      createBook(10, 'Book 10', 1),
      createBook(20, 'Book 20', 1),
    ]);

    socketService.handleMultipleBookUpdates([
      createBook(10, 'Updated Book 10', 1),
      createBook(20, 'Updated Book 20', 1),
    ]);

    expect(stateService.getBookById(10)?.metadata?.title).toBe('Updated Book 10');
    expect(stateService.getBookById(20)?.metadata?.title).toBe('Updated Book 20');
  });

  it('patches book cover updates in legacy state', () => {
    const socketService = createService();
    const stateService = getBookStateService();

    const book = createBook(33);
    book.metadata = {title: 'Book', coverUpdatedOn: '2024-01-01'};
    stateService.setBooks([book]);

    socketService.handleMultipleBookCoverPatches([
      {id: 33, coverUpdatedOn: '2024-12-15'},
    ]);

    expect(stateService.getBookById(33)?.metadata?.coverUpdatedOn).toBe('2024-12-15');
  });
});