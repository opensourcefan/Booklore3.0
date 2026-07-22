import {CommonModule} from '@angular/common';
import {Component, EventEmitter, Input, Output} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';
import {BookMark} from '../../../../shared/service/book-mark.service';
import {GhostClickGuard, shouldDismissOverlay} from '../../../../shared/util/overlay-dismiss.util';
import {ReaderIconComponent} from '../../ebook-reader/shared/icon.component';
import {parsePageCfi} from '../../../../shared/util/page-cfi.util';

export type PdfSidebarTab = 'pages' | 'bookmarks';

export interface PdfSidebarBookInfo {
  title: string;
  authors: string;
  coverUrl: string | null;
}

export interface PdfSidebarPage {
  pageNumber: number;
  displayName: string;
}

@Component({
  selector: 'app-pdf-sidebar',
  standalone: true,
  imports: [CommonModule, TranslocoPipe, ReaderIconComponent],
  templateUrl: './pdf-sidebar.component.html',
  styleUrl: './pdf-sidebar.component.scss',
})
export class PdfSidebarComponent {
  @Input() isOpen = false;
  @Input() closing = false;
  @Input() activeTab: PdfSidebarTab = 'bookmarks';
  @Input() bookInfo: PdfSidebarBookInfo = {title: '', authors: '', coverUrl: null};
  @Input() pages: PdfSidebarPage[] = [];
  @Input() bookmarks: BookMark[] = [];
  @Input() currentPage = 1;

  @Output() dismiss = new EventEmitter<Event | void>();
  @Output() tabChange = new EventEmitter<PdfSidebarTab>();
  @Output() pageSelect = new EventEmitter<number>();
  @Output() bookmarkSelect = new EventEmitter<number>();
  @Output() bookmarkDelete = new EventEmitter<number>();
  @Output() quickAddBookmark = new EventEmitter<void>();

  private readonly dismissGuard = new GhostClickGuard();

  armDismissGuard(): void {
    this.dismissGuard.arm();
  }

  onOverlayDismiss(event?: Event): void {
    if (event && !shouldDismissOverlay(event, this.dismissGuard)) {
      return;
    }
    this.dismiss.emit(event);
  }

  setActiveTab(tab: PdfSidebarTab): void {
    this.tabChange.emit(tab);
  }

  onPageClick(pageNumber: number): void {
    this.pageSelect.emit(pageNumber);
  }

  onBookmarkClick(cfi: string | undefined): void {
    const page = parsePageCfi(cfi);
    if (page != null) {
      this.bookmarkSelect.emit(page);
    }
  }

  onDeleteBookmark(event: MouseEvent, bookmarkId: number): void {
    event.stopPropagation();
    this.bookmarkDelete.emit(bookmarkId);
  }

  onQuickAddBookmark(event: MouseEvent): void {
    event.stopPropagation();
    this.quickAddBookmark.emit();
  }

  isPageActive(pageNumber: number): boolean {
    return pageNumber === this.currentPage;
  }

  bookmarkPageLabel(cfi: string | undefined): string {
    const page = parsePageCfi(cfi);
    return page != null ? String(page) : '';
  }
}
