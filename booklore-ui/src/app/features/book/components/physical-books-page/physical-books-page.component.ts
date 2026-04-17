import {AsyncPipe} from '@angular/common';
import {Component, HostListener, OnDestroy, OnInit, inject} from '@angular/core';
import {ProgressSpinner} from 'primeng/progressspinner';
import {combineLatest, Observable, Subject} from 'rxjs';
import {map, startWith, takeUntil} from 'rxjs/operators';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {BookCardComponent} from '../book-browser/book-card/book-card.component';
import {BookCardOverlayPreferenceService} from '../book-browser/book-card-overlay-preference.service';
import {Book} from '../../model/book.model';
import {BookService} from '../../service/book.service';
import {LibraryService} from '../../service/library.service';
import {LocalStorageService} from '../../../../shared/service/local-storage.service';
import {PageTitleService} from '../../../../shared/service/page-title.service';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {ReadStatusHelper} from '../../helpers/read-status.helper';

interface PhysicalBookGroup {
  key: string;
  libraryId: number | null;
  libraryName: string;
  books: Book[];
}

interface PhysicalBooksViewModel {
  loading: boolean;
  error: string | null;
  groups: PhysicalBookGroup[];
  totalBooks: number;
}

@Component({
  selector: 'app-physical-books-page',
  standalone: true,
  imports: [AsyncPipe, BookCardComponent, ProgressSpinner, TranslocoDirective],
  templateUrl: './physical-books-page.component.html',
  styleUrl: './physical-books-page.component.scss',
})
export class PhysicalBooksPageComponent implements OnInit, OnDestroy {
  private readonly DESKTOP_CARD_WIDTH_PX = 116;
  private readonly DESKTOP_CARD_GAP_PX = 16;
  private readonly DESKTOP_HORIZONTAL_CHROME_PX = 80;
  private readonly MOBILE_CARD_WIDTH_PX = 104;
  private readonly MOBILE_CARD_GAP_PX = 14;
  private readonly MOBILE_HORIZONTAL_CHROME_PX = 60;
  private readonly VIEWER_SWIPE_THRESHOLD_PX = 48;
  private readonly bookService = inject(BookService);
  private readonly libraryService = inject(LibraryService);
  private readonly localStorageService = inject(LocalStorageService);
  private readonly pageTitle = inject(PageTitleService);
  private readonly t = inject(TranslocoService);
  private readonly urlHelper = inject(UrlHelperService);
  private readonly readStatusHelper = inject(ReadStatusHelper);
  private readonly destroy$ = new Subject<void>();

  readonly bookCardOverlayPreferenceService = inject(BookCardOverlayPreferenceService);

  screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  mobileTitleRows = 2;
  desktopTitleRows = 2;
  mobileViewerBooks: Book[] = [];
  mobileViewerIndex = -1;

  private viewerTouchStartX = 0;
  private viewerTouchStartY = 0;
  private viewerTouchMoved = false;

  readonly vm$: Observable<PhysicalBooksViewModel> = combineLatest([
    this.bookService.bookState$,
    this.libraryService.libraryState$
  ]).pipe(
    map(([bookState, libraryState]) => {
      const loading = !bookState.loaded || !libraryState.loaded;
      const error = bookState.error || libraryState.error || null;

      if (loading || error) {
        return {
          loading,
          error,
          groups: [],
          totalBooks: 0,
        };
      }

      const libraryNames = new Map(
        (libraryState.libraries ?? [])
          .filter(library => library.id != null)
          .map(library => [library.id as number, library.name])
      );

      const grouped = new Map<string, PhysicalBookGroup>();
      for (const book of bookState.books ?? []) {
        if (!book.isPhysical) {
          continue;
        }

        const libraryId = book.libraryId ?? null;
        const libraryName = libraryNames.get(book.libraryId)
          ?? book.libraryName
          ?? this.t.translate('book.physicalBooksPage.unknownLibrary');
        const key = libraryId != null ? `library:${libraryId}` : `name:${libraryName}`;
        const existing = grouped.get(key);

        if (existing) {
          existing.books.push(book);
          continue;
        }

        grouped.set(key, {
          key,
          libraryId,
          libraryName,
          books: [book],
        });
      }

      const groups = [...grouped.values()]
        .map(group => ({
          ...group,
          books: this.sortBooks(group.books),
        }))
        .sort((left, right) => left.libraryName.localeCompare(right.libraryName));

      return {
        loading: false,
        error: null,
        groups,
        totalBooks: groups.reduce((sum, group) => sum + group.books.length, 0),
      };
    })
  );

  private readonly MOBILE_BREAKPOINT = 768;
  private readonly MOBILE_TITLE_ROWS_STORAGE_KEY = 'mobileTitleRowsPreference';
  private readonly DESKTOP_TITLE_ROWS_STORAGE_KEY = 'desktopTitleRowsPreference';
  readonly mobileBreakpoint = this.MOBILE_BREAKPOINT;

  ngOnInit(): void {
    this.loadTitleRowsPreference();
    this.t.langChanges$
      .pipe(startWith(this.t.getActiveLang()), takeUntil(this.destroy$))
      .subscribe(() => {
        this.pageTitle.setPageTitle(this.t.translate('book.physicalBooksPage.title'));
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:resize')
  onResize(): void {
    this.screenWidth = window.innerWidth;
    if (this.screenWidth >= this.MOBILE_BREAKPOINT && this.isMobileViewerOpen) {
      this.closeMobileBookViewer();
    }
  }

  get titleRowsForViewport(): number {
    return this.screenWidth < this.MOBILE_BREAKPOINT ? this.mobileTitleRows : this.desktopTitleRows;
  }

  get activeMobileViewerBook(): Book | null {
    if (this.mobileViewerIndex < 0 || this.mobileViewerIndex >= this.mobileViewerBooks.length) {
      return null;
    }

    return this.mobileViewerBooks[this.mobileViewerIndex] ?? null;
  }

  get isMobileViewerOpen(): boolean {
    return this.activeMobileViewerBook !== null;
  }

  get pageViewportHeight(): string {
    return this.screenWidth < this.MOBILE_BREAKPOINT
      ? 'calc(100dvh - 4.4rem)'
      : 'calc(100dvh - 6.25rem)';
  }

  getShelfRows(books: Book[]): Book[][] {
    const cardsPerRow = this.getCardsPerRow();
    const rows: Book[][] = [];

    for (let index = 0; index < books.length; index += cardsPerRow) {
      rows.push(books.slice(index, index + cardsPerRow));
    }

    return rows;
  }

  private sortBooks(books: Book[]): Book[] {
    return [...books].sort((left, right) => {
      const leftTitle = (left.metadata?.title ?? left.fileName ?? '').trim();
      const rightTitle = (right.metadata?.title ?? right.fileName ?? '').trim();
      return leftTitle.localeCompare(rightTitle) || left.id - right.id;
    });
  }

  private loadTitleRowsPreference(): void {
    const savedMobileRows = this.localStorageService.get<number>(this.MOBILE_TITLE_ROWS_STORAGE_KEY);
    const savedDesktopRows = this.localStorageService.get<number>(this.DESKTOP_TITLE_ROWS_STORAGE_KEY);

    if (savedMobileRows !== null) {
      this.mobileTitleRows = Math.min(3, Math.max(1, savedMobileRows));
    }
    if (savedDesktopRows !== null) {
      this.desktopTitleRows = Math.min(5, Math.max(1, savedDesktopRows));
    }
  }

  toggleMobileBookViewer(groups: PhysicalBookGroup[], book: Book): void {
    if (this.screenWidth >= this.MOBILE_BREAKPOINT) {
      return;
    }

    if (this.activeMobileViewerBook?.id === book.id) {
      this.closeMobileBookViewer();
      return;
    }

    const orderedBooks = groups.flatMap(group => group.books);
    const nextIndex = orderedBooks.findIndex(candidate => candidate.id === book.id);

    if (nextIndex === -1) {
      return;
    }

    this.mobileViewerBooks = orderedBooks;
    this.mobileViewerIndex = nextIndex;
    this.resetViewerTouch();
  }

  closeMobileBookViewer(): void {
    this.mobileViewerBooks = [];
    this.mobileViewerIndex = -1;
    this.resetViewerTouch();
  }

  onViewerTouchStart(event: TouchEvent): void {
    if (event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    this.viewerTouchStartX = touch.clientX;
    this.viewerTouchStartY = touch.clientY;
    this.viewerTouchMoved = false;
  }

  onViewerTouchMove(event: TouchEvent): void {
    if (event.touches.length !== 1) {
      return;
    }

    const touch = event.touches[0];
    if (Math.abs(touch.clientX - this.viewerTouchStartX) > 8 || Math.abs(touch.clientY - this.viewerTouchStartY) > 8) {
      this.viewerTouchMoved = true;
    }
  }

  onViewerTouchEnd(event: TouchEvent): void {
    if (!this.viewerTouchMoved || event.changedTouches.length !== 1) {
      this.resetViewerTouch();
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - this.viewerTouchStartX;
    const deltaY = Math.abs(touch.clientY - this.viewerTouchStartY);

    if (Math.abs(deltaX) >= this.VIEWER_SWIPE_THRESHOLD_PX && Math.abs(deltaX) > deltaY) {
      if (deltaX < 0) {
        this.showNextMobileBook();
      } else {
        this.showPreviousMobileBook();
      }
    }

    this.resetViewerTouch();
  }

  onViewerTouchCancel(): void {
    this.resetViewerTouch();
  }

  getViewerCoverUrl(book: Book): string {
    return book.primaryFile?.bookType === 'AUDIOBOOK'
      ? this.urlHelper.getAudiobookThumbnailUrl(book.id, book.metadata?.audiobookCoverUpdatedOn)
      : this.urlHelper.getThumbnailUrl(book.id, book.metadata?.coverUpdatedOn);
  }

  getViewerTitle(book: Book): string {
    return book.metadata?.title?.trim()
      || book.fileName?.trim()
      || book.primaryFile?.fileName?.trim()
      || 'Untitled';
  }

  getViewerSubtitle(book: Book): string | null {
    const subtitle = book.metadata?.subtitle?.trim();
    return subtitle ? subtitle : null;
  }

  getViewerDisplayFormat(book: Book): string {
    if (!book.primaryFile) {
      return 'PHY';
    }

    const extension = book.primaryFile.extension?.trim();
    if (extension) {
      return extension.toUpperCase();
    }

    return this.getFileExtension(book.primaryFile.filePath) ?? 'PHY';
  }

  getViewerIssueNumber(book: Book): string | null {
    const comicIssueNumber = book.metadata?.comicMetadata?.issueNumber?.trim();
    if (comicIssueNumber) {
      return comicIssueNumber.startsWith('#') ? comicIssueNumber : `#${comicIssueNumber}`;
    }

    if (!book.seriesCount && book.metadata?.seriesNumber != null) {
      return `#${book.metadata.seriesNumber}`;
    }

    return null;
  }

  getViewerReadStatusIcon(book: Book): string {
    return this.readStatusHelper.getReadStatusIcon(book.readStatus);
  }

  getViewerReadStatusClass(book: Book): string {
    return this.readStatusHelper.getReadStatusClass(book.readStatus);
  }

  shouldShowViewerStatus(book: Book): boolean {
    return this.readStatusHelper.shouldShowStatusIcon(book.readStatus);
  }

  private showPreviousMobileBook(): void {
    if (this.mobileViewerIndex <= 0) {
      return;
    }

    this.mobileViewerIndex -= 1;
  }

  private showNextMobileBook(): void {
    if (this.mobileViewerIndex >= this.mobileViewerBooks.length - 1) {
      return;
    }

    this.mobileViewerIndex += 1;
  }

  private resetViewerTouch(): void {
    this.viewerTouchStartX = 0;
    this.viewerTouchStartY = 0;
    this.viewerTouchMoved = false;
  }

  private getFileExtension(filePath?: string): string | null {
    if (!filePath) {
      return null;
    }

    const segments = filePath.split('.');
    if (segments.length < 2) {
      return null;
    }

    return segments.pop()?.toUpperCase() ?? null;
  }

  private getCardsPerRow(): number {
    const isMobileLayout = this.screenWidth < this.MOBILE_BREAKPOINT;
    const cardWidth = isMobileLayout ? this.MOBILE_CARD_WIDTH_PX : this.DESKTOP_CARD_WIDTH_PX;
    const cardGap = isMobileLayout ? this.MOBILE_CARD_GAP_PX : this.DESKTOP_CARD_GAP_PX;
    const horizontalChrome = isMobileLayout ? this.MOBILE_HORIZONTAL_CHROME_PX : this.DESKTOP_HORIZONTAL_CHROME_PX;
    const usableWidth = Math.max(this.screenWidth - horizontalChrome, cardWidth);

    return Math.max(1, Math.floor((usableWidth + cardGap) / (cardWidth + cardGap)));
  }
}