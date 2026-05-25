import {inject, Injectable, Injector} from '@angular/core';
import {BookStateService} from './book-state.service';
import {Book, BookMetadata} from '../model/book.model';
import {SidebarBadgeRefreshService} from './sidebar-badge-refresh.service';
import {PagedBookBrowserStateService} from './paged-book-browser-state.service';
import {PagedGridPilotService} from './paged-grid-pilot.service';

@Injectable({
  providedIn: 'root',
})
export class BookSocketService {
  private bookStateService = inject(BookStateService);
  private sidebarBadgeRefresh = inject(SidebarBadgeRefreshService);
  private injector = inject(Injector);

  handleNewlyCreatedBook(book: Book): void {
    this.bookStateService.upsertBookAndInvalidatePagedCaches(book);
    const pagedBookBrowserStateService = this.injector.get(PagedBookBrowserStateService);
    const pagedGridPilotService = this.injector.get(PagedGridPilotService);
    pagedBookBrowserStateService.syncCacheFromSharedState();
    pagedGridPilotService.refreshActiveState();
    this.sidebarBadgeRefresh.requestRefresh();
  }

  handleRemovedBookIds(removedBookIds: number[]): void {
    this.bookStateService.removeBooksAndInvalidatePagedCaches(removedBookIds);
    const pagedBookBrowserStateService = this.injector.get(PagedBookBrowserStateService);
    const pagedGridPilotService = this.injector.get(PagedGridPilotService);
    pagedBookBrowserStateService.syncCacheFromSharedState();
    pagedGridPilotService.refreshActiveState();
    if (removedBookIds.length > 0) {
      this.sidebarBadgeRefresh.requestRefresh();
    }
  }

  handleBookUpdate(updatedBook: Book): void {
    const existingBook = this.bookStateService.getBookById(updatedBook.id);
    this.bookStateService.replaceBookAcrossState(updatedBook);

    const pagedBookBrowserStateService = this.injector.get(PagedBookBrowserStateService);
    const pagedGridPilotService = this.injector.get(PagedGridPilotService);
    pagedBookBrowserStateService.syncCacheFromSharedState();
    pagedGridPilotService.refreshActiveState();

    if (this.affectsSidebarCounts(existingBook, updatedBook)) {
      this.sidebarBadgeRefresh.requestRefresh();
    }
  }

  handleMultipleBookUpdates(updatedBooks: Book[]): void {
    const shouldRefresh = updatedBooks.some(updatedBook => this.affectsSidebarCounts(this.bookStateService.getBookById(updatedBook.id), updatedBook));

    updatedBooks.forEach(book => this.bookStateService.replaceBookAcrossState(book));

    const pagedBookBrowserStateService = this.injector.get(PagedBookBrowserStateService);
    const pagedGridPilotService = this.injector.get(PagedGridPilotService);
    pagedBookBrowserStateService.syncCacheFromSharedState();
    pagedGridPilotService.refreshActiveState();

    if (shouldRefresh) {
      this.sidebarBadgeRefresh.requestRefresh();
    }
  }

  handleBookMetadataUpdate(bookId: number, updatedMetadata: BookMetadata): void {
    this.bookStateService.replaceBookMetadataAcrossState(bookId, updatedMetadata);
  }

  handleMultipleBookCoverPatches(patches: { id: number; coverUpdatedOn: string }[]): void {
    this.bookStateService.patchBookCoverUpdatesAcrossState(patches ?? []);
    // Sync the updated paged cache so the paged grid pilot can re-emit
    // with the new coverUpdatedOn timestamps. Without this, the paged grid
    // pilot's own bookStateSubject never reflects cover changes, and
    // OnPush book-card components never recompute their cover URLs.
    // Use Injector for lazy resolution to avoid a circular dependency:
    // BookSocketService → PagedGridPilotService → BookService → BookSocketService
    const pagedBookBrowserStateService = this.injector.get(PagedBookBrowserStateService);
    const pagedGridPilotService = this.injector.get(PagedGridPilotService);
    pagedBookBrowserStateService.syncCacheFromSharedState();
    pagedGridPilotService.refreshActiveState();
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
