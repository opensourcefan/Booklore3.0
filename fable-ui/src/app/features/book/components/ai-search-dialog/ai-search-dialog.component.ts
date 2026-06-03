import {Component, inject, OnDestroy, Injectable, OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {InputTextModule} from 'primeng/inputtext';
import {Button} from 'primeng/button';
import {DialogModule} from 'primeng/dialog';
import {Skeleton} from 'primeng/skeleton';
import {SlicePipe} from '@angular/common';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {AppSettingsService} from '../../../../shared/service/app-settings.service';
import {UserService} from '../../../settings/user-management/user.service';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {Router} from '@angular/router';
import {AiSearchChunkResult} from '../../../../shared/model/app-settings.model';
import {Subscription, Subject} from 'rxjs';
import {TooltipModule} from 'primeng/tooltip';
import {MessageService} from 'primeng/api';
import {BookNoteService, CreateBookNoteV2Request} from '../../../../shared/service/book-note.service';
import {BookService} from '../../service/book.service';
import {SidebarBadgeRefreshService} from '../../service/sidebar-badge-refresh.service';
import {CoverGeneratorComponent} from '../../../../shared/components/cover-generator/cover-generator.component';

@Injectable({providedIn: 'root'})
export class AiSearchDialogService {
  private openCommand = new Subject<number | null>();
  openCommand$ = this.openCommand.asObservable();

  open(bookId: number | null = null) {
    this.openCommand.next(bookId);
  }
}

@Component({
  selector: 'app-ai-search-dialog',
  templateUrl: './ai-search-dialog.component.html',
  styleUrls: ['./ai-search-dialog.component.scss'],
  imports: [
    FormsModule,
    InputTextModule,
    Button,
    DialogModule,
    Skeleton,
    SlicePipe,
    TranslocoDirective,
    TooltipModule
  ],
  standalone: true
})
export class AiSearchDialogComponent implements OnInit, OnDestroy {
  visible = false;
  searchQuery = '';
  results: AiSearchChunkResult[] = [];
  isLoading = false;
  hasSearched = false;
  answer: string | null = null;
  selectedResult: AiSearchChunkResult | null = null;

  private appSettingsService = inject(AppSettingsService);
  private userService = inject(UserService);
  protected urlHelper = inject(UrlHelperService);
  private router = inject(Router);
  private readonly t = inject(TranslocoService);
  private bookNoteService = inject(BookNoteService);
  private messageService = inject(MessageService);
  private sidebarBadgeRefresh = inject(SidebarBadgeRefreshService);

  private aiSearchDialogService = inject(AiSearchDialogService);

  private searchSub?: Subscription;
  private openSub?: Subscription;

  ngOnInit(): void {
    this.openSub = this.aiSearchDialogService.openCommand$.subscribe(bookId => {
      this.open(bookId);
    });
  }

  private singleBookId: number | null = null;

  open(bookId: number | null = null): void {
    this.singleBookId = bookId;
    this.visible = true;
    this.searchQuery = '';
  }

  close(): void {
    this.visible = false;
  }

  clearResults(): void {
    this.results = [];
    this.answer = null;
    this.hasSearched = false;
    this.selectedResult = null;
    this.searchQuery = '';
  }

  saveToNotepad(result: AiSearchChunkResult): void {
    const user = this.userService.getCurrentUser();
    if (!user) return;

    const title = `${result.bookTitle} - ${this.searchQuery}`;
    const dummyCfi = result.pageNumber ? `page=${result.pageNumber}` : 'ai-search-result';

    const request: CreateBookNoteV2Request = {
      bookId: result.bookId,
      cfi: dummyCfi,
      selectedText: result.chunkText,
      noteContent: title,
      chapterTitle: result.chapterTitle || undefined
    };

    this.bookNoteService.createOrUpdateNote(request).subscribe({
      next: () => {
        this.sidebarBadgeRefresh.requestRefresh();
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('Saved to Notepad'),
          detail: this.t.translate('The search result has been saved to your notepad.')
        });
      },
      error: (err) => {
        console.error('Failed to save to notepad:', err);
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('Save Failed'),
          detail: this.t.translate('Failed to save to notepad.')
        });
      }
    });
  }

  saveAnswerToNotepad(): void {
    if (!this.answer) return;
    const user = this.userService.getCurrentUser();
    if (!user) return;

    const bookId = this.singleBookId || (this.results.length > 0 ? this.results[0].bookId : 0);
    if (!bookId) return;

    const request: CreateBookNoteV2Request = {
      bookId: bookId,
      cfi: 'ai-search-answer',
      selectedText: this.answer,
      noteContent: `AI Search Answer: ${this.searchQuery}`
    };

    this.bookNoteService.createOrUpdateNote(request).subscribe({
      next: () => {
        this.sidebarBadgeRefresh.requestRefresh();
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('Saved to Notepad'),
          detail: this.t.translate('The AI answer has been saved to your notepad.')
        });
      },
      error: (err) => {
        console.error('Failed to save answer to notepad:', err);
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('Save Failed'),
          detail: this.t.translate('Failed to save answer to notepad.')
        });
      }
    });
  }

  onSearch(): void {
    const query = this.searchQuery.trim();
    if (query.length < 2) {
      return;
    }

    this.isLoading = true;
    this.hasSearched = true;
    this.answer = null;

    const user = this.userService.getCurrentUser();
    if (!user) {
      this.isLoading = false;
      return;
    }

    const bookIds = this.singleBookId ? [this.singleBookId] : [];

    this.searchSub = this.appSettingsService.searchWithAi(query, bookIds, user.id).subscribe({
      next: (result) => {
        this.isLoading = false;
        this.results = result.results || [];
        this.answer = result.answer || null;
      },
      error: () => {
        this.isLoading = false;
        this.results = [];
      },
    });
  }

  private bookService = inject(BookService);

  onResultClick(result: AiSearchChunkResult): void {
    this.selectedResult = result;
  }

  closeResultDetail(): void {
    this.selectedResult = null;
  }

  getCover(result: AiSearchChunkResult): string {
    const book = this.bookService.getBookByIdFromState(result.bookId);
    if (book && book.metadata?.coverUpdatedOn) {
      return this.urlHelper.getThumbnailUrl(result.bookId, book.metadata.coverUpdatedOn);
    }
    const coverGenerator = new CoverGeneratorComponent();
    coverGenerator.title = result.bookTitle || '';
    coverGenerator.author = '';
    return coverGenerator.generateCover();
  }

  readBookAtPage(result: AiSearchChunkResult): void {
    if (result.pageNumber) {
      this.bookService.readBook(result.bookId, undefined, undefined, result.pageNumber);
    } else {
      this.bookService.readBook(result.bookId);
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onSearch();
    }
  }

  ngOnDestroy(): void {
    this.searchSub?.unsubscribe();
    this.openSub?.unsubscribe();
  }
}
