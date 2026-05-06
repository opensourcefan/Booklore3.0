import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';
import {Book, BookMetadata} from '../model/book.model';
import {BookState} from '../model/state/book-state.model';

function createDefaultBookState(): BookState {
  return {
    books: null,
    loaded: false,
    error: null,
  };
}

@Injectable({
  providedIn: 'root',
})
export class BookStateService {
  private bookStateSubject = new BehaviorSubject<BookState>(createDefaultBookState());

  public readonly bookState$ = this.bookStateSubject.asObservable();

  getCurrentBookState(): BookState {
    return this.bookStateSubject.value;
  }

  updateBookState(state: Partial<BookState>): void {
    const currentState = this.getCurrentBookState();
    const hasBooks = Object.prototype.hasOwnProperty.call(state, 'books');
    const hasLoaded = Object.prototype.hasOwnProperty.call(state, 'loaded');
    const hasError = Object.prototype.hasOwnProperty.call(state, 'error');

    this.bookStateSubject.next({
      books: hasBooks ? state.books ?? null : currentState.books,
      loaded: hasLoaded ? state.loaded ?? false : currentState.loaded,
      error: hasError ? state.error ?? null : currentState.error,
    });
  }

  resetBookState(): void {
    this.bookStateSubject.next({
      ...createDefaultBookState(),
      loaded: true,
    });
  }

  /**
   * Get a book by ID from the legacy full-state array only.
   * For paged cache lookups, use PagedBookBrowserStateService directly.
   */
  getBookById(bookId: number): Book | undefined {
    const normalizedId = +bookId;
    return this.getCurrentBookState().books?.find(book => +book.id === normalizedId);
  }

  /**
   * Get books by IDs from the legacy full-state array only.
   * For paged cache lookups, use PagedBookBrowserStateService directly.
   */
  getBooksByIds(bookIds: number[]): Book[] {
    if (bookIds.length === 0) {
      return [];
    }

    const booksById = new Map<number, Book>();
    for (const book of this.getCurrentBookState().books ?? []) {
      booksById.set(+book.id, book);
    }

    const orderedBooks: Book[] = [];
    const seen = new Set<number>();

    for (const rawId of bookIds) {
      const id = +rawId;
      if (seen.has(id)) {
        continue;
      }

      const book = booksById.get(id);
      if (book) {
        orderedBooks.push(book);
        seen.add(id);
      }
    }

    return orderedBooks;
  }

  /**
   * Replace a book in the legacy full-state array (if present).
   * This does NOT affect paged cache - PagedBookBrowserStateService manages paged updates.
   */
  replaceBook(updatedBook: Book): void {
    const currentState = this.getCurrentBookState();
    const nextBooks = currentState.books?.map(book => {
      if (book.id !== updatedBook.id) {
        return book;
      }
      return updatedBook;
    }) ?? null;

    if (nextBooks === currentState.books) {
      return;
    }

    this.updateBookState({books: nextBooks});
  }

  /**
   * Replace a book's metadata in the legacy full-state array (if present).
   * This does NOT affect paged cache - PagedBookBrowserStateService manages paged updates.
   */
  replaceBookMetadata(bookId: number, updatedMetadata: BookMetadata): void {
    const currentState = this.getCurrentBookState();
    let didChange = false;

    const nextBooks = currentState.books?.map(book => {
      if (book.id !== bookId) {
        return book;
      }

      didChange = true;
      return {...book, metadata: updatedMetadata};
    }) ?? null;

    if (!didChange) {
      return;
    }

    this.updateBookState({books: nextBooks});
  }

  /**
   * Patch book cover updates in the legacy full-state array (if present).
   * This does NOT affect paged cache - PagedBookBrowserStateService manages paged updates.
   */
  patchBookCoverUpdates(patches: { id: number; coverUpdatedOn: string }[]): void {
    if (patches.length === 0) {
      return;
    }

    const patchMap = new Map(patches.map(patch => [patch.id, patch.coverUpdatedOn]));
    let didChange = false;

    const nextBooks = this.getCurrentBookState().books?.map(book => {
      const coverUpdatedOn = patchMap.get(book.id);
      if (!coverUpdatedOn || !book.metadata) {
        return book;
      }

      didChange = true;
      return {
        ...book,
        metadata: {
          ...book.metadata,
          coverUpdatedOn,
        },
      };
    }) ?? null;

    if (!didChange) {
      return;
    }

    this.updateBookState({books: nextBooks});
  }

  /**
   * Upsert a book into the legacy full-state array.
   * This does NOT affect paged cache - PagedBookBrowserStateService manages paged updates.
   * This is primarily used during library import/rescan workflows.
   */
  upsertBook(book: Book): void {
    const currentState = this.getCurrentBookState();
    const currentBooks = currentState.books ?? [];
    const existingIndex = currentBooks.findIndex(existingBook => existingBook.id === book.id);
    const nextBooks = [...currentBooks];

    if (existingIndex > -1) {
      nextBooks[existingIndex] = book;
    } else {
      nextBooks.push(book);
    }

    this.updateBookState({books: nextBooks});
  }

  /**
   * Remove books from the legacy full-state array by ID.
   * This does NOT affect paged cache - PagedBookBrowserStateService manages paged updates.
   */
  removeBooks(bookIds: number[]): void {
    if (bookIds.length === 0) {
      return;
    }

    const currentState = this.getCurrentBookState();
    const idSet = new Set(bookIds.map(id => +id));
    const nextBooks = (currentState.books ?? []).filter(book => !idSet.has(book.id));

    if (nextBooks.length === (currentState.books?.length ?? 0)) {
      return; // No change
    }

    this.updateBookState({books: nextBooks});
  }

  /**
   * Replace entire book array (used during full state loads or resets).
   */
  setBooks(books: Book[] | null): void {
    this.updateBookState({books});
  }
}
