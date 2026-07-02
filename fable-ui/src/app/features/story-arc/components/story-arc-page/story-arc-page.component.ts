import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit} from '@angular/core';
import {ActivatedRoute, Router, UrlTree} from '@angular/router';
import {CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem} from '@angular/cdk/drag-drop';
import {ConfirmationService, MessageService} from 'primeng/api';
import {ConfirmDialog} from 'primeng/confirmdialog';
import {ToastModule} from 'primeng/toast';
import {Button} from 'primeng/button';
import {Tooltip} from 'primeng/tooltip';
import {FormsModule} from '@angular/forms';

import {StoryArcService} from '../../service/story-arc.service';
import {StoryArcBookMapping, StoryArcLayoutUpdateRequest} from '../../model/story-arc.model';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {PageTitleService} from '../../../../shared/service/page-title.service';
import {Book} from '../../../book/model/book.model';

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
    FormsModule,
    DragDropModule,
    ToastModule,
    ConfirmDialog,
    Button,
    Tooltip
  ],
  providers: [MessageService, ConfirmationService]
})
export class StoryArcPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private storyArcService = inject(StoryArcService);
  private urlHelper = inject(UrlHelperService);
  private pageTitle = inject(PageTitleService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private cdr = inject(ChangeDetectorRef);

  arcName = '';
  rows: StoryArcRow[] = [];
  loading = true;
  isEditMode = false;

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


  loadLayout(): void {
    this.loading = true;
    this.cdr.markForCheck();

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
    if (mappings.length === 0) {
      this.rows = [{ title: 'Main Arc', items: [] }];
      return;
    }

    // Find the maximum row index
    const maxRow = Math.max(...mappings.map(m => m.rowIndex), 0);
    const newRows: StoryArcRow[] = [];
    for (let i = 0; i <= maxRow; i++) {
      newRows.push({ title: `Row ${i + 1}`, items: [] });
    }

    mappings.forEach(m => {
      if (m.rowIndex >= 0 && m.rowIndex < newRows.length) {
        newRows[m.rowIndex].items.push(m);
      }
    });

    // Sort items in each row by colIndex
    newRows.forEach((row, rowIndex) => {
      row.items.sort((a, b) => a.colIndex - b.colIndex);
      // Set the row title from the first item if available
      const firstItem = row.items[0];
      if (firstItem && firstItem.rowTitle) {
        row.title = firstItem.rowTitle;
      } else {
        row.title = `Chapter ${rowIndex + 1}`;
      }
    });

    this.rows = newRows;
  }

  toggleEditMode(): void {
    this.isEditMode = !this.isEditMode;
    if (!this.isEditMode) {
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

    this.rows.forEach((row, rowIndex) => {
      row.items.forEach((item, colIndex) => {
        items.push({
          bookId: item.bookId,
          rowIndex: rowIndex,
          colIndex: colIndex,
          sequenceOrder: rowIndex * 1000 + colIndex,
          isCore: item.isCore,
          rowTitle: row.title
        });
      });
    });

    this.storyArcService.saveLayout(this.arcName, {
      storyArcName: this.arcName,
      items
    }).subscribe({
      next: () => {
        this.messageService.add({severity: 'success', summary: 'Saved', detail: 'Layout coordinates persisted'});
        this.loadLayout(); // Reload to refresh DTO mappings/order
      },
      error: () => {
        this.messageService.add({severity: 'error', summary: 'Error', detail: 'Failed to persist layout coordinates'});
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
}
