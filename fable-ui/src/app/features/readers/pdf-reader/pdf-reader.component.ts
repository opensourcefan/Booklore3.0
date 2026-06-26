import {Component, ElementRef, inject, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {EditorAnnotation, NgxExtendedPdfViewerModule, NgxExtendedPdfViewerService, pdfDefaultOptions, ZoomType} from 'ngx-extended-pdf-viewer';
import {PageTitleService} from "../../../shared/service/page-title.service";
import {BookService} from '../../book/service/book.service';
import {forkJoin, Subject, Subscription} from 'rxjs';
import {debounceTime, map, switchMap} from 'rxjs/operators';
import {BookSetting} from '../../book/model/book.model';
import {UserService} from '../../settings/user-management/user.service';
import {AuthService} from '../../../shared/service/auth.service';
import {API_CONFIG} from '../../../core/config/api-config';
import {PdfAnnotationService} from '../../../shared/service/pdf-annotation.service';
import {BookMarkService, BookMark, CreateBookMarkRequest} from '../../../shared/service/book-mark.service';

import {ProgressSpinner} from 'primeng/progressspinner';
import {MessageService} from 'primeng/api';
import {TranslocoService, TranslocoPipe} from '@jsverse/transloco';
import {ReadingSessionService} from '../../../shared/service/reading-session.service';
import {WriteProgressService} from '../../../shared/service/write-progress.service';
import {Location} from '@angular/common';

@Component({
  selector: 'app-pdf-reader',
  standalone: true,
  imports: [NgxExtendedPdfViewerModule, ProgressSpinner, TranslocoPipe, FormsModule],
  templateUrl: './pdf-reader.component.html',
  styleUrl: './pdf-reader.component.scss',
})
export class PdfReaderComponent implements OnInit, OnDestroy {
  constructor() {
    pdfDefaultOptions.rangeChunkSize = 512 * 1024;
    pdfDefaultOptions.disableAutoFetch = true;
  }

  isLoading = true;
  totalPages = 0;
  isDarkTheme = true;
  canPrint = false;

  rotation: 0 | 90 | 180 | 270 = 0;
  authorization = '';

  page!: number;
  spread!: 'off' | 'even' | 'odd';
  zoom!: ZoomType;

  bookData!: string;
  bookId!: number;
  bookFileId?: number;
  private altBookType?: string;
  private appSettingsSubscription!: Subscription;
  private annotationSaveSubject = new Subject<void>();
  private annotationSaveSubscription!: Subscription;
  private annotationsLoaded = false;

  // Bookmark state
  isCurrentPageBookmarked = false;
  showBookmarkDialog = false;
  bookmarkTitle = '';
  private bookmarks: BookMark[] = [];
  @ViewChild('bookmarkTitleInput') bookmarkTitleInput!: ElementRef<HTMLInputElement>;

  private bookService = inject(BookService);
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private messageService = inject(MessageService);
  private route = inject(ActivatedRoute);
  private pageTitle = inject(PageTitleService);
  private readingSessionService = inject(ReadingSessionService);
  private writeProgressService = inject(WriteProgressService);
  private location = inject(Location);
  private pdfViewerService = inject(NgxExtendedPdfViewerService);
  private pdfAnnotationService = inject(PdfAnnotationService);
  private bookMarkService = inject(BookMarkService);
  private readonly t = inject(TranslocoService);

  ngOnInit(): void {
    this.writeProgressService.clear();
    this.annotationSaveSubscription = this.annotationSaveSubject
      .pipe(debounceTime(1500))
      .subscribe(() => this.persistAnnotations());

    this.route.paramMap.subscribe((params) => {
      this.isLoading = true;
      this.bookId = +params.get('bookId')!;
      this.altBookType = this.route.snapshot.queryParamMap.get('bookType') ?? undefined;

      this.bookService.getBookByIdFromAPI(this.bookId, false).pipe(
        switchMap((book) => {
          if (this.altBookType) {
            const altFile = book.alternativeFormats?.find(f => f.bookType === this.altBookType);
            this.bookFileId = altFile?.id;
          } else {
            this.bookFileId = book.primaryFile?.id;
          }

          return forkJoin([
            this.bookService.getBookSetting(this.bookId, this.bookFileId!),
            this.userService.getMyself()
          ]).pipe(map(([bookSetting, myself]) => ({book, bookSetting, myself})));
        })
      ).subscribe({
        next: ({book, bookSetting, myself}) => {
          const pdfMeta = book;
          const pdfPrefs = bookSetting;

          this.pageTitle.setBookPageTitle(pdfMeta);

          const globalOrIndividual = myself.userSettings.perBookSetting.pdf;
          if (globalOrIndividual === 'Global') {
            this.zoom = myself.userSettings.pdfReaderSetting.pageZoom || 'page-fit';
            this.spread = myself.userSettings.pdfReaderSetting.pageSpread || 'odd';
          } else {
            this.zoom = pdfPrefs.pdfSettings?.zoom || myself.userSettings.pdfReaderSetting.pageZoom || 'page-fit';
            this.spread = pdfPrefs.pdfSettings?.spread || myself.userSettings.pdfReaderSetting.pageSpread || 'odd';
          }
          this.canPrint = myself.permissions.canDownload || myself.permissions.admin;
          const targetPage = this.route.snapshot.queryParamMap.get('page');
          this.page = targetPage ? Number(targetPage) : (pdfMeta.pdfProgress?.page || 1);
          this.bookData = this.altBookType
            ? `${API_CONFIG.BASE_URL}/api/v1/books/${this.bookId}/content?bookType=${this.altBookType}`
            : `${API_CONFIG.BASE_URL}/api/v1/books/${this.bookId}/content`;
          const token = this.authService.getInternalAccessToken();
          this.authorization = token ? `Bearer ${token}` : '';
          this.isLoading = false;
          this.loadBookmarks();
        },
        error: () => {
          this.messageService.add({severity: 'error', summary: this.t.translate('common.error'), detail: this.t.translate('readerPdf.toast.failedToLoadBook')});
          this.isLoading = false;
        }
      });
    });
  }

  onPageChange(page: number): void {
    if (page !== this.page) {
      this.page = page;
      this.updateBookmarkState();
      this.updateProgress();
      const percentage = this.totalPages > 0 ? Math.round((this.page / this.totalPages) * 1000) / 10 : 0;
      this.readingSessionService.updateProgress(this.page.toString(), percentage);
    }
  }

  onZoomChange(zoom: ZoomType): void {
    if (zoom !== this.zoom) {
      this.zoom = zoom;
      this.updateViewerSetting();
    }
  }

  onSpreadChange(spread: 'off' | 'even' | 'odd'): void {
    if (spread !== this.spread) {
      this.spread = spread;
      this.updateViewerSetting();
    }
  }

  private updateViewerSetting(): void {
    const bookSetting: BookSetting = {
      pdfSettings: {
        spread: this.spread,
        zoom: this.zoom,
      }
    }
    this.bookService.updateViewerSetting(bookSetting, this.bookId).subscribe();
  }

  updateProgress(): void {
    const percentage = this.totalPages > 0 ? Math.round((this.page / this.totalPages) * 1000) / 10 : 0;
    this.bookService.savePdfProgress(this.bookId, this.page, percentage, this.bookFileId).subscribe();
  }

  onPdfPagesLoaded(event: { pagesCount: number }): void {
    this.totalPages = event.pagesCount;
    const percentage = this.totalPages > 0 ? Math.round((this.page / this.totalPages) * 1000) / 10 : 0;
    this.readingSessionService.startSession(this.bookId, "PDF", this.page.toString(), percentage);
    this.readingSessionService.updateProgress(this.page.toString(), percentage);
    this.loadAnnotations();
  }

  onAnnotationEditorEvent(): void {
    if (this.annotationsLoaded) {
      this.annotationSaveSubject.next();
    }
  }

  ngOnDestroy(): void {
    if (this.readingSessionService.isSessionActive()) {
      const percentage = this.totalPages > 0 ? Math.round((this.page / this.totalPages) * 1000) / 10 : 0;
      this.readingSessionService.endSession(this.page.toString(), percentage);
    }

    this.annotationSaveSubscription?.unsubscribe();
    this.persistAnnotations();

    if (this.appSettingsSubscription) {
      this.appSettingsSubscription.unsubscribe();
    }
    this.updateProgress();
  }

  closeReader = (): void => {
    if (this.readingSessionService.isSessionActive()) {
      const percentage = this.totalPages > 0 ? Math.round((this.page / this.totalPages) * 1000) / 10 : 0;
      this.readingSessionService.endSession(this.page.toString(), percentage);
    }
    this.writeProgressService.complete(this.t.translate('book.browser.toast.readingProgressUpdated'));
    this.location.back();
  }

  // --- Bookmark methods ---

  private loadBookmarks(): void {
    this.bookMarkService.getBookmarksForBook(this.bookId).subscribe({
      next: (bookmarks) => {
        this.bookmarks = bookmarks;
        this.updateBookmarkState();
      }
    });
  }

  private updateBookmarkState(): void {
    const pageStr = this.page.toString();
    this.isCurrentPageBookmarked = this.bookmarks.some(b => b.cfi === pageStr);
  }

  onToggleBookmark(): void {
    if (this.isCurrentPageBookmarked) {
      this.removeBookmark();
    } else {
      this.showBookmarkDialog = true;
      this.bookmarkTitle = '';
      setTimeout(() => this.bookmarkTitleInput?.nativeElement?.focus(), 0);
    }
  }

  onSaveBookmark(): void {
    const request: CreateBookMarkRequest = {
      bookId: this.bookId,
      cfi: this.page.toString(),
      title: this.bookmarkTitle.trim() || `${this.t.translate('readerCbx.sidebar.page')} ${this.page}`
    };

    this.bookMarkService.createBookmark(request).subscribe({
      next: () => {
        this.messageService.add({severity: 'success', summary: this.t.translate('readerPdf.toast.bookmarkAdded'), life: 2000});
        this.showBookmarkDialog = false;
        this.bookmarkTitle = '';
        this.loadBookmarks();
      },
      error: () => {
        this.messageService.add({severity: 'error', summary: this.t.translate('readerPdf.toast.bookmarkFailed'), life: 3000});
      }
    });
  }

  onCancelBookmark(): void {
    this.showBookmarkDialog = false;
    this.bookmarkTitle = '';
  }

  private removeBookmark(): void {
    const pageStr = this.page.toString();
    const existing = this.bookmarks.find(b => b.cfi === pageStr);
    if (existing) {
      this.bookMarkService.deleteBookmark(existing.id).subscribe({
        next: () => {
          this.messageService.add({severity: 'success', summary: this.t.translate('readerPdf.toast.bookmarkRemoved'), life: 2000});
          this.loadBookmarks();
        },
        error: () => {
          this.messageService.add({severity: 'error', summary: this.t.translate('readerPdf.toast.bookmarkFailed'), life: 3000});
        }
      });
    }
  }

  private loadAnnotations(): void {
    this.pdfAnnotationService.getAnnotations(this.bookId).subscribe({
      next: (response) => {
        if (response?.data) {
          const annotations = JSON.parse(response.data);
          for (const annotation of annotations) {
            this.pdfViewerService.addEditorAnnotation(annotation);
          }
        }
        this.annotationsLoaded = true;
      },
      error: () => {
        this.annotationsLoaded = true;
      }
    });
  }

  private persistAnnotations(): void {
    if (!this.annotationsLoaded || !this.bookId) {
      return;
    }
    const serialized = this.pdfViewerService.getSerializedAnnotations();
    if (serialized && serialized.length > 0) {
      const cleaned = serialized.map(({id: _id, ...rest}: EditorAnnotation) => rest);
      const data = JSON.stringify(cleaned);
      this.pdfAnnotationService.saveAnnotations(this.bookId, data).subscribe();
    }
  }
}
