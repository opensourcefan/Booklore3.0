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
  private readonly bookService = inject(BookService);
  private readonly libraryService = inject(LibraryService);
  private readonly localStorageService = inject(LocalStorageService);
  private readonly pageTitle = inject(PageTitleService);
  private readonly t = inject(TranslocoService);
  private readonly destroy$ = new Subject<void>();

  readonly bookCardOverlayPreferenceService = inject(BookCardOverlayPreferenceService);

  screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
  mobileTitleRows = 2;
  desktopTitleRows = 2;

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
  }

  get titleRowsForViewport(): number {
    return this.screenWidth < this.MOBILE_BREAKPOINT ? this.mobileTitleRows : this.desktopTitleRows;
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

  private getCardsPerRow(): number {
    const isMobileLayout = this.screenWidth < this.MOBILE_BREAKPOINT;
    const cardWidth = isMobileLayout ? this.MOBILE_CARD_WIDTH_PX : this.DESKTOP_CARD_WIDTH_PX;
    const cardGap = isMobileLayout ? this.MOBILE_CARD_GAP_PX : this.DESKTOP_CARD_GAP_PX;
    const horizontalChrome = isMobileLayout ? this.MOBILE_HORIZONTAL_CHROME_PX : this.DESKTOP_HORIZONTAL_CHROME_PX;
    const usableWidth = Math.max(this.screenWidth - horizontalChrome, cardWidth);

    return Math.max(1, Math.floor((usableWidth + cardGap) / (cardWidth + cardGap)));
  }
}