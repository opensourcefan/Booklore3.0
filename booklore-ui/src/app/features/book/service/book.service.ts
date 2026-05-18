import {inject, Injectable} from '@angular/core';
import {first, Observable, of, throwError} from 'rxjs';
import {HttpClient, HttpParams} from '@angular/common/http';
import {catchError, distinctUntilChanged, filter, finalize, map, shareReplay, tap} from 'rxjs/operators';
import {Book, BookDeletionResponse, BookRecommendation, BookSetting, BookStatusUpdateResponse, BookType, CreatePhysicalBookRequest, PersonalRatingUpdateResponse, ReadStatus} from '../model/book.model';
import {BookState} from '../model/state/book-state.model';
import {API_CONFIG} from '../../../core/config/api-config';
import {MessageService} from 'primeng/api';
import {ResetProgressType} from '../../../shared/constants/reset-progress-type';
import {AuthService} from '../../../shared/service/auth.service';
import {Router} from '@angular/router';
import {BookStateService} from './book-state.service';
import {BookSocketService} from './book-socket.service';
import {BookPatchService} from './book-patch.service';
import {TranslocoService} from '@jsverse/transloco';

export type RemoveFromLibraryMode = 'REMOVE_FOREVER' | 'REMOVE_UNTIL_NEXT_SCAN';

/** Paginated response from GET /api/v1/books/paged */
export interface AppPageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/** Parameters for the paginated book endpoint */
export interface PagedBooksParams {
  page?: number;
  size?: number;
  sorts?: string[];
  sort?: string;
  dir?: string;
  libraryId?: number;
  shelfId?: number;
  unshelved?: boolean;
  mediaTypes?: string[];
  search?: string;
  authors?: string[];
  categories?: string[];
  series?: string;
  publisher?: string;
  language?: string;
  isbn?: string;
  readStatus?: string;
  bookType?: string;
  contentRating?: string;
  filterMode?: string;
}

@Injectable({
  providedIn: 'root',
})
export class BookService {

  private readonly url = `${API_CONFIG.BASE_URL}/api/v1/books`;

  private http = inject(HttpClient);
  private messageService = inject(MessageService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private bookStateService = inject(BookStateService);
  private bookSocketService = inject(BookSocketService);
  private bookPatchService = inject(BookPatchService);
  private readonly t = inject(TranslocoService);

  private loading$: Observable<Book[]> | null = null;

  constructor() {
    this.authService.token$.pipe(
      distinctUntilChanged()
    ).subscribe(token => {
      if (token === null) {
        this.bookStateService.resetBookState();
        this.loading$ = null;
      } else {
        const current = this.bookStateService.getCurrentBookState();
        if (current.loaded && !current.books) {
          this.bookStateService.updateBookState({
            books: null,
            loaded: false,
            error: null,
          });
          this.loading$ = null;
        }
      }
    });
  }

  /*------------------ State Management ------------------*/

  bookState$ = this.bookStateService.bookState$.pipe(
    tap(state => {
      if (!state.loaded && !state.error && !this.loading$) {
        this.startBookLoading();
      }
    })
  );

  private startBookLoading(): void {
    this.loading$ = this.fetchBooks().pipe(
      shareReplay(1),
      finalize(() => (this.loading$ = null))
    );
    this.loading$.subscribe();
  }

  getCurrentBookState(): BookState {
    return this.bookStateService.getCurrentBookState();
  }

  private fetchBooks(): Observable<Book[]> {
    return this.http.get<Book[]>(this.url).pipe(
      map(bookList => {
        this.bookStateService.updateBookState({
          books: bookList,
          loaded: true,
          error: null,
        });
        return bookList;
      }),
      catchError(error => {
        const curr = this.bookStateService.getCurrentBookState();
        this.bookStateService.updateBookState({
          books: curr.books,
          loaded: true,
          error: error.message,
        });
        throw error;
      })
    );
  }

  /**
   * Fetch paginated books with server-side sort and filter support.
   * Corresponds to GET /api/v1/books/paged.
   */
  getBooksPaged(params: PagedBooksParams = {}): Observable<AppPageResponse<Book>> {
    let httpParams = new HttpParams()
      .set('page', String(params.page ?? 0))
      .set('size', String(params.size ?? 50));

    if (params.sorts?.length) {
      params.sorts.forEach(s => httpParams = httpParams.append('sorts', s));
    }
    if (params.sort) httpParams = httpParams.set('sort', params.sort);
    if (params.dir) httpParams = httpParams.set('dir', params.dir);
    if (params.libraryId != null) httpParams = httpParams.set('libraryId', String(params.libraryId));
    if (params.shelfId != null) httpParams = httpParams.set('shelfId', String(params.shelfId));
    if (params.unshelved) httpParams = httpParams.set('unshelved', 'true');
    if (params.mediaTypes?.length) {
      params.mediaTypes.forEach(mediaType => httpParams = httpParams.append('mediaTypes', mediaType));
    }
    if (params.search) httpParams = httpParams.set('search', params.search);
    if (params.authors?.length) {
      params.authors.forEach(a => httpParams = httpParams.append('authors', a));
    }
    if (params.categories?.length) {
      params.categories.forEach(c => httpParams = httpParams.append('categories', c));
    }
    if (params.series) httpParams = httpParams.set('series', params.series);
    if (params.publisher) httpParams = httpParams.set('publisher', params.publisher);
    if (params.language) httpParams = httpParams.set('language', params.language);
    if (params.isbn) httpParams = httpParams.set('isbn', params.isbn);
    if (params.readStatus) httpParams = httpParams.set('readStatus', params.readStatus);
    if (params.bookType) httpParams = httpParams.set('bookType', params.bookType);
    if (params.contentRating) httpParams = httpParams.set('contentRating', params.contentRating);
    if (params.filterMode) httpParams = httpParams.set('filterMode', params.filterMode);

    return this.http.get<AppPageResponse<Book>>(`${this.url}/paged`, { params: httpParams });
  }

  getBooksCount(params: Omit<PagedBooksParams, 'page' | 'size'> = {}): Observable<number> {
    return this.getBooksPaged({
      ...params,
      page: 0,
      size: 1,
    }).pipe(
      map(response => response.totalElements)
    );
  }

  refreshBooks(): Observable<Book[]> {
    return this.http.get<Book[]>(this.url).pipe(
      tap(bookList => {
        this.bookStateService.updateBookState({
          books: bookList,
          loaded: true,
          error: null,
        });
      }),
      catchError(error => {
        const curr = this.bookStateService.getCurrentBookState();
        this.bookStateService.updateBookState({
          books: curr.books,
          loaded: true,
          error: error.message,
        });
        return of(curr.books || []);
      })
    );
  }

  removeBooksByLibraryId(libraryId: number): void {
    const currentState = this.bookStateService.getCurrentBookState();
    const currentBooks = currentState.books || [];
    const filteredBooks = currentBooks.filter(book => book.libraryId !== libraryId);
    this.bookStateService.updateBookState({...currentState, books: filteredBooks});
  }

  removeBooksFromShelf(shelfId: number): void {
    const currentState = this.bookStateService.getCurrentBookState();
    const currentBooks = currentState.books || [];
    const updatedBooks = currentBooks.map(book => ({
      ...book,
      shelves: book.shelves?.filter(shelf => shelf.id !== shelfId),
    }));
    this.bookStateService.updateBookState({...currentState, books: updatedBooks});
  }

  /*------------------ Book Retrieval ------------------*/

  getBookByIdFromState(bookId: number): Book | undefined {
    return this.bookStateService.getBookById(+bookId);
  }

  getBooksByIdsFromState(bookIds: number[]): Book[] {
    return this.bookStateService.getBooksByIds(bookIds);
  }

  getBookByIdFromAPI(bookId: number, withDescription: boolean): Observable<Book> {
    return this.http.get<Book>(`${this.url}/${bookId}`, {
      params: {
        withDescription: withDescription.toString()
      }
    });
  }

  getBooksInSeries(bookId: number): Observable<Book[]> {
    return this.bookStateService.bookState$.pipe(
      filter(state => state.loaded),
      first(),
      map(state => {
        const allBooks = state.books || [];
        const currentBook = allBooks.find(b => b.id === bookId);

        if (!currentBook || !currentBook.metadata?.seriesName) {
          return [];
        }

        const seriesName = currentBook.metadata.seriesName.toLowerCase();
        return allBooks.filter(b => b.metadata?.seriesName?.toLowerCase() === seriesName);
      })
    );
  }

  getBookRecommendations(bookId: number, limit = 20): Observable<BookRecommendation[]> {
    return this.http.get<BookRecommendation[]>(`${this.url}/${bookId}/recommendations`, {
      params: {limit: limit.toString()}
    });
  }

  /*------------------ Book Operations ------------------*/

  deleteBooks(ids: Set<number>, deleteFromDisk = true, removeMode: RemoveFromLibraryMode = 'REMOVE_FOREVER'): Observable<BookDeletionResponse> {
    const idList = Array.from(ids);
    let params = new HttpParams().set('ids', idList.join(',')).set('deleteFromDisk', String(deleteFromDisk));
    if (!deleteFromDisk) {
      params = params.set('removeMode', removeMode);
    }

    return this.http.delete<BookDeletionResponse>(this.url, {params}).pipe(
      tap(response => {
        const deletedIds = new Set((response.deleted || []).map(id => Number(id)));
        const currentState = this.bookStateService.getCurrentBookState();
        const remainingBooks = (currentState.books || []).filter(
          book => !deletedIds.has(book.id)
        );

        this.bookStateService.updateBookState({
          books: remainingBooks,
          loaded: true,
          error: null,
        });

        if (deleteFromDisk && response.failedFileDeletions?.length > 0) {
          this.messageService.add({
            severity: 'warn',
            summary: this.t.translate('book.bookService.toast.someFilesNotDeletedSummary'),
            detail: this.t.translate('book.bookService.toast.someFilesNotDeletedDetail', {fileNames: response.failedFileDeletions.join(', ')}),
          });
        } else if (deleteFromDisk) {
          this.messageService.add({
            severity: 'success',
            summary: this.t.translate('book.bookService.toast.booksDeletedSummary'),
            detail: this.t.translate('book.bookService.toast.booksDeletedDetail', {count: deletedIds.size}),
          });
        } else {
          this.messageService.add({
            severity: 'success',
            summary: this.t.translate('book.bookService.toast.booksRemovedSummary'),
            detail: this.t.translate('book.bookService.toast.booksRemovedDetail', {count: deletedIds.size}),
          });
        }
      }),
      catchError(error => {
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('book.bookService.toast.deleteFailedSummary'),
          detail: error?.error?.message || error?.message || this.t.translate('book.bookService.toast.deleteFailedDetail'),
        });
        return throwError(() => error);
      })
    );
  }

  updateBookShelves(bookIds: Set<number | undefined>, shelvesToAssign: Set<number | null | undefined>, shelvesToUnassign: Set<number | null | undefined>): Observable<Book[]> {
    return this.bookPatchService.updateBookShelves(bookIds, shelvesToAssign, shelvesToUnassign).pipe(
      catchError(error => {
        const currentState = this.bookStateService.getCurrentBookState();
        this.bookStateService.updateBookState({...currentState, error: error.message});
        throw error;
      })
    );
  }

  updateFileType(bookIds: Set<number | undefined>, fileType: string | null): Observable<Book[]> {
    return this.bookPatchService.updateFileType(bookIds, fileType).pipe(
      catchError(error => {
        const currentState = this.bookStateService.getCurrentBookState();
        this.bookStateService.updateBookState({...currentState, error: error.message});
        throw error;
      })
    );
  }

  createPhysicalBook(request: CreatePhysicalBookRequest): Observable<Book> {
    return this.http.post<Book>(`${this.url}/physical`, request).pipe(
      tap(newBook => {
        this.bookSocketService.handleNewlyCreatedBook(newBook);
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('book.bookService.toast.physicalBookCreatedSummary'),
          detail: this.t.translate('book.bookService.toast.physicalBookCreatedDetail', {title: newBook.metadata?.title || 'Book'})
        });
      }),
      catchError(error => {
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('book.bookService.toast.creationFailedSummary'),
          detail: error?.error?.message || error?.message || this.t.translate('book.bookService.toast.creationFailedDetail')
        });
        return throwError(() => error);
      })
    );
  }

  togglePhysicalFlag(bookId: number, physical: boolean): Observable<Book> {
    return this.http.patch<Book>(`${this.url}/${bookId}/physical`, null, {params: {physical}}).pipe(
      tap(_updatedBook => {
        const currentState = this.bookStateService.getCurrentBookState();
        const updatedBooks = (currentState.books || []).map(b => b.id === bookId ? {...b, isPhysical: physical} : b);
        this.bookStateService.updateBookState({...currentState, books: updatedBooks});
      })
    );
  }

  /*------------------ Reading & Viewer Settings ------------------*/

  readBook(bookId: number, reader?: 'epub-streaming', explicitBookType?: BookType): void {
    const book = this.getBookByIdFromState(bookId);

    if (!book) {
      console.error('Book not found');
      return;
    }

    const bookType: BookType | undefined = explicitBookType ?? book.primaryFile?.bookType;
    const isAlternativeFormat = explicitBookType && explicitBookType !== book.primaryFile?.bookType;

    let baseUrl: string | null = null;
    const queryParams: Record<string, string | boolean> = {};

    switch (bookType) {
      case 'PDF':
        baseUrl = 'pdf-reader';
        break;

      case 'EPUB':
        baseUrl = 'ebook-reader';
        if (reader === 'epub-streaming') {
          queryParams['streaming'] = true;
        }
        break;

      case 'FB2':
      case 'MOBI':
      case 'AZW3':
        baseUrl = 'ebook-reader';
        break;

      case 'CBX':
        baseUrl = 'cbx-reader';
        break;

      case 'AUDIOBOOK':
        baseUrl = 'audiobook-player';
        break;
    }

    if (!baseUrl) {
      console.error('Unsupported book type:', bookType);
      return;
    }

    if (isAlternativeFormat && bookType) {
      queryParams['bookType'] = bookType;
    }

    const hasQueryParams = Object.keys(queryParams).length > 0;
    this.router.navigate([`/${baseUrl}/book/${book.id}`], hasQueryParams ? {queryParams} : undefined);

    this.updateLastReadTime(book.id);
  }

  getBookSetting(bookId: number, bookFileId: number): Observable<BookSetting> {
    return this.http.get<BookSetting>(`${this.url}/${bookId}/viewer-setting?bookFileId=${bookFileId}`);
  }

  updateViewerSetting(bookSetting: BookSetting, bookId: number): Observable<void> {
    return this.http.put<void>(`${this.url}/${bookId}/viewer-setting`, bookSetting);
  }

  /*------------------ Progress & Status Tracking ------------------*/

  updateLastReadTime(bookId: number): void {
    this.bookPatchService.updateLastReadTime(bookId);
  }

  savePdfProgress(bookId: number, page: number, percentage: number, bookFileId?: number): Observable<void> {
    return this.bookPatchService.savePdfProgress(bookId, page, percentage, bookFileId);
  }

  saveCbxProgress(bookId: number, page: number, percentage: number, bookFileId?: number): Observable<void> {
    return this.bookPatchService.saveCbxProgress(bookId, page, percentage, bookFileId);
  }

  updateDateFinished(bookId: number, dateFinished: string | null): Observable<void> {
    return this.bookPatchService.updateDateFinished(bookId, dateFinished);
  }

  resetProgress(bookIds: number | number[], type: ResetProgressType): Observable<BookStatusUpdateResponse[]> {
    return this.bookPatchService.resetProgress(bookIds, type);
  }

  updateBookReadStatus(bookIds: number | number[], status: ReadStatus): Observable<BookStatusUpdateResponse[]> {
    return this.bookPatchService.updateBookReadStatus(bookIds, status);
  }

  updateBookCurrentlyReadingStatus(bookId: number, isCurrentlyReading: boolean): Observable<Book> {
    const params = new HttpParams().set('isCurrentlyReading', isCurrentlyReading.toString());
    return this.http.patch<Book>(`${this.url}/${bookId}`, null, { params }).pipe(
      tap(_updatedBook => {
        const currentState = this.bookStateService.getCurrentBookState();
        const updatedBooks = (currentState.books || []).map(b => b.id === bookId ? {...b, isCurrentlyReading} : b);
        this.bookStateService.updateBookState({...currentState, books: updatedBooks});
      })
    );
  }

  /*------------------ Personal Rating ------------------*/

  resetPersonalRating(bookIds: number | number[]): Observable<PersonalRatingUpdateResponse[]> {
    return this.bookPatchService.resetPersonalRating(bookIds);
  }

  updatePersonalRating(bookIds: number | number[], rating: number): Observable<PersonalRatingUpdateResponse[]> {
    return this.bookPatchService.updatePersonalRating(bookIds, rating);
  }

  /*------------------ Websocket Handlers ------------------*/

  handleNewlyCreatedBook(book: Book): void {
    this.bookSocketService.handleNewlyCreatedBook(book);
  }

  handleRemovedBookIds(removedBookIds: number[]): void {
    this.bookSocketService.handleRemovedBookIds(removedBookIds);
  }

  handleBookUpdate(updatedBook: Book): void {
    this.bookSocketService.handleBookUpdate(updatedBook);
  }

  handleMultipleBookUpdates(updatedBooks: Book[]): void {
    this.bookSocketService.handleMultipleBookUpdates(updatedBooks);
  }

  handleMultipleBookCoverPatches(patches: { id: number; coverUpdatedOn: string }[]): void {
    this.bookSocketService.handleMultipleBookCoverPatches(patches);
  }

  clearAiPanelDataFromState(): void {
    const currentState = this.bookStateService.getCurrentBookState();
    const updatedBooks = (currentState.books || []).map(book => ({
      ...book,
      hasAiPanelData: false
    }));
    this.bookStateService.updateBookState({ ...currentState, books: updatedBooks });
  }
}
