import {inject, Injectable} from '@angular/core';
import {BookStateService} from './book-state.service';
import {PagedBookBrowserStateService} from './paged-book-browser-state.service';
import {Book, BookMetadata} from '../model/book.model';

@Injectable({
  providedIn: 'root',
})
export class BookSocketService {
  private bookStateService = inject(BookStateService);
  private pagedBookBrowserStateService = inject(PagedBookBrowserStateService);

  handleNewlyCreatedBook(book: Book): void {
    this.bookStateService.upsertBook(book);
    this.pagedBookBrowserStateService.invalidateEntity('ALL_BOOKS');
    this.pagedBookBrowserStateService.invalidateEntity('LIBRARY', book.libraryId);
  }

  handleRemovedBookIds(removedBookIds: number[]): void {
    this.bookStateService.removeBooks(removedBookIds);
    this.pagedBookBrowserStateService.invalidateEntity('ALL_BOOKS');
    this.pagedBookBrowserStateService.invalidateBooks(removedBookIds);
  }

  handleBookUpdate(updatedBook: Book): void {
    this.bookStateService.replaceBook(updatedBook);
    this.pagedBookBrowserStateService.patchBook(updatedBook);
  }

  handleMultipleBookUpdates(updatedBooks: Book[]): void {
    updatedBooks.forEach(book => this.bookStateService.replaceBook(book));
    updatedBooks.forEach(book => this.pagedBookBrowserStateService.patchBook(book));
  }

  handleBookMetadataUpdate(bookId: number, updatedMetadata: BookMetadata): void {
    this.bookStateService.replaceBookMetadata(bookId, updatedMetadata);
    const stateBook = this.bookStateService.getBookById(bookId);
    if (stateBook) {
      this.pagedBookBrowserStateService.patchBook({...stateBook, metadata: updatedMetadata});
    }
  }

  handleMultipleBookCoverPatches(patches: { id: number; coverUpdatedOn: string }[]): void {
    this.bookStateService.patchBookCoverUpdates(patches ?? []);
    patches.forEach(patch => {
      const stateBook = this.bookStateService.getBookById(patch.id);
      if (stateBook && stateBook.metadata) {
        this.pagedBookBrowserStateService.patchBook({
          ...stateBook,
          metadata: {
            ...stateBook.metadata,
            coverUpdatedOn: patch.coverUpdatedOn,
          },
        });
      }
    });
  }
}
