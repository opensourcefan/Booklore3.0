import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit} from '@angular/core';
import {ActivatedRoute, Router, RouterLink, UrlTree} from '@angular/router';
import {NgClass} from '@angular/common';
import {CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem} from '@angular/cdk/drag-drop';
import {ConfirmationService, MenuItem, MessageService} from 'primeng/api';
import {ConfirmDialog} from 'primeng/confirmdialog';
import {ToastModule} from 'primeng/toast';
import {Button} from 'primeng/button';
import {Tooltip} from 'primeng/tooltip';
import {FormsModule} from '@angular/forms';
import {Select} from 'primeng/select';
import {TieredMenu} from 'primeng/tieredmenu';

import {StoryArcService} from '../../service/story-arc.service';
import {StoryArcBookMapping, StoryArcLayoutUpdateRequest} from '../../model/story-arc.model';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {PageTitleService} from '../../../../shared/service/page-title.service';
import {BookPatchService} from '../../../book/service/book-patch.service';
import {Book, ReadStatus} from '../../../book/model/book.model';

interface StoryArcRow {
  title: string;
  items: StoryArcBookMapping[];
}

@Component({
  selector: 'app-story-arc-page',
  standalone: true,
  templateUrl: './story-arc-page.component.html',
  styleUrls: ['./story-arc-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgClass,
    RouterLink,
    FormsModule,
    DragDropModule,
    ToastModule,
    ConfirmDialog,
    Button,
    Tooltip,
    Select,
    TieredMenu
  ],
  providers: [MessageService, ConfirmationService]
})
export class StoryArcPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private storyArcService = inject(StoryArcService);
  private urlHelper = inject(UrlHelperService);
  private pageTitle = inject(PageTitleService);
  private bookPatchService = inject(BookPatchService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private cdr = inject(ChangeDetectorRef);

  arcName = '';
  rows: StoryArcRow[] = [];
  loading = true;
  isEditMode = false;
  externalUrl = '';
  summaryDescription = '';
  fetchingMetadata = false;
  backupRows: StoryArcRow[] = [];
  backupExternalUrl = '';
  backupSummaryDescription = '';
  selectedMoveCard: { rowIndex: number; colIndex: number; item: StoryArcBookMapping } | null = null;

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const name = params.get('arcName');
      if (name) {
        this.arcName = decodeURIComponent(name);
        this.pageTitle.setPageTitle(this.arcName);
        this.loadLayout();
      }
    });
  }


  loadLayout(silent = false): void {
    if (!silent) {
      this.loading = true;
      this.cdr.markForCheck();
    }

    this.storyArcService.getStoryArc(this.arcName).subscribe({
      next: (mappings) => {
        this.buildRowsFromMappings(mappings);
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.messageService.add({severity: 'error', summary: 'Error', detail: 'Failed to load story arc'});
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  buildRowsFromMappings(mappings: StoryArcBookMapping[]): void {
    const firstMeta = mappings.find(m => m.externalUrl || m.description);
    if (firstMeta) {
      this.externalUrl = firstMeta.externalUrl || '';
      this.summaryDescription = firstMeta.description || '';
    }

    const existingEmptyRows = new Map<number, string>();
    this.rows.forEach((row, index) => {
      if (row.items.length === 0 && row.title) {
        existingEmptyRows.set(index, row.title);
      }
    });

    const rowMap = new Map<number, { title: string; items: StoryArcBookMapping[] }>();

    mappings.forEach(m => {
      const rIdx = m.rowIndex ?? 0;
      if (!rowMap.has(rIdx)) {
        rowMap.set(rIdx, {
          title: m.rowTitle || `Chapter ${rIdx + 1}`,
          items: []
        });
      }
      rowMap.get(rIdx)!.items.push(m);
    });

    existingEmptyRows.forEach((title, rIdx) => {
      if (!rowMap.has(rIdx)) {
        rowMap.set(rIdx, { title, items: [] });
      }
    });

    const sortedRowIndices = Array.from(rowMap.keys()).sort((a, b) => a - b);
    this.rows = sortedRowIndices.map(rIdx => {
      const row = rowMap.get(rIdx)!;
      row.items.sort((a, b) => (a.colIndex ?? 0) - (b.colIndex ?? 0));
      return row;
    });

    if (this.rows.length === 0) {
      this.rows = [{ title: 'Chapter 1', items: [] }];
    }
  }

  toggleEditMode(): void {
    if (!this.isEditMode) {
      this.backupRows = JSON.parse(JSON.stringify(this.rows));
      this.backupExternalUrl = this.externalUrl;
      this.backupSummaryDescription = this.summaryDescription;
      this.isEditMode = true;
    } else {
      this.saveLayout();
      this.isEditMode = false;
    }
    this.cdr.markForCheck();
  }

  cancelEdit(): void {
    if (this.backupRows && this.backupRows.length > 0) {
      this.rows = JSON.parse(JSON.stringify(this.backupRows));
    }
    this.externalUrl = this.backupExternalUrl;
    this.summaryDescription = this.backupSummaryDescription;
    this.selectedMoveCard = null;
    this.isEditMode = false;
    this.saveLayout();
    this.cdr.markForCheck();
  }

  clearSummaryContainer(): void {
    this.externalUrl = '';
    this.summaryDescription = '';
    if (!this.isEditMode) {
      this.saveLayout();
    }
    this.cdr.markForCheck();
  }

  onRowDrop(event: CdkDragDrop<StoryArcRow[]>): void {
    moveItemInArray(this.rows, event.previousIndex, event.currentIndex);
    this.saveLayout();
  }

  moveRowOrder(rowIndex: number, direction: 'up' | 'down'): void {
    if (direction === 'up' && rowIndex > 0) {
      moveItemInArray(this.rows, rowIndex, rowIndex - 1);
      this.saveLayout();
    } else if (direction === 'down' && rowIndex < this.rows.length - 1) {
      moveItemInArray(this.rows, rowIndex, rowIndex + 1);
      this.saveLayout();
    }
  }

  onDrop(event: CdkDragDrop<StoryArcBookMapping[]>): void {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
    } else {
      transferArrayItem(
        event.previousContainer.data,
        event.container.data,
        event.previousIndex,
        event.currentIndex
      );
    }
    this.saveLayout();
  }

  saveLayout(): void {
    const items: StoryArcLayoutUpdateRequest['items'] = [];
    let sequence = 1;

    this.rows.forEach((row, rIndex) => {
      row.items.forEach((item, cIndex) => {
        items.push({
          bookId: item.bookId,
          rowIndex: rIndex,
          colIndex: cIndex,
          sequenceOrder: sequence++,
          isCore: item.isCore,
          rowTitle: row.title,
          externalUrl: this.externalUrl,
          description: this.summaryDescription
        });
      });
    });

    this.storyArcService.saveLayout(this.arcName, {
      storyArcName: this.arcName,
      externalUrl: this.externalUrl,
      description: this.summaryDescription,
      items
    }).subscribe({
      next: () => {
        this.loadLayout(true);
      }
    });
  }

  addRow(): void {
    this.rows.push({
      title: `Chapter ${this.rows.length + 1}`,
      items: []
    });
    this.cdr.markForCheck();
  }

  removeRow(rowIndex: number): void {
    const row = this.rows[rowIndex];
    if (row.items.length > 0) {
      // Put items back into the previous row or row 0
      const targetIndex = rowIndex > 0 ? rowIndex - 1 : 0;
      this.rows[targetIndex].items.push(...row.items);
    }
    this.rows.splice(rowIndex, 1);
    this.saveLayout();
  }

  removeBook(rowIndex: number, colIndex: number): void {
    const item = this.rows[rowIndex].items[colIndex];
    this.storyArcService.removeBooksFromStoryArc(this.arcName, [item.bookId]).subscribe({
      next: () => {
        this.rows[rowIndex].items.splice(colIndex, 1);
        this.saveLayout();
      },
      error: () => {
        this.messageService.add({severity: 'error', summary: 'Error', detail: 'Failed to remove book'});
      }
    });
  }

  toggleBookCore(rowIndex: number, colIndex: number): void {
    const item = this.rows[rowIndex].items[colIndex];
    item.isCore = !item.isCore;
    this.saveLayout();
  }

  moveItem(rowIndex: number, colIndex: number, direction: 'up' | 'down' | 'left' | 'right'): void {
    const row = this.rows[rowIndex];
    const item = row.items[colIndex];

    if (direction === 'left' && colIndex > 0) {
      row.items.splice(colIndex, 1);
      row.items.splice(colIndex - 1, 0, item);
      this.saveLayout();
    } else if (direction === 'right' && colIndex < row.items.length - 1) {
      row.items.splice(colIndex, 1);
      row.items.splice(colIndex + 1, 0, item);
      this.saveLayout();
    } else if (direction === 'up' && rowIndex > 0) {
      row.items.splice(colIndex, 1);
      this.rows[rowIndex - 1].items.push(item);
      this.saveLayout();
    } else if (direction === 'down' && rowIndex < this.rows.length - 1) {
      row.items.splice(colIndex, 1);
      this.rows[rowIndex + 1].items.push(item);
      this.saveLayout();
    }
  }

  getNextUpBookId(): number | null {
    for (const row of this.rows) {
      for (const item of row.items) {
        if (item.book && item.book.readStatus !== 'READ') {
          return item.bookId;
        }
      }
    }
    return null;
  }

  deleteStoryArc(event?: Event): void {
    this.confirmationService.confirm({
      target: event?.target as EventTarget,
      message: `Are you sure you want to delete the entire story arc "${this.arcName}"?`,
      header: 'Delete Story Arc',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.storyArcService.deleteStoryArc(this.arcName).subscribe({
          next: () => {
            this.router.navigate(['/story-arcs']);
          },
          error: () => {
            this.messageService.add({severity: 'error', summary: 'Error', detail: 'Failed to delete story arc'});
          }
        });
      }
    });
  }

  getThumbnail(bookId: number): string {
    return this.urlHelper.getDirectThumbnailUrl(bookId);
  }

  getBookReadingUrl(book: Book): UrlTree {
    return this.urlHelper.getBookPrimaryReadingUrl(book);
  }

  navigateToBook(book: Book): void {
    this.router.navigate(['/book', book.id], {
      queryParams: { tab: 'view', returnTo: this.router.url }
    });
  }

  getProgressPercentage(book?: Book): number | null {
    if (!book) return null;
    if (book.readStatus === 'READ') return 100;
    if (book.cbxProgress?.percentage) return Math.round(book.cbxProgress.percentage);
    if (book.pdfProgress?.percentage) return Math.round(book.pdfProgress.percentage);
    if (book.epubProgress?.percentage) return Math.round(book.epubProgress.percentage);
    if (book.audiobookProgress?.percentage) return Math.round(book.audiobookProgress.percentage);
    if (book.koreaderProgress?.percentage) return Math.round(book.koreaderProgress.percentage);
    if (book.koboProgress?.percentage) return Math.round(book.koboProgress.percentage);
    return null;
  }

  moveToChapter(fromRowIndex: number, colIndex: number, targetRowIndex: number): void {
    if (fromRowIndex === targetRowIndex || targetRowIndex < 0 || targetRowIndex >= this.rows.length) return;
    const item = this.rows[fromRowIndex].items.splice(colIndex, 1)[0];
    this.rows[targetRowIndex].items.push(item);
    this.saveLayout();
    this.cdr.markForCheck();
  }

  getChapterOptions(): { label: string; value: number }[] {
    return this.rows.map((row, index) => ({
      label: row.title || `Chapter ${index + 1}`,
      value: index
    }));
  }

  pickUpCard(rowIndex: number, colIndex: number): void {
    if (this.selectedMoveCard?.rowIndex === rowIndex && this.selectedMoveCard?.colIndex === colIndex) {
      this.selectedMoveCard = null;
    } else {
      this.selectedMoveCard = {
        rowIndex,
        colIndex,
        item: this.rows[rowIndex].items[colIndex]
      };
    }
    this.cdr.markForCheck();
  }

  cancelMoveCard(): void {
    this.selectedMoveCard = null;
    this.cdr.markForCheck();
  }

  placeCardBefore(targetRowIndex: number, targetColIndex: number): void {
    if (!this.selectedMoveCard) return;

    const { rowIndex, colIndex } = this.selectedMoveCard;
    const movedItem = this.rows[rowIndex].items.splice(colIndex, 1)[0];

    let insertIndex = targetColIndex;
    if (rowIndex === targetRowIndex && colIndex < targetColIndex) {
      insertIndex--;
    }

    this.rows[targetRowIndex].items.splice(insertIndex, 0, movedItem);
    this.selectedMoveCard = null;
    this.saveLayout();
    this.cdr.markForCheck();
  }

  placeCardInChapter(targetRowIndex: number): void {
    if (!this.selectedMoveCard) return;

    const { rowIndex, colIndex } = this.selectedMoveCard;
    const movedItem = this.rows[rowIndex].items.splice(colIndex, 1)[0];

    this.rows[targetRowIndex].items.push(movedItem);
    this.selectedMoveCard = null;
    this.saveLayout();
    this.cdr.markForCheck();
  }

  isCardSelected(rowIndex: number, colIndex: number): boolean {
    return this.selectedMoveCard?.rowIndex === rowIndex && this.selectedMoveCard?.colIndex === colIndex;
  }

  hasDigitalFile(book: Book | undefined): boolean {
    if (!book) return false;
    return !!(book.fileType || book.filePath);
  }

  readBook(event: MouseEvent, book: Book | undefined): void {
    event.stopPropagation();
    if (!book) return;
    this.router.navigateByUrl(this.urlHelper.getBookPrimaryReadingUrl(book));
  }

  getReadStatusClass(book: Book | undefined): string {
    if (!book) return 'read-status-unread';
    switch (book.readStatus) {
      case ReadStatus.READ: return 'read-status-read';
      case ReadStatus.READING: return 'read-status-in-progress';
      default: return 'read-status-unread';
    }
  }

  getReadStatusTooltip(book: Book | undefined): string {
    if (!book) return 'Unread';
    switch (book.readStatus) {
      case ReadStatus.READ: return 'Marked as Read';
      case ReadStatus.READING: return 'In Progress';
      default: return 'Unread';
    }
  }

  getReadStatusIcon(book: Book | undefined): string {
    if (!book) return 'pi pi-circle-off';
    switch (book.readStatus) {
      case ReadStatus.READ: return 'pi pi-check-circle';
      case ReadStatus.READING: return 'pi pi-spinner';
      default: return 'pi pi-circle-off';
    }
  }

  toggleReadStatusMenu(event: Event, menu: TieredMenu, book: Book | undefined): void {
    event.stopPropagation();
    if (!book) return;
    menu.toggle(event);
  }

  getReadStatusMenuItems(book: Book | undefined): MenuItem[] {
    if (!book) return [];
    return [
      {
        label: 'Mark as Read',
        icon: 'pi pi-check-circle',
        command: () => this.setReadStatus(book, ReadStatus.READ)
      },
      {
        label: 'Mark as In Progress',
        icon: 'pi pi-spinner',
        command: () => this.setReadStatus(book, ReadStatus.READING)
      },
      {
        label: 'Mark as Unread',
        icon: 'pi pi-circle-off',
        command: () => this.setReadStatus(book, ReadStatus.UNREAD)
      }
    ];
  }

  setReadStatus(book: Book, status: ReadStatus): void {
    this.bookPatchService.updateBookReadStatus(book.id, status).subscribe({
      next: () => {
        book.readStatus = status;
        this.saveLayout();
        this.cdr.markForCheck();
      }
    });
  }

  fetchWebMetadata(): void {
    if (!this.externalUrl || !this.externalUrl.trim()) return;
    this.fetchingMetadata = true;
    this.storyArcService.fetchWebMetadata(this.externalUrl.trim()).subscribe({
      next: (res) => {
        this.fetchingMetadata = false;
        if (res.scrapedDescription) {
          this.summaryDescription = res.scrapedDescription;
        }
        this.saveLayout();
        this.cdr.markForCheck();
      },
      error: () => {
        this.fetchingMetadata = false;
        this.messageService.add({severity: 'error', summary: 'Error', detail: 'Failed to fetch webpage summary'});
        this.cdr.markForCheck();
      }
    });
  }
}
