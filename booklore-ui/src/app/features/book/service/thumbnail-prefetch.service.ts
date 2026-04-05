import {DOCUMENT, isPlatformBrowser} from '@angular/common';
import {inject, Injectable, PLATFORM_ID} from '@angular/core';
import {Router} from '@angular/router';
import {Book} from '../model/book.model';
import {UrlHelperService} from '../../../shared/service/url-helper.service';
import {BookService} from './book.service';

@Injectable({providedIn: 'root'})
export class ThumbnailPrefetchService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly bookService = inject(BookService);
  private readonly urlHelper = inject(UrlHelperService);

  private readonly maxPrefetchPerLibrary = 18;
  private readonly maxConcurrent = 2;
  private readonly prefetchedLibraries = new Set<number>();
  private readonly prefetchedUrls = new Set<string>();
  private readonly queuedUrls = new Set<string>();
  private readonly queue: string[] = [];
  private readonly inFlight = new Map<string, HTMLImageElement>();
  private idleHandle: number | null = null;

  prefetchLibrary(libraryId: number): void {
    if (!this.isBrowser()) {
      return;
    }
    if (this.isCurrentLibrary(libraryId) || this.prefetchedLibraries.has(libraryId)) {
      return;
    }

    const state = this.bookService.getCurrentBookState();
    if (!state.loaded || !state.books?.length) {
      return;
    }

    const urls = state.books
      .filter(book => book.libraryId === libraryId)
      .map(book => this.getThumbnailUrl(book))
      .filter((url): url is string => !!url)
      .slice(0, this.maxPrefetchPerLibrary);

    if (!urls.length) {
      return;
    }

    this.prefetchedLibraries.add(libraryId);
    urls.forEach(url => this.enqueue(url));
    this.scheduleDrain();
  }

  private getThumbnailUrl(book: Book): string | null {
    if (book.id == null) {
      return null;
    }

    const url = book.primaryFile?.bookType === 'AUDIOBOOK'
      ? this.urlHelper.getAudiobookThumbnailUrl(book.id, book.metadata?.audiobookCoverUpdatedOn)
      : this.urlHelper.getThumbnailUrl(book.id, book.metadata?.coverUpdatedOn);

    return url.startsWith('data:') ? null : url;
  }

  private enqueue(url: string): void {
    if (this.prefetchedUrls.has(url) || this.queuedUrls.has(url) || this.inFlight.has(url)) {
      return;
    }

    this.queuedUrls.add(url);
    this.queue.push(url);
  }

  private scheduleDrain(): void {
    const win = this.getWindow();
    if (!win || this.idleHandle !== null || !this.queue.length) {
      return;
    }

    const requestIdleCallback = 'requestIdleCallback' in win
      ? win.requestIdleCallback?.bind(win)
      : null;

    if (requestIdleCallback) {
      this.idleHandle = requestIdleCallback(() => {
        this.idleHandle = null;
        this.drainQueue();
      }, {timeout: 800});
      return;
    }

    this.idleHandle = win.setTimeout(() => {
      this.idleHandle = null;
      this.drainQueue();
    }, 250);
  }

  private drainQueue(): void {
    while (this.inFlight.size < this.maxConcurrent && this.queue.length) {
      const nextUrl = this.queue.shift();
      if (!nextUrl) {
        continue;
      }

      this.queuedUrls.delete(nextUrl);
      if (this.prefetchedUrls.has(nextUrl) || this.inFlight.has(nextUrl)) {
        continue;
      }

      this.startPrefetch(nextUrl);
    }

    if (this.queue.length) {
      this.scheduleDrain();
    }
  }

  private startPrefetch(url: string): void {
    const win = this.getWindow();
    if (!win) {
      return;
    }

    const image = new Image();
    image.decoding = 'async';
    (image as HTMLImageElement & {fetchPriority?: 'high' | 'low' | 'auto'}).fetchPriority = 'low';

    const finalize = () => {
      image.onload = null;
      image.onerror = null;
      this.inFlight.delete(url);
      this.scheduleDrain();
    };

    image.onload = () => {
      this.prefetchedUrls.add(url);
      finalize();
    };
    image.onerror = () => finalize();

    this.inFlight.set(url, image);
    image.src = url;
  }

  private isCurrentLibrary(libraryId: number): boolean {
    return this.router.url.split('?')[0] === `/library/${libraryId}/books`;
  }

  private isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  private getWindow(): Window | null {
    return this.document.defaultView;
  }
}