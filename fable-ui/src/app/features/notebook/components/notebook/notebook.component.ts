import {Component, inject, OnDestroy, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Observable, of, Subject} from 'rxjs';
import {debounceTime, switchMap, takeUntil} from 'rxjs/operators';
import {InputTextModule} from 'primeng/inputtext';
import {Select} from 'primeng/select';
import {Button} from 'primeng/button';
import {TooltipModule} from 'primeng/tooltip';
import {Paginator} from 'primeng/paginator';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {NotebookService} from '../../service/notebook.service';
import {NotebookEntry, NotebookPage} from '../../model/notebook.model';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {PageTitleService} from '../../../../shared/service/page-title.service';
import {Router} from '@angular/router';
import {ConfirmationService, MessageService} from 'primeng/api';
import {Dialog} from 'primeng/dialog';
import {AnnotationService} from '../../../../shared/service/annotation.service';
import {BookNoteV2Service} from '../../../../shared/service/book-note-v2.service';
import {BookMarkService} from '../../../../shared/service/book-mark.service';
import {SidebarBadgeRefreshService} from '../../../book/service/sidebar-badge-refresh.service';
import {DomSanitizer, SafeHtml} from '@angular/platform-browser';
import {BookService} from '../../../book/service/book.service';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

interface BookGroup {
  bookId: number;
  bookTitle: string;
  thumbnailUrl: string;
  entries: NotebookEntry[];
}

interface BookOption {
  label: string;
  value: number;
}

const EMPTY_PAGE: NotebookPage = {
  content: [],
  page: { totalElements: 0, totalPages: 0, number: 0, size: 0 },
};

@Component({
  selector: 'app-notebook',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    InputTextModule,
    Select,
    Button,
    TooltipModule,
    Paginator,
    TranslocoDirective,
    Dialog,
  ],
  templateUrl: './notebook.component.html',
  styleUrls: ['./notebook.component.scss'],
})
export class NotebookComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();
  private readonly searchSubject = new Subject<void>();
  private readonly loadTrigger$ = new Subject<void>();
  private readonly bookFilterSubject = new Subject<string>();
  private readonly notebookService = inject(NotebookService);
  private readonly urlHelper = inject(UrlHelperService);
  private readonly pageTitle = inject(PageTitleService);
  private readonly t = inject(TranslocoService);
  private readonly router = inject(Router);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly annotationService = inject(AnnotationService);
  private readonly bookNoteV2Service = inject(BookNoteV2Service);
  private readonly bookmarkService = inject(BookMarkService);
  private readonly sidebarBadgeRefresh = inject(SidebarBadgeRefreshService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly bookService = inject(BookService);

  private markdownRenderer = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
  });

  filteredGroups: BookGroup[] = [];
  totalEntries = 0;
  loading = true;
  exporting = false;

  searchQuery = '';
  showHighlights = true;
  showNotes = true;
  showBookmarks = true;
  sortNewest = true;

  bookOptions: BookOption[] = [];
  selectedBookId: number | null = null;

  page = 0;
  pageSize = 50;
  first = 0;

  private collapsedGroups = new Set<number>();

  // Edit Dialog State
  showEditDialog = false;
  editingEntry: NotebookEntry | null = null;
  editNote = '';
  editTitle = '';
  editColor = '';
  saving = false;

  annotationColors = [
    { name: 'yellow', value: '#FFFF00', label: 'Yellow' },
    { name: 'green', value: '#90EE90', label: 'Green' },
    { name: 'blue', value: '#87CEEB', label: 'Blue' },
    { name: 'pink', value: '#FFB6C1', label: 'Pink' },
    { name: 'orange', value: '#FFD580', label: 'Orange' }
  ];

  ngOnInit(): void {
    this.pageTitle.setPageTitle(this.t.translate('notebook.pageTitle'));

    this.loadTrigger$.pipe(
      switchMap(() => {
        const types = this.activeTypes;
        if (types.length === 0) {
          return of(EMPTY_PAGE);
        }
        this.loading = true;
        return this.notebookService.getNotebookEntries(
          this.page, this.pageSize, types, this.selectedBookId, this.searchQuery, this.sortDirection
        );
      }),
      takeUntil(this.destroy$)
    ).subscribe(result => {
      this.totalEntries = result.page.totalElements;
      this.groupEntries(result.content);
      this.loading = false;
    });

    this.searchSubject.pipe(
      debounceTime(300),
      takeUntil(this.destroy$)
    ).subscribe(() => {
      this.page = 0;
      this.first = 0;
      this.loadTrigger$.next();
    });

    this.bookFilterSubject.pipe(
      debounceTime(300),
      switchMap(filter => this.notebookService.getBooksWithAnnotations(filter || undefined)),
      takeUntil(this.destroy$)
    ).subscribe(books => {
      this.updateBookOptions(books.map(b => ({label: b.bookTitle, value: b.bookId})));
    });

    this.loadBooks();
    this.loadTrigger$.next();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchChange(): void {
    this.searchSubject.next();
  }

  onFilterChange(): void {
    this.page = 0;
    this.first = 0;
    this.loadTrigger$.next();
  }

  onBookFilter(event: { filter: string }): void {
    this.bookFilterSubject.next(event.filter);
  }

  onPageChange(event: { page?: number; first?: number; rows?: number }): void {
    this.page = event.page ?? 0;
    this.first = event.first ?? 0;
    this.pageSize = event.rows ?? this.pageSize;
    this.loadTrigger$.next();
  }

  private get activeTypes(): string[] {
    const types: string[] = [];
    if (this.showHighlights) types.push('HIGHLIGHT');
    if (this.showNotes) types.push('NOTE');
    if (this.showBookmarks) types.push('BOOKMARK');
    return types;
  }

  private get sortDirection(): string {
    return this.sortNewest ? 'desc' : 'asc';
  }

  private loadBooks(): void {
    this.notebookService.getBooksWithAnnotations()
      .pipe(takeUntil(this.destroy$))
      .subscribe(books => {
        this.bookOptions = books.map(b => ({label: b.bookTitle, value: b.bookId}));
      });
  }

  private updateBookOptions(options: BookOption[]): void {
    if (this.selectedBookId !== null && !options.some(o => o.value === this.selectedBookId)) {
      const current = this.bookOptions.find(o => o.value === this.selectedBookId);
      if (current) {
        options = [current, ...options];
      }
    }
    this.bookOptions = options;
  }

  private groupEntries(entries: NotebookEntry[]): void {
    const groupMap = new Map<number, BookGroup>();
    for (const entry of entries) {
      if (!groupMap.has(entry.bookId)) {
        const isAudiobook = entry.primaryBookType === 'AUDIOBOOK';
        groupMap.set(entry.bookId, {
          bookId: entry.bookId,
          bookTitle: entry.bookTitle,
          thumbnailUrl: isAudiobook
            ? this.urlHelper.getAudiobookThumbnailUrl(entry.bookId)
            : this.urlHelper.getDirectThumbnailUrl(entry.bookId),
          entries: [],
        });
      }
      groupMap.get(entry.bookId)!.entries.push(entry);
    }
    this.filteredGroups = Array.from(groupMap.values());
  }

  toggleSort(): void {
    this.sortNewest = !this.sortNewest;
    this.page = 0;
    this.first = 0;
    this.loadTrigger$.next();
  }

  toggleGroup(bookId: number): void {
    if (this.collapsedGroups.has(bookId)) {
      this.collapsedGroups.delete(bookId);
    } else {
      this.collapsedGroups.add(bookId);
    }
  }

  isGroupCollapsed(bookId: number): boolean {
    return this.collapsedGroups.has(bookId);
  }

  getTypeIcon(type: string): string {
    switch (type) {
      case 'HIGHLIGHT': return 'pi pi-highlighter';
      case 'NOTE': return 'pi pi-file-edit';
      case 'BOOKMARK': return 'pi pi-bookmark';
      default: return 'pi pi-circle';
    }
  }

  getTypeLabel(type: string): string {
    switch (type) {
      case 'HIGHLIGHT': return this.t.translate('notebook.highlight');
      case 'NOTE': return this.t.translate('notebook.note');
      case 'BOOKMARK': return this.t.translate('notebook.bookmark');
      default: return type;
    }
  }

  exportMarkdown(): void {
    const types = this.activeTypes;
    if (types.length === 0) return;

    this.exporting = true;
    this.notebookService.getExportEntries(
      types, this.selectedBookId, this.searchQuery, this.sortDirection
    ).pipe(takeUntil(this.destroy$)).subscribe(entries => {
      this.generateMarkdownDownload(entries);
      this.exporting = false;
    });
  }

  private generateMarkdownDownload(entries: NotebookEntry[]): void {
    const groupMap = new Map<number, { bookTitle: string; entries: NotebookEntry[] }>();
    for (const entry of entries) {
      if (!groupMap.has(entry.bookId)) {
        groupMap.set(entry.bookId, {bookTitle: entry.bookTitle, entries: []});
      }
      groupMap.get(entry.bookId)!.entries.push(entry);
    }

    let md = '# Notebook Export\n\n';
    for (const group of groupMap.values()) {
      md += `## ${group.bookTitle}\n\n`;
      let currentChapter = '';
      for (const entry of group.entries) {
        if (entry.chapterTitle && entry.chapterTitle !== currentChapter) {
          currentChapter = entry.chapterTitle;
          md += `### ${currentChapter}\n\n`;
        }
        if (entry.text) {
          md += `> ${entry.text}\n\n`;
        }
        if (entry.note) {
          md += `**Note:** ${entry.note}\n\n`;
        }
        md += '---\n\n';
      }
    }

    const blob = new Blob([md], {type: 'text/markdown'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'notebook-export.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  goToReader(entry: NotebookEntry): void {
    let baseUrl = 'ebook-reader';
    const bookType = entry.primaryBookType;

    if (bookType === 'PDF') {
      baseUrl = 'pdf-reader';
    } else if (bookType === 'AUDIOBOOK') {
      baseUrl = 'audiobook-player';
    } else if (bookType === 'CBX') {
      baseUrl = 'cbx-reader';
    }

    const queryParams: {
      positionMs?: number;
      trackIndex?: number;
      page?: number;
      cfi?: string;
    } = {};
    
    if (bookType === 'AUDIOBOOK') {
      if (entry.positionMs !== undefined && entry.positionMs !== null) {
        queryParams.positionMs = entry.positionMs;
      }
      if (entry.trackIndex !== undefined && entry.trackIndex !== null) {
        queryParams.trackIndex = entry.trackIndex;
      }
    } else if (bookType === 'PDF') {
      if (entry.cfi && entry.cfi.startsWith('page=')) {
        const pageNum = Number(entry.cfi.split('=')[1]);
        if (!isNaN(pageNum)) {
          queryParams.page = pageNum;
        }
      }
    } else { // EPUB etc.
      if (entry.cfi) {
        queryParams.cfi = entry.cfi;
      }
    }

    this.router.navigate([`/${baseUrl}/book/${entry.bookId}`], { queryParams });
  }

  deleteEntry(entry: NotebookEntry): void {
    this.confirmationService.confirm({
      message: this.t.translate('notebook.deleteConfirmMessage'),
      header: this.t.translate('notebook.deleteConfirmTitle'),
      icon: 'pi pi-exclamation-triangle',
      acceptButtonProps: { severity: 'danger' },
      accept: () => {
        this.loading = true;
        let delete$: Observable<unknown> = of(null);
        if (entry.type === 'HIGHLIGHT') {
          delete$ = this.annotationService.deleteAnnotation(entry.id);
        } else if (entry.type === 'NOTE') {
          delete$ = this.bookNoteV2Service.deleteNote(entry.id);
        } else if (entry.type === 'BOOKMARK') {
          delete$ = this.bookmarkService.deleteBookmark(entry.id);
        }
        
        delete$.subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: this.t.translate('common.success') || 'Success',
              detail: this.t.translate('notebook.deleteSuccess') || 'Entry deleted successfully'
            });
            this.loadTrigger$.next();
            this.sidebarBadgeRefresh.requestRefresh();
          },
          error: (err) => {
            this.loading = false;
            console.error('Failed to delete notebook entry:', err);
            this.messageService.add({
              severity: 'error',
              summary: this.t.translate('common.error') || 'Error',
              detail: this.t.translate('notebook.deleteError') || 'Failed to delete entry'
            });
          }
        });
      }
    });
  }

  editEntry(entry: NotebookEntry): void {
    this.editingEntry = entry;
    this.editNote = entry.note || '';
    this.editTitle = entry.text || '';
    this.editColor = entry.color || '#FFFF00';
    this.showEditDialog = true;
  }

  saveEdit(): void {
    if (!this.editingEntry) return;
    this.saving = true;
    let update$: Observable<unknown> = of(null);

    if (this.editingEntry.type === 'HIGHLIGHT') {
      update$ = this.annotationService.updateAnnotation(this.editingEntry.id, {
        note: this.editNote,
        color: this.editColor
      });
    } else if (this.editingEntry.type === 'NOTE') {
      update$ = this.bookNoteV2Service.updateNote(this.editingEntry.id, {
        noteContent: this.editNote,
        color: this.editColor
      });
    } else if (this.editingEntry.type === 'BOOKMARK') {
      update$ = this.bookmarkService.updateBookmark(this.editingEntry.id, {
        title: this.editTitle,
        notes: this.editNote,
        color: this.editColor
      });
    }

    update$.subscribe({
      next: () => {
        this.saving = false;
        this.showEditDialog = false;
        this.editingEntry = null;
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('common.success') || 'Success',
          detail: this.t.translate('notebook.updateSuccess') || 'Entry updated successfully'
        });
        this.loadTrigger$.next();
      },
      error: (err) => {
        this.saving = false;
        console.error('Failed to update entry:', err);
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('common.error') || 'Error',
          detail: this.t.translate('notebook.updateError') || 'Failed to update entry'
        });
      }
    });
  }

  markdownToHtml(markdown: string | null): SafeHtml {
    if (!markdown) return this.sanitizer.bypassSecurityTrustHtml('');
    let html = this.markdownRenderer.render(markdown);

    // Citations with page numbers
    html = html.replace(
      /\[Source\s*(?:\d+)?:\s*(.+?),\s*Page\s*(\d+)\]/g,
      (match, title, page) => {
        const escapedTitle = title.replace(/"/g, '&quot;');
        return `<span class="notebook-citation-highlight"><em>[Source: ${title}, <span class="notebook-citation-page-link" data-book-title="${escapedTitle}" data-page="${page}" tabindex="0" role="link" style="color: var(--p-primary-color); cursor: pointer; text-decoration: underline;">Page ${page}</span>]</em></span>`;
      }
    );

    // Citations without numeric page numbers
    html = html.replace(
      /\[Source\s*(?:\d+)?:\s*([^\]]+)\]/g,
      (match, titleAndPage) => {
        const cleanTitle = titleAndPage.replace(/,\s*Page\s*\w+/i, '').trim();
        const escapedTitle = cleanTitle.replace(/"/g, '&quot;');
        return `<span class="notebook-citation-highlight"><em>[Source: <span class="notebook-citation-page-link" data-book-title="${escapedTitle}" data-page="0" tabindex="0" role="link" style="color: var(--p-primary-color); cursor: pointer; text-decoration: underline;">${titleAndPage}</span>]</em></span>`;
      }
    );

    const sanitized = DOMPurify.sanitize(html, {
      ADD_ATTR: ['data-book-title', 'data-page', 'role', 'tabindex', 'style']
    });
    return this.sanitizer.bypassSecurityTrustHtml(sanitized);
  }

  onNotebookTextClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('notebook-citation-page-link')) return;

    const bookTitle = target.getAttribute('data-book-title');
    const page = parseInt(target.getAttribute('data-page') || '0', 10);
    if (!bookTitle) return;

    const normBookTitle = this.normalizeTitle(bookTitle);
    const allBooks = this.bookService.getCurrentBookState()?.books || [];

    // Find by book title in the library
    const libraryBook = allBooks.find(b => {
      const title = b.metadata?.title || b.fileName || '';
      const normT = this.normalizeTitle(title);
      return normT === normBookTitle || normT.includes(normBookTitle) || normBookTitle.includes(normT);
    });

    if (libraryBook) {
      let baseUrl = 'ebook-reader';
      const fileType = libraryBook.fileType || '';
      if (fileType === 'PDF') {
        baseUrl = 'pdf-reader';
      } else if (fileType === 'AUDIOBOOK') {
        baseUrl = 'audiobook-player';
      } else if (fileType === 'CBX') {
        baseUrl = 'cbx-reader';
      }

      const queryParams: { page?: number } = {};
      if (page > 0) {
        queryParams.page = page;
      }
      this.router.navigate([`/${baseUrl}/book/${libraryBook.id}`], { queryParams });
    }
  }

  private normalizeTitle(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
}
