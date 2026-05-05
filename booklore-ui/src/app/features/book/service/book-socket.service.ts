import {inject, Injectable} from '@angular/core';
import {BookStateService} from './book-state.service';
import {Book, BookMetadata} from '../model/book.model';

@Injectable({
  providedIn: 'root',
})
export class BookSocketService {
  private bookStateService = inject(BookStateService);

  handleNewlyCreatedBook(book: Book): void {
    this.bookStateService.upsertBookAndInvalidatePagedCaches(book);
  }

  handleRemovedBookIds(removedBookIds: number[]): void {
    this.bookStateService.removeBooksAndInvalidatePagedCaches(removedBookIds);
  }

  handleBookUpdate(updatedBook: Book): void {
    this.bookStateService.replaceBookAcrossState(updatedBook);
  }

  handleMultipleBookUpdates(updatedBooks: Book[]): void {
    updatedBooks.forEach(book => this.bookStateService.replaceBookAcrossState(book));
  }

  handleBookMetadataUpdate(bookId: number, updatedMetadata: BookMetadata): void {
    this.bookStateService.replaceBookMetadataAcrossState(bookId, updatedMetadata);
  }

  handleMultipleBookCoverPatches(patches: { id: number; coverUpdatedOn: string }[]): void {
    this.bookStateService.patchBookCoverUpdatesAcrossState(patches ?? []);
  }
}
