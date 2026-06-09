import {Component, ElementRef, HostListener, inject, OnDestroy, OnInit} from '@angular/core';
import {BehaviorSubject, interval, of, Subscription} from 'rxjs';
import {catchError, debounceTime, distinctUntilChanged, map, switchMap} from 'rxjs/operators';
import {Book} from '../../model/book.model';
import {FormsModule} from '@angular/forms';
import {InputTextModule} from 'primeng/inputtext';
import {BookService} from '../../service/book.service';
import {Button} from 'primeng/button';
import {SlicePipe, NgClass} from '@angular/common';
import {Skeleton} from 'primeng/skeleton';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {Router} from '@angular/router';
import {IconField} from 'primeng/iconfield';
import {InputIcon} from 'primeng/inputicon';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {AiSearchDialogService} from '../ai-search-dialog/ai-search-dialog.component';
import {AppSettingsService} from '../../../../shared/service/app-settings.service';
import {TooltipModule} from 'primeng/tooltip';

@Component({
  selector: 'app-book-searcher',
  templateUrl: './book-searcher.component.html',
  imports: [
    FormsModule,
    InputTextModule,
    Button,
    SlicePipe,
    Skeleton,
    IconField,
    InputIcon,
    TranslocoDirective,
    NgClass,
    TooltipModule
  ],
  styleUrls: ['./book-searcher.component.scss'],
  standalone: true
})
export class BookSearcherComponent implements OnInit, OnDestroy {
  searchQuery = '';
  books: Book[] = [];
  isLoading = false;
  activeIndex = -1;
  #searchSubject = new BehaviorSubject<string>('');
  #subscription!: Subscription;
  isSearchFocused = false;

  private bookService = inject(BookService);
  private router = inject(Router);
  protected urlHelper = inject(UrlHelperService);
  private readonly t = inject(TranslocoService);
  private elRef = inject(ElementRef);
  private aiSearchDialogService = inject(AiSearchDialogService);
  private appSettingsService = inject(AppSettingsService);

  aiSearchEnabled = false;
  searchStatus: 'READY' | 'STARTING' | 'ERROR' = 'READY';
  isSearchActive = false;
  isSearchError = false;
  private appSettingsSub?: Subscription;
  private pollingSub?: Subscription;
  private searchActiveSub?: Subscription;
  private searchErrorSub?: Subscription;

  ngOnInit(): void {
    this.#subscription = this.#searchSubject.pipe(
      debounceTime(200),
      distinctUntilChanged(),
      switchMap(term => {
        const normalizedTerm = term.trim();
        if (normalizedTerm.length < 2) {
          this.isLoading = false;
          return of([] as Book[]);
        }

        this.isLoading = true;

        return this.bookService.getBooksPaged({
          search: normalizedTerm,
          page: 0,
          size: 50,
        }).pipe(
          map(response => response.content.map(s => this.bookService.adaptGridSummaryToBook(s))),
          catchError(() => of([] as Book[]))
        );
      })
    ).subscribe({
      next: books => {
        this.isLoading = false;
        this.activeIndex = -1;
        this.books = books;
      }
    });

    this.searchActiveSub = this.aiSearchDialogService.searchActive$.subscribe(active => {
      this.isSearchActive = active;
    });

    this.searchErrorSub = this.aiSearchDialogService.searchError$.subscribe(error => {
      this.isSearchError = error;
    });

    this.appSettingsSub = this.appSettingsService.appSettings$.subscribe(settings => {
      this.aiSearchEnabled = settings?.aiSearchEnabled ?? false;
      if (this.aiSearchEnabled) {
        this.startAiStatusPolling();
      } else {
        this.stopAiStatusPolling();
      }
    });
  }

  private startAiStatusPolling(): void {
    if (this.pollingSub) return;
    
    const fetchStatus = () => {
      this.appSettingsService.getAiSearchServiceStatus().pipe(
        catchError(() => of({ status: 'load_failed' }))
      ).subscribe((res) => {
        if (res && res.status) {
          this.searchStatus = res.status as 'READY' | 'STARTING' | 'ERROR';
        }
      });
    };
    
    fetchStatus();
    this.pollingSub = interval(5000).subscribe(() => fetchStatus());
  }

  private stopAiStatusPolling(): void {
    if (this.pollingSub) {
      this.pollingSub.unsubscribe();
      this.pollingSub = undefined;
    }
  }

  getAuthorNames(authors: string[] | undefined): string {
    return authors?.join(', ') || this.t.translate('book.searcher.unknownAuthor');
  }

  getPublishedYear(publishedDate: string | undefined): string | null {
    if (!publishedDate) return null;
    const year = publishedDate.split('-')[0];
    return year && year.length === 4 ? year : null;
  }

  getSeriesInfo(seriesName: string | undefined, seriesNumber: number | null | undefined): string | null {
    if (!seriesName) return null;
    if (seriesNumber) {
      return `${seriesName} #${seriesNumber}`;
    }
    return seriesName;
  }

  onSearchInputChange(): void {
    this.#searchSubject.next(this.searchQuery.trim());
  }

  onBookClick(book: Book): void {
    this.clearSearch();
    this.router.navigate(['/book', book.id], {
      queryParams: {tab: 'view', returnTo: this.router.url}
    });
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.books = [];
    this.isLoading = false;
  }

  openAiSearch(): void {
    this.aiSearchDialogService.open();
  }

  get isDropdownOpen(): boolean {
    return this.books.length > 0 || this.isLoading;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.clearSearch();
      this.isSearchFocused = false;
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (!this.isDropdownOpen) return;

    switch (event.key) {
      case 'ArrowDown':
        this.activeIndex = Math.min(this.activeIndex + 1, this.books.length - 1);
        event.preventDefault();
        break;
      case 'ArrowUp':
        this.activeIndex = Math.max(this.activeIndex - 1, 0);
        event.preventDefault();
        break;
      case 'Enter':
        if (this.activeIndex >= 0 && this.activeIndex < this.books.length) {
          this.onBookClick(this.books[this.activeIndex]);
        }
        break;
      case 'Escape':
        this.clearSearch();
        (event.target as HTMLElement).blur();
        break;
    }
  }

  ngOnDestroy(): void {
    if (this.#subscription) {
      this.#subscription.unsubscribe();
    }
    if (this.appSettingsSub) {
      this.appSettingsSub.unsubscribe();
    }
    this.searchActiveSub?.unsubscribe();
    this.searchErrorSub?.unsubscribe();
    this.stopAiStatusPolling();
  }
}
