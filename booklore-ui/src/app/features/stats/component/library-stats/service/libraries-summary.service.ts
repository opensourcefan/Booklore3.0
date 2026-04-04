import {inject, Injectable} from '@angular/core';
import {combineLatest, map, Observable, shareReplay, switchMap} from 'rxjs';
import {LibraryFilterService} from './library-filter.service';
import {BookService} from '../../../../book/service/book.service';
import {AppSettingsService} from '../../../../../shared/service/app-settings.service';
import {AiPanelFlowStats} from '../../../../../shared/model/app-settings.model';

@Injectable({
  providedIn: 'root'
})
export class LibrariesSummaryService {
  private bookService = inject(BookService);
  private libraryFilterService = inject(LibraryFilterService);
  private appSettingsService = inject(AppSettingsService);

  selectedLibrary$ = this.libraryFilterService.selectedLibrary$;

  private aiPanelFlowStats$ = this.selectedLibrary$.pipe(
    switchMap(selectedLibraryId => this.appSettingsService.getAiPanelFlowStats(selectedLibraryId)),
    shareReplay({bufferSize: 1, refCount: true})
  );

  getBooksSummary(): Observable<{
    totalBooks: number;
    totalSizeKb: number;
    totalAuthors: number;
    totalSeries: number;
    totalPublishers: number;
  }> {
    return combineLatest([
      this.bookService.bookState$,
      this.selectedLibrary$
    ]).pipe(
      map(([state, selectedLibraryId]) => {
        if (!state.loaded || !state.books || state.books.length === 0) {
          return {totalBooks: 0, totalSizeKb: 0, totalAuthors: 0, totalSeries: 0, totalPublishers: 0};
        }

        const filteredBooks = selectedLibraryId
          ? state.books.filter(book => book.libraryId === selectedLibraryId)
          : state.books;

        const totalBooks = filteredBooks.length;
        const totalSizeKb = filteredBooks.reduce((sum, book) => sum + (book.fileSizeKb || 0), 0);

        const authorSet = new Set<string>();
        const seriesSet = new Set<string>();
        const publisherSet = new Set<string>();

        filteredBooks.forEach(book => {
          if (Array.isArray(book.metadata?.authors)) {
            book.metadata.authors.forEach(a => {
              const name = a?.trim();
              if (name) authorSet.add(name);
            });
          }

          const seriesName = book.metadata?.seriesName?.trim();
          if (seriesName) seriesSet.add(seriesName);

          const publisher = book.metadata?.publisher?.trim();
          if (publisher) publisherSet.add(publisher);
        });

        return {
          totalBooks,
          totalSizeKb,
          totalAuthors: authorSet.size,
          totalSeries: seriesSet.size,
          totalPublishers: publisherSet.size
        };
      })
    );
  }

  getFormattedSize(): Observable<string> {
    return this.getBooksSummary().pipe(
      map(summary => this.formatSizeKb(summary.totalSizeKb))
    );
  }

  getAiPanelFlowStats(): Observable<AiPanelFlowStats> {
    return this.aiPanelFlowStats$.pipe(
      map(stats => stats ?? {scannedComicCount: 0, storedBytes: 0})
    );
  }

  getFormattedAiStorage(): Observable<string> {
    return this.aiPanelFlowStats$.pipe(
      map(stats => this.formatBytes(stats?.storedBytes ?? 0))
    );
  }

  private formatSizeKb(kb: number): string {
    if (!kb) return '0 KB';
    const kilo = 1024;
    const megaKb = kilo; // 1 MB = 1024 KB
    const gigaKb = kilo * megaKb; // 1 GB = 1024 * 1024 KB
    if (kb >= gigaKb) {
      return (kb / gigaKb).toFixed(2) + ' GB';
    }
    if (kb >= megaKb) {
      return (kb / megaKb).toFixed(2) + ' MB';
    }
    return kb + ' KB';
  }

  private formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
    return `${value.toFixed(digits)} ${units[unitIndex]}`;
  }
}
