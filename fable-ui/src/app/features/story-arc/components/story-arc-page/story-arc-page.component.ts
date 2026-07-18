import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, Router, RouterLink, UrlTree} from '@angular/router';
import {CommonModule, NgClass} from '@angular/common';
import {CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem} from '@angular/cdk/drag-drop';
import {ConfirmationService, MenuItem, MessageService} from 'primeng/api';
import {ConfirmDialog} from 'primeng/confirmdialog';
import {Button} from 'primeng/button';
import {TooltipModule} from 'primeng/tooltip';
import {FormsModule} from '@angular/forms';
import {TieredMenu} from 'primeng/tieredmenu';
import {Dialog} from 'primeng/dialog';
import {Subscription} from 'rxjs';
import {MobileUxService} from '../../../../core/services/mobile-ux.service';
import {DialogLauncherService} from '../../../../shared/services/dialog-launcher.service';

import {StoryArcService} from '../../service/story-arc.service';
import {StoryArcBookMapping, StoryArcLayoutUpdateRequest} from '../../model/story-arc.model';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {PageTitleService} from '../../../../shared/service/page-title.service';
import {BookPatchService} from '../../../book/service/book-patch.service';
import {Book, ReadStatus} from '../../../book/model/book.model';
import {ReadStatusHelper} from '../../../book/helpers/read-status.helper';
import {readStatusLabels} from '../../../book/components/book-browser/book-filter/book-filter.config';
import {StoryArcBookPickerComponent} from '../story-arc-book-picker/story-arc-book-picker.component';
import {FailureNotificationService} from '../../../../shared/service/failure-notification.service';
import {detectHasTouchInput} from '../../../../shared/util/search-overlay-focus.util';
import {GhostClickGuard, OVERLAY_GHOST_CLICK_MS} from '../../../../shared/util/overlay-dismiss.util';

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
    CommonModule,
    NgClass,
    RouterLink,
    FormsModule,
    DragDropModule,
    ConfirmDialog,
    Button,
    TooltipModule,
    TieredMenu,
    Dialog
  ],
  providers: [ConfirmationService]
})
export class StoryArcPageComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private storyArcService = inject(StoryArcService);
  private urlHelper = inject(UrlHelperService);
  private pageTitle = inject(PageTitleService);
  private bookPatchService = inject(BookPatchService);
  private messageService = inject(MessageService);
  private failureNotifications = inject(FailureNotificationService);
  private confirmationService = inject(ConfirmationService);
  private readStatusHelper = inject(ReadStatusHelper);
  private dialogLauncher = inject(DialogLauncherService);
  private mobileUx = inject(MobileUxService);
  private cdr = inject(ChangeDetectorRef);

  private toastError(summary: string, detail: string): void {
    this.failureNotifications.reportSafe(summary, detail);
    this.messageService.add({severity: 'error', summary, detail});
  }

  arcName = '';
  rows: StoryArcRow[] = [];
  loading = true;
  isEditMode = false;
  isChapterSortMode = false;
  externalUrl = '';
  summaryDescription = '';
  summaryExpanded = false;
  coverBookId: number | null = null;
  backupRows: StoryArcRow[] = [];
  backupExternalUrl = '';
  backupSummaryDescription = '';
  selectedMoveCard: { rowIndex: number; colIndex: number; item: StoryArcBookMapping } | null = null;

  /** Mobile summary dialog state */
  isMobile = false;
  summaryDialogVisible = false;
  private hasPushedHistoryState = false;
  private mobileSub?: Subscription;
  /** One-shot flag from Story Arcs "New Story Arc" create navigation. */
  private pendingStartInEditMode = false;

  /**
   * Desktop-touch (Duet) synthesizes a ghost click after focusing an input; OSK
   * chrome/resize can also blur the field. Keep focus until a real page tap leaves.
   */
  private readonly editFieldGhostGuard = new GhostClickGuard();
  private activeEditField: HTMLElement | null = null;
  private editFieldSawOutsidePointer = false;
  private editFieldBlurTimer: ReturnType<typeof setTimeout> | null = null;
  private editFieldSaveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Book drop-list axis: vertical on mobile card timeline, horizontal on desktop rows. */
  get bookDropListOrientation(): 'horizontal' | 'vertical' {
    return this.isMobile ? 'vertical' : 'horizontal';
  }

  /** Dynamic dialog style that accounts for top vs bottom header */
  get dialogStyle(): Record<string, string> {
    if (!this.summaryDialogVisible) {
      return { display: 'none' };
    }
    const hasBottomHeader = typeof document !== 'undefined' && document.body.classList.contains('header-bottom');
    const height = hasBottomHeader
      ? 'calc(100dvh - 3.85rem - env(safe-area-inset-bottom, 0px))'
      : 'calc(100dvh - 3.85rem)';
    const top = hasBottomHeader ? '0' : '3.85rem';
    return {
      position: 'fixed',
      top,
      left: '0',
      width: '100vw',
      maxWidth: '100vw',
      height,
      maxHeight: height,
      margin: '0',
      borderRadius: '0',
      boxSizing: 'border-box'
    };
  }

  ngOnInit(): void {
    this.isMobile = this.mobileUx.isMobileInteractionMode;
    this.pendingStartInEditMode = this.consumeStartInEditModeFlag();

    this.route.paramMap.subscribe(params => {
      const name = params.get('arcName');
      if (name) {
        try {
          // Angular usually decodes once; decode again only when a literal %xx remains
          // (e.g. legacy double-encoded sidebar links like The%2520Rocketeer).
          this.arcName = /%[0-9A-Fa-f]{2}/.test(name) ? decodeURIComponent(name) : name;
        } catch {
          this.arcName = name;
        }
        this.pageTitle.setPageTitle(this.arcName);
        const startInEditMode = this.pendingStartInEditMode;
        this.pendingStartInEditMode = false;
        this.loadLayout(false, startInEditMode);
      }
    });

    this.mobileSub = this.mobileUx.isMobileInteractionMode$.subscribe(isMobile => {
      this.isMobile = isMobile;
      this.cdr.markForCheck();
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('popstate', this.onPopState);
      document.addEventListener('pointerdown', this.onDocumentPointerDownCapture, true);
    }
  }

  ngOnDestroy(): void {
    this.mobileSub?.unsubscribe();
    this.clearEditFieldTimers();
    if (typeof window !== 'undefined') {
      window.removeEventListener('popstate', this.onPopState);
      document.removeEventListener('pointerdown', this.onDocumentPointerDownCapture, true);
      if (this.hasPushedHistoryState) {
        this.hasPushedHistoryState = false;
        window.history.back();
      }
    }
  }

  /** Handles Android back gesture / browser back button to close the summary dialog. */
  private onPopState = (): void => {
    if (this.summaryDialogVisible) {
      this.hasPushedHistoryState = false;
      this.summaryDialogVisible = false;
      this.cdr.markForCheck();
    }
  };

  /**
   * Capture-phase: swallow desktop-touch ghost taps that would hit sibling
   * chapter buttons / page chrome and steal focus from the title field.
   */
  private onDocumentPointerDownCapture = (event: PointerEvent): void => {
    if (!this.activeEditField) {
      return;
    }
    const target = event.target as Node | null;
    if (target && this.activeEditField.contains(target)) {
      this.editFieldSawOutsidePointer = false;
      return;
    }

    if (this.editFieldGhostGuard.shouldIgnore()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    // Real outside tap — allow blur to complete and persist.
    this.editFieldSawOutsidePointer = true;
  };

  /** Focus handler for chapter title / guide fields that need OSK stability. */
  onEditFieldFocus(event: FocusEvent): void {
    this.activeEditField = event.target as HTMLElement;
    this.editFieldSawOutsidePointer = false;
    if (detectHasTouchInput()) {
      // Longer than default ghost window — OSK open + layout shift on Duet is slow.
      this.editFieldGhostGuard.arm(Math.max(OVERLAY_GHOST_CLICK_MS, 900));
    }
  }

  /**
   * Blur handler: reclaim focus after ghost clicks / OSK chrome churn; only
   * persist when the user intentionally leaves the field.
   */
  onEditFieldBlur(event: FocusEvent): void {
    const field = event.target as HTMLElement;
    if (this.editFieldBlurTimer != null) {
      clearTimeout(this.editFieldBlurTimer);
    }

    this.editFieldBlurTimer = setTimeout(() => {
      this.editFieldBlurTimer = null;
      if (this.activeEditField !== field) {
        return;
      }
      if (document.activeElement === field) {
        return;
      }

      const touch = detectHasTouchInput();
      if (touch && this.editFieldGhostGuard.shouldIgnore()) {
        field.focus({preventScroll: true});
        return;
      }

      const active = document.activeElement as HTMLElement | null;
      const focusLostToChrome = !active
        || active === document.body
        || active === document.documentElement;

      // OSK drag/resize often blurs to body without a page pointerdown.
      if (touch && focusLostToChrome && !this.editFieldSawOutsidePointer) {
        field.focus({preventScroll: true});
        return;
      }

      this.activeEditField = null;
      this.editFieldSawOutsidePointer = false;
      this.flushEditFieldSave();
    }, 50);
  }

  /** Debounced quiet save while typing so we do not depend on blur for persistence. */
  onEditFieldChange(): void {
    if (this.editFieldSaveTimer != null) {
      clearTimeout(this.editFieldSaveTimer);
    }
    this.editFieldSaveTimer = setTimeout(() => {
      this.editFieldSaveTimer = null;
      this.saveLayout(true);
    }, 600);
  }

  private flushEditFieldSave(): void {
    if (this.editFieldSaveTimer != null) {
      clearTimeout(this.editFieldSaveTimer);
      this.editFieldSaveTimer = null;
    }
    this.saveLayout(true);
  }

  private clearEditFieldTimers(): void {
    if (this.editFieldBlurTimer != null) {
      clearTimeout(this.editFieldBlurTimer);
      this.editFieldBlurTimer = null;
    }
    if (this.editFieldSaveTimer != null) {
      clearTimeout(this.editFieldSaveTimer);
      this.editFieldSaveTimer = null;
    }
    this.activeEditField = null;
  }
  /** Reads one-shot navigation state from create flow without leaving it on history. */
  private consumeStartInEditModeFlag(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }
    const state = window.history.state as {startInEditMode?: boolean} | null;
    const startInEditMode = state?.startInEditMode === true;
    if (startInEditMode) {
      const rest = {...(state ?? {})};
      delete rest.startInEditMode;
      window.history.replaceState(rest, '');
    }
    return startInEditMode;
  }

  loadLayout(silent = false, startInEditMode = false): void {
    if (!silent) {
      this.loading = true;
      this.cdr.markForCheck();
    }

    this.storyArcService.getStoryArc(this.arcName).subscribe({
      next: (mappings) => {
        this.buildRowsFromMappings(mappings);
        if (startInEditMode) {
          this.backupRows = JSON.parse(JSON.stringify(this.rows));
          this.backupExternalUrl = this.externalUrl;
          this.backupSummaryDescription = this.summaryDescription;
          this.isEditMode = true;
          this.isChapterSortMode = false;
        }
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.toastError('Error', 'Failed to load story arc');
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  buildRowsFromMappings(mappings: StoryArcBookMapping[]): void {
    // Extract metadata from sentinel (mapping with no bookId) or first real mapping
    const metaSource = mappings.find(m => m.externalUrl || m.description || m.coverBookId != null);
    if (metaSource) {
      this.externalUrl = metaSource.externalUrl || '';
      this.summaryDescription = metaSource.description || '';
      this.coverBookId = metaSource.coverBookId ?? null;
    }

    // Separate real mappings (with bookId) from empty row sentinels (rowIndex but no bookId)
    const realMappings = mappings.filter(m => m.bookId != null);
    const emptyRowSentinels = mappings.filter(m => m.bookId == null && m.rowIndex != null && m.rowTitle);

    const rowMap = new Map<number, { title: string; items: StoryArcBookMapping[] }>();

    // First, populate from empty row sentinels (persisted empty chapters)
    emptyRowSentinels.forEach(m => {
      const rIdx = m.rowIndex ?? 0;
      if (!rowMap.has(rIdx)) {
        rowMap.set(rIdx, {
          title: m.rowTitle || `Chapter ${rIdx + 1}`,
          items: []
        });
      }
    });

    // Then populate from real mappings
    realMappings.forEach(m => {
      const rIdx = m.rowIndex ?? 0;
      if (!rowMap.has(rIdx)) {
        rowMap.set(rIdx, {
          title: m.rowTitle || `Chapter ${rIdx + 1}`,
          items: []
        });
      }
      rowMap.get(rIdx)!.items.push(m);
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

  // Phase 1E: Auto-organize books in row 0 by their series metadata
  autoOrganizeBySeries(): void {
    const row0 = this.rows[0];
    if (!row0 || row0.items.length === 0) {
      this.messageService.add({severity: 'info', summary: 'Nothing to organize', detail: 'No books found in the first chapter.'});
      return;
    }

    // Group items by series from book metadata
    const seriesGroups = new Map<string, StoryArcBookMapping[]>();
    const unsorted: StoryArcBookMapping[] = [];

    for (const item of row0.items) {
      const series = item.book?.metadata?.seriesName?.trim();
      if (series) {
        if (!seriesGroups.has(series)) {
          seriesGroups.set(series, []);
        }
        seriesGroups.get(series)!.push(item);
      } else {
        unsorted.push(item);
      }
    }

    // Sort each series group by series number
    for (const items of seriesGroups.values()) {
      items.sort((a, b) => {
        const aNum = a.book?.metadata?.seriesNumber;
        const bNum = b.book?.metadata?.seriesNumber;
        if (aNum != null && bNum != null) return Number(aNum) - Number(bNum);
        if (aNum != null) return -1;
        if (bNum != null) return 1;
        return 0;
      });
    }

    // Build new rows: sorted series groups first, then unsorted
    const newRows: StoryArcRow[] = [];
    const sortedSeries = Array.from(seriesGroups.keys()).sort((a, b) => a.localeCompare(b));

    for (const series of sortedSeries) {
      newRows.push({ title: series, items: seriesGroups.get(series)! });
    }

    if (unsorted.length > 0) {
      newRows.push({ title: 'Unsorted', items: unsorted });
    }

    // Preserve any existing rows beyond row 0
    for (let i = 1; i < this.rows.length; i++) {
      newRows.push(this.rows[i]);
    }

    this.rows = newRows;
    this.saveLayout();
    this.messageService.add({severity: 'success', summary: 'Organized', detail: `Books grouped into ${seriesGroups.size} series chapter${seriesGroups.size !== 1 ? 's' : ''}.`});
  }

  // Phase 1F: Open book picker dialog to add books to a specific chapter
  openBookPicker(rowIndex: number): void {
    const row = this.rows[rowIndex];
    const ref = this.dialogLauncher.openDialog(StoryArcBookPickerComponent, {
      header: `Add Books to "${row.title}"`,
      width: '550px',
      modal: true,
      data: { chapterTitle: row.title }
    });

    if (!ref) return;

    ref.onClose.subscribe((result: { bookIds: number[] } | null) => {
      if (result && result.bookIds && result.bookIds.length > 0) {
        this.storyArcService.bulkAdd({
          storyArcName: this.arcName,
          bookIds: result.bookIds,
          targetRowIndex: rowIndex,
          rowTitle: row.title
        }).subscribe({
          next: () => {
            this.loadLayout(true);
            this.messageService.add({severity: 'success', summary: 'Added', detail: `Added ${result.bookIds.length} book${result.bookIds.length !== 1 ? 's' : ''} to "${row.title}".`});
          },
          error: () => {
            this.toastError('Error', 'Failed to add books.');
          }
        });
      }
    });
  }

  toggleEditMode(): void {
    if (!this.isEditMode) {
      this.backupRows = JSON.parse(JSON.stringify(this.rows));
      this.backupExternalUrl = this.externalUrl;
      this.backupSummaryDescription = this.summaryDescription;
      this.isEditMode = true;
      this.isChapterSortMode = false;
    } else {
      this.clearEditFieldTimers();
      this.saveLayout();
      this.isEditMode = false;
      this.isChapterSortMode = false;
    }
    this.cdr.markForCheck();
  }

  toggleChapterSortMode(): void {
    this.isChapterSortMode = !this.isChapterSortMode;
    this.cdr.markForCheck();
  }

  cancelEdit(): void {
    this.clearEditFieldTimers();
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

  toggleSummary(): void {
    this.summaryExpanded = !this.summaryExpanded;
    this.cdr.markForCheck();
  }

  /** Opens the full-screen summary dialog on mobile. */
  openSummaryDialog(): void {
    this.summaryDialogVisible = true;
    // Push a history state so the Android back button can close the dialog
    if (typeof window !== 'undefined') {
      this.hasPushedHistoryState = true;
      window.history.pushState({ summaryDialogOpen: true }, '');
    }
    this.cdr.markForCheck();
  }

  /** Closes the summary dialog. */
  closeSummaryDialog(): void {
    this.summaryDialogVisible = false;
    this.cdr.markForCheck();
  }

  /** Handles dialog hide (dismissable mask, back gesture, or popstate). */
  onSummaryDialogHide(): void {
    // Pop the history state only if closed via UI action (not popstate event)
    if (this.hasPushedHistoryState) {
      this.hasPushedHistoryState = false;
      if (typeof window !== 'undefined') {
        window.history.back();
      }
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

  /**
   * Persist layout. When skipReload is true (quiet mid-edit save), also skip
   * catalog/sidebar refresh so focus and on-screen keyboards are not dropped.
   */
  saveLayout(skipReload = false): void {
    const items: StoryArcLayoutUpdateRequest['items'] = [];
    let sequence = 1;

    this.rows.forEach((row, rIndex) => {
      row.items.forEach((item, cIndex) => {
        if (item.bookId == null) {
          return;
        }
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

    // Collect row titles for empty chapters to persist them
    const rowTitles: string[] = this.rows.map(row => row.title);

    this.storyArcService.saveLayout(this.arcName, {
      storyArcName: this.arcName,
      externalUrl: this.externalUrl,
      description: this.summaryDescription,
      items,
      rowTitles
    }, { refreshCatalog: !skipReload }).subscribe({
      next: () => {
        if (!skipReload) {
          this.loadLayout(true);
        }
      }
    });
  }

  addRowAbove(rowIndex: number): void {
    const newTitle = `Chapter ${this.rows.length + 1}`;
    this.rows.splice(rowIndex, 0, { title: newTitle, items: [] });
    this.saveLayout();
    this.cdr.markForCheck();
  }

  addRowBelow(rowIndex: number): void {
    const newTitle = `Chapter ${this.rows.length + 1}`;
    this.rows.splice(rowIndex + 1, 0, { title: newTitle, items: [] });
    this.saveLayout();
    this.cdr.markForCheck();
  }

  removeRow(rowIndex: number): void {
    // Prevent deleting the last chapter
    if (this.rows.length <= 1) {
      this.messageService.add({severity: 'warn', summary: 'Cannot Delete', detail: 'The last chapter cannot be deleted. A story arc must have at least one chapter.'});
      return;
    }
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
    if (item.bookId == null) {
      this.rows[rowIndex].items.splice(colIndex, 1);
      this.saveLayout(true);
      return;
    }
    this.storyArcService.removeBooksFromStoryArc(this.arcName, [item.bookId]).subscribe({
      next: () => {
        this.rows[rowIndex].items.splice(colIndex, 1);
        this.saveLayout();
      },
      error: () => {
        this.toastError('Error', 'Failed to remove book');
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
        if (item.bookId != null && item.book && item.book.readStatus !== 'READ') {
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
            this.toastError('Error', 'Failed to delete story arc');
          }
        });
      }
    });
  }

  getThumbnail(bookId: number | null | undefined): string {
    if (bookId == null) {
      return 'assets/images/missing-cover.jpg';
    }
    return this.urlHelper.getDirectThumbnailUrl(bookId);
  }

  getBookReadingUrl(book: Book): UrlTree {
    return this.urlHelper.getBookPrimaryReadingUrl(book);
  }

  navigateToBook(book: Book, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
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

  setCoverBook(bookId: number | null | undefined): void {
    if (bookId == null) {
      return;
    }
    this.coverBookId = bookId;
    this.storyArcService.setCoverBook(this.arcName, bookId).subscribe({
      next: () => {
        this.messageService.add({severity: 'success', summary: 'Cover Updated', detail: 'Story arc cover image has been set.'});
        this.cdr.markForCheck();
      },
      error: () => {
        this.toastError('Error', 'Failed to set cover image.');
      }
    });
  }

  clearCoverBook(): void {
    this.coverBookId = null;
    this.storyArcService.setCoverBook(this.arcName, null).subscribe({
      next: () => {
        this.messageService.add({severity: 'success', summary: 'Cover Cleared', detail: 'Story arc cover will be auto-selected from the first book.'});
        this.cdr.markForCheck();
      },
      error: () => {
        this.toastError('Error', 'Failed to clear cover image.');
      }
    });
  }

  hasDigitalFile(book: Book | undefined): boolean {
    if (!book) return false;
    return !!(book.primaryFile || book.fileType || book.filePath || !book.isPhysical);
  }

  /** Cover badge + series line; mirrors book-card issue overlay sourcing. */
  getDisplayIssueNumber(book: Book | undefined | null): string | null {
    if (!book?.metadata) {
      return null;
    }
    const comicIssueNumber = book.metadata.comicMetadata?.issueNumber?.trim();
    if (comicIssueNumber) {
      return comicIssueNumber.startsWith('#') ? comicIssueNumber : `#${comicIssueNumber}`;
    }
    if (!book.seriesCount && book.metadata.seriesNumber != null) {
      return `#${book.metadata.seriesNumber}`;
    }
    const legacyIssue = (book.metadata as { issueNumber?: string }).issueNumber?.trim?.();
    if (legacyIssue) {
      return legacyIssue.startsWith('#') ? legacyIssue : `#${legacyIssue}`;
    }
    return null;
  }

  readBook(event: MouseEvent, book: Book | undefined): void {
    event.stopPropagation();
    if (!book) return;
    this.router.navigateByUrl(this.urlHelper.getBookPrimaryReadingUrl(book));
  }

  isContinueReading(book?: Book): boolean {
    if (!book) return false;
    const pct = this.getProgressPercentage(book);
    return pct !== null && pct > 0 && pct < 100;
  }

  getReadButtonIcon(book?: Book): string {
    if (!book) return 'pi pi-book';
    if (book.primaryFile?.bookType === 'AUDIOBOOK') {
      return this.isContinueReading(book) ? 'pi pi-forward' : 'pi pi-play';
    }
    return this.isContinueReading(book) ? 'pi pi-forward' : 'pi pi-book';
  }

  getReadStatusClass(book: Book | undefined): string {
    return this.readStatusHelper.getReadStatusClass(book?.readStatus);
  }

  getReadStatusTooltip(book: Book | undefined): string {
    return this.readStatusHelper.getReadStatusTooltip(book?.readStatus);
  }

  getReadStatusIcon(book: Book | undefined): string {
    return this.readStatusHelper.getReadStatusIcon(book?.readStatus);
  }

  toggleReadStatusMenu(event: Event, menu: TieredMenu, book: Book | undefined): void {
    event.stopPropagation();
    if (!book) return;
    menu.toggle(event);
  }

  getReadStatusMenuItems(book: Book | undefined): MenuItem[] {
    if (!book) return [];
    return Object.entries(readStatusLabels).map(([status, label]) => ({
      label,
      command: () => this.setReadStatus(book, status as ReadStatus)
    }));
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
}
