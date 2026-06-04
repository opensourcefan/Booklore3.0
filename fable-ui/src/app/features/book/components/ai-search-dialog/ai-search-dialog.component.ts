import {Component, inject, OnDestroy, Injectable, OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {InputTextModule} from 'primeng/inputtext';
import {Button} from 'primeng/button';
import {DialogModule} from 'primeng/dialog';
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
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

export interface ChatMessage {
  query: string;
  answer: string | null;
  results: AiSearchChunkResult[];
  isLoading: boolean;
}

@Injectable({providedIn: 'root'})
export class AiSearchDialogService {
  private openCommand = new Subject<number | null>();
  openCommand$ = this.openCommand.asObservable();

  private readonly STORAGE_KEY = 'fable_ai_search_cache';

  cachedSearchQuery = '';
  cachedResults: AiSearchChunkResult[] = [];
  cachedHasSearched = false;
  cachedAnswer: string | null = null;
  cachedChatHistory: ChatMessage[] = [];
  cachedSingleBookId: number | null = null;
  cachedVisible = false;

  constructor() {
    this.loadFromStorage();
  }

  saveToStorage() {
    try {
      const data = {
        q: this.cachedSearchQuery,
        r: this.cachedResults,
        h: this.cachedHasSearched,
        a: this.cachedAnswer,
        ch: this.cachedChatHistory,
        bId: this.cachedSingleBookId,
        v: this.cachedVisible
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save AI search state', e);
    }
  }

  loadFromStorage() {
    try {
      const dataStr = localStorage.getItem(this.STORAGE_KEY);
      if (dataStr) {
        const data = JSON.parse(dataStr);
        this.cachedSearchQuery = data.q || '';
        this.cachedResults = data.r || [];
        this.cachedHasSearched = !!data.h;
        this.cachedAnswer = data.a || null;
        this.cachedChatHistory = data.ch || [];
        this.cachedSingleBookId = data.bId || null;
        this.cachedVisible = !!data.v;
      }
    } catch (e) {
      console.error('Failed to load AI search state', e);
    }
  }

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
  chatHistory: ChatMessage[] = [];
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
    // Restore state from service
    this.searchQuery = this.aiSearchDialogService.cachedSearchQuery;
    this.results = this.aiSearchDialogService.cachedResults;
    this.hasSearched = this.aiSearchDialogService.cachedHasSearched;
    this.answer = this.aiSearchDialogService.cachedAnswer;
    this.chatHistory = this.aiSearchDialogService.cachedChatHistory || [];
    this.singleBookId = this.aiSearchDialogService.cachedSingleBookId;
    this.visible = this.aiSearchDialogService.cachedVisible;

    this.openSub = this.aiSearchDialogService.openCommand$.subscribe(bookId => {
      this.open(bookId);
    });
  }

  private markdownRenderer = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
  });

  markdownToHtml(markdown: string | null): string {
    if (!markdown) return '';
    // Fix inline lists generated by lazy LLMs by adding newlines before " 1. ", " 2. ", etc.
    const fixedMarkdown = markdown.replace(/(^|\s+)(\d+\.)/g, '\n$2');
    const html = this.markdownRenderer.render(fixedMarkdown);
    return DOMPurify.sanitize(html);
  }

  private singleBookId: number | null = null;

  clearResults(): void {
    this.searchQuery = '';
    this.results = [];
    this.answer = null;
    this.chatHistory = [];
    this.hasSearched = false;
    this.isLoading = false;
    if (this.searchSub) {
      this.searchSub.unsubscribe();
    }
    this.saveStateToCache();
  }

  private saveStateToCache(): void {
    this.aiSearchDialogService.cachedSearchQuery = this.searchQuery;
    this.aiSearchDialogService.cachedResults = this.results;
    this.aiSearchDialogService.cachedHasSearched = this.hasSearched;
    this.aiSearchDialogService.cachedAnswer = this.answer;
    this.aiSearchDialogService.cachedChatHistory = this.chatHistory;
    this.aiSearchDialogService.cachedSingleBookId = this.singleBookId;
    this.aiSearchDialogService.cachedVisible = this.visible;
    this.aiSearchDialogService.saveToStorage();
  }

  open(bookId: number | null = null): void {
    this.singleBookId = bookId;
    this.visible = true;
    this.saveStateToCache();
  }

  close(): void {
    this.visible = false;
    this.saveStateToCache();
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

  saveAnswerToNotepad(msg?: ChatMessage): void {
    const answerContent = msg ? msg.answer : this.answer;
    const queryContent = msg ? msg.query : this.searchQuery;
    const resultsData = msg ? msg.results : this.results;
    
    if (!answerContent) return;
    const user = this.userService.getCurrentUser();
    if (!user) return;

    const bookId = this.singleBookId || (resultsData && resultsData.length > 0 ? resultsData[0].bookId : 0);
    if (!bookId) return;

    const request: CreateBookNoteV2Request = {
      bookId: bookId,
      cfi: 'ai-search-answer',
      selectedText: answerContent,
      noteContent: `AI Search Answer: ${queryContent}`
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

    // Create a new message block for the UI
    const currentMessage: ChatMessage = {
      query: query,
      answer: null,
      results: [],
      isLoading: true
    };
    this.chatHistory.push(currentMessage);
    
    // Limit chat history to max 3 items
    if (this.chatHistory.length > 3) {
      this.chatHistory = this.chatHistory.slice(this.chatHistory.length - 3);
    }
    
    // Clear the input box immediately to feel responsive
    this.searchQuery = '';
    this.saveStateToCache();

    // Scroll to bottom (simple timeout to wait for angular rendering)
    setTimeout(() => {
      const el = document.querySelector('.ai-search-dialog .p-dialog-content') || document.querySelector('.ai-search-body');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);

    const user = this.userService.getCurrentUser();
    if (!user) {
      this.isLoading = false;
      currentMessage.isLoading = false;
      return;
    }

    const bookIds = this.singleBookId ? [this.singleBookId] : [];

    // Extract the last 3 turns of history for context to avoid overloading the context window
    const historyPayload = this.chatHistory
      .slice(0, -1) // Exclude current ongoing query
      .slice(-3) // Take max 3 previous turns
      .filter(m => m.answer != null)
      .flatMap(m => [
        { role: 'user', content: m.query },
        { role: 'assistant', content: m.answer! }
      ]);

    this.searchSub = this.appSettingsService.searchWithAi(query, bookIds, user.id, historyPayload).subscribe({
      next: (result) => {
        this.isLoading = false;
        currentMessage.isLoading = false;
        currentMessage.results = result.results || [];
        currentMessage.answer = result.answer || null;
        
        // Update top-level variables for backward compatibility if needed in UI
        this.results = currentMessage.results;
        this.answer = currentMessage.answer;
        
        this.saveStateToCache();
        setTimeout(() => {
          const el = document.querySelector('.ai-search-dialog .p-dialog-content') || document.querySelector('.ai-search-body');
          if (el) el.scrollTop = el.scrollHeight;
        }, 50);
      },
      error: () => {
        this.isLoading = false;
        currentMessage.isLoading = false;
        currentMessage.results = [];
        this.saveStateToCache();
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

  openTopResultInReader(msg?: ChatMessage): void {
    const resultsData = msg ? msg.results : this.results;
    if (resultsData && resultsData.length > 0) {
      this.readBookAtPage(resultsData[0]);
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.onSearch();
    }
  }

  ngOnDestroy(): void {
    this.saveStateToCache();
    this.searchSub?.unsubscribe();
    this.openSub?.unsubscribe();
  }
}
