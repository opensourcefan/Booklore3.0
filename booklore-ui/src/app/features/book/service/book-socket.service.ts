import {inject, Injectable} from '@angular/core';
import {BookStateService} from './book-state.service';
import {Book, BookMetadata} from '../model/book.model';
import {SidebarBadgeRefreshService} from './sidebar-badge-refresh.service';

@Injectable({
  providedIn: 'root',
})
export class BookSocketService {
  private bookStateService = inject(BookStateService);
  private sidebarBadgeRefresh = inject(SidebarBadgeRefreshService);

  handleNewlyCreatedBook(book: Book): void {
    this.bookStateService.upsertBookAndInvalidatePagedCaches(book);
    this.sidebarBadgeRefresh.requestRefresh();
  }

  handleRemovedBookIds(removedBookIds: number[]): void {
    this.bookStateService.removeBooksAndInvalidatePagedCaches(removedBookIds);
    if (removedBookIds.length > 0) {
      this.sidebarBadgeRefresh.requestRefresh();
    }
  }

  handleBookUpdate(updatedBook: Book): void {
    const existingBook = this.bookStateService.getBookById(updatedBook.id);
    this.bookStateService.replaceBookAcrossState(updatedBook);

    if (this.affectsSidebarCounts(existingBook, updatedBook)) {
      this.sidebarBadgeRefresh.requestRefresh();
    }
  }

  handleMultipleBookUpdates(updatedBooks: Book[]): void {
    const shouldRefresh = updatedBooks.some(updatedBook => this.affectsSidebarCounts(this.bookStateService.getBookById(updatedBook.id), updatedBook));

    updatedBooks.forEach(book => this.bookStateService.replaceBookAcrossState(book));

    if (shouldRefresh) {
      this.sidebarBadgeRefresh.requestRefresh();
    }
  }

  handleBookMetadataUpdate(bookId: number, updatedMetadata: BookMetadata): void {
    this.bookStateService.replaceBookMetadataAcrossState(bookId, updatedMetadata);
  }

  handleMultipleBookCoverPatches(patches: { id: number; coverUpdatedOn: string }[]): void {
    this.bookStateService.patchBookCoverUpdatesAcrossState(patches ?? []);
  }

  private affectsSidebarCounts(previousBook: Book | undefined, nextBook: Book): boolean {
    if (!previousBook) {
      return false;
    }

    return previousBook.libraryId !== nextBook.libraryId
      || !!previousBook.isPhysical !== !!nextBook.isPhysical
      || this.normalizeFileType(previousBook.fileType) !== this.normalizeFileType(nextBook.fileType)
      || this.getShelfIds(previousBook).join(',') !== this.getShelfIds(nextBook).join(',');
  }

  private normalizeFileType(fileType?: string): string {
    return (fileType ?? '').trim().toLowerCase();
  }

  private getShelfIds(book: Book): number[] {
    return (book.shelves ?? [])
      .map(shelf => shelf.id)
      .filter((id): id is number => typeof id === 'number')
      .sort((left, right) => left - right);
  }
}
