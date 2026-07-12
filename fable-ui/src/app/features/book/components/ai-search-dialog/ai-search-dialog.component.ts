import {Component, inject, OnDestroy, Injectable, OnInit, ViewChild, ElementRef} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {InputTextModule} from 'primeng/inputtext';
import {Button} from 'primeng/button';
import {DialogModule} from 'primeng/dialog';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {AppSettingsService} from '../../../../shared/service/app-settings.service';
import {UserService} from '../../../settings/user-management/user.service';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {Router} from '@angular/router';
import {AiSearchChunkResult, AiSearchAnswerItem} from '../../../../shared/model/app-settings.model';
import {BehaviorSubject, Subscription, Subject} from 'rxjs';
import {TooltipModule} from 'primeng/tooltip';
import {Popover} from 'primeng/popover';
import {MessageService} from 'primeng/api';
import {FailureNotificationService} from '../../../../shared/service/failure-notification.service';
import {BookNoteService, CreateBookNoteV2Request} from '../../../../shared/service/book-note.service';
import {v4 as uuidv4} from 'uuid';
import {BookService} from '../../service/book.service';
import {SidebarBadgeRefreshService} from '../../service/sidebar-badge-refresh.service';
import {CoverGeneratorComponent} from '../../../../shared/components/cover-generator/cover-generator.component';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import {MobileUxService} from '../../../../core/services/mobile-ux.service';
import {DomSanitizer, SafeHtml} from '@angular/platform-browser';
import {MobileBackHandle, MobileBackNavigationService} from '../../../../shared/service/mobile-back-navigation.service';

export interface ChatMessage {
  query: string;
  answer: string | null;
  answerItems: AiSearchAnswerItem[] | null;
  results: AiSearchChunkResult[];
  contextResults?: AiSearchChunkResult[];
  isLoading: boolean;
  localOnly: boolean;
  answerHtml?: SafeHtml;
  answerItemsHtml?: SafeHtml[];
  resultsHtml?: SafeHtml[];
}

@Injectable({providedIn: 'root'})
export class AiSearchDialogService {
  private openCommand = new Subject<number[] | number | null>();
  openCommand$ = this.openCommand.asObservable();

  /** Emits true while a search HTTP request is in-flight, false when complete/errored. */
  searchActive$ = new BehaviorSubject<boolean>(false);

  /** Emits true when the last search resulted in an error or returned no results. */
  searchError$ = new BehaviorSubject<boolean>(false);

  /** Emits true when the AI search dialog is visible (open/focused). */
  dialogVisible$ = new BehaviorSubject<boolean>(false);

  private readonly STORAGE_KEY = 'fable_ai_search_cache';

  cachedSearchQuery = '';
  cachedResults: AiSearchChunkResult[] = [];
  cachedHasSearched = false;
  cachedAnswer: string | null = null;
  cachedChatHistory: ChatMessage[] = [];
  cachedSingleBookId: number | null = null;
  cachedScopeBookTitle: string | null = null;
  cachedBookIds: number[] = [];
  cachedScopeBooks: { id: number; title: string }[] = [];
  cachedVisible = false;
  cachedLocalOnly = false;

  constructor() {
    this.loadFromStorage();
  }

  saveToStorage() {
    try {
      const data = {
        q: this.cachedSearchQuery,
        r: (this.cachedResults || []).map(r => this.slimChunkForStorage(r)),
        h: this.cachedHasSearched,
        a: this.cachedAnswer,
        ch: (this.cachedChatHistory || []).map(m => this.slimChatMessageForStorage(m)),
        bId: this.cachedSingleBookId,
        bt: this.cachedScopeBookTitle,
        bIds: this.cachedBookIds,
        sbs: this.cachedScopeBooks,
        v: this.cachedVisible,
        lo: this.cachedLocalOnly
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
        this.cachedResults = (data.r || []).map((r: AiSearchChunkResult) => this.normalizeStoredChunk(r));
        this.cachedHasSearched = !!data.h;
        this.cachedAnswer = data.a || null;
        this.cachedChatHistory = (data.ch || []).map((m: ChatMessage) => this.normalizeStoredChatMessage(m));
        this.cachedSingleBookId = data.bId || null;
        this.cachedScopeBookTitle = data.bt || null;
        this.cachedBookIds = data.bIds || (data.bId ? [data.bId] : []);
        this.cachedScopeBooks = data.sbs || (data.bId && data.bt ? [{ id: data.bId, title: data.bt }] : []);
        this.cachedVisible = !!data.v;
        this.cachedLocalOnly = !!data.lo;
      }
    } catch (e) {
      console.error('Failed to load AI search state', e);
    }
  }

  /**
   * Persist source refs for restore/minimize without storing full book passages.
   * Omits chunkText / contextBefore / contextAfter (and ephemeral SafeHtml).
   */
  private slimChunkForStorage(r: AiSearchChunkResult): AiSearchChunkResult {
    return {
      chunkId: r.chunkId,
      bookId: r.bookId,
      bookTitle: r.bookTitle,
      chunkIndex: r.chunkIndex,
      chunkText: '',
      pageNumber: r.pageNumber ?? null,
      chapterTitle: r.chapterTitle ?? null,
      similarity: r.similarity ?? 0,
    };
  }

  private slimChatMessageForStorage(m: ChatMessage): ChatMessage {
    return {
      query: m.query,
      answer: m.answer,
      answerItems: m.answerItems,
      results: (m.results || []).map(r => this.slimChunkForStorage(r)),
      contextResults: (m.contextResults || []).map(r => this.slimChunkForStorage(r)),
      isLoading: false,
      localOnly: !!m.localOnly,
    };
  }

  private normalizeStoredChunk(r: AiSearchChunkResult): AiSearchChunkResult {
    return {
      chunkId: r.chunkId,
      bookId: r.bookId,
      bookTitle: r.bookTitle,
      chunkIndex: r.chunkIndex,
      chunkText: r.chunkText || '',
      pageNumber: r.pageNumber ?? null,
      chapterTitle: r.chapterTitle ?? null,
      similarity: r.similarity ?? 0,
    };
  }

  private normalizeStoredChatMessage(m: ChatMessage): ChatMessage {
    return {
      query: m.query || '',
      answer: m.answer ?? null,
      answerItems: m.answerItems ?? null,
      results: (m.results || []).map(r => this.normalizeStoredChunk(r)),
      contextResults: (m.contextResults || []).map(r => this.normalizeStoredChunk(r)),
      isLoading: false,
      localOnly: !!m.localOnly,
    };
  }

  open(bookIdsOrId: number[] | number | null = null) {
    this.searchError$.next(false);
    this.dialogVisible$.next(true);
    this.openCommand.next(bookIdsOrId);
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
    TooltipModule,
    Popover
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
  localOnly = false;
  expandedChunks = new Set<number>();
  aiSearchInfoHtml: SafeHtml = '';
  lastError: string | null = null;
  llmWarmed: boolean | null = null;
  isCheckingLlmWarmed = false;
  infoPopoverVisible = false;
  @ViewChild('infoPopover') infoPopover!: Popover;
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  private appSettingsService = inject(AppSettingsService);
  private userService = inject(UserService);
  protected urlHelper = inject(UrlHelperService);
  private router = inject(Router);
  private readonly t = inject(TranslocoService);
  private bookNoteService = inject(BookNoteService);
  private messageService = inject(MessageService);
  private failureNotifications = inject(FailureNotificationService);
  private sidebarBadgeRefresh = inject(SidebarBadgeRefreshService);

  private toastError(summary: string, detail: string, life = 3000): void {
    this.messageService.add({severity: 'error', summary, detail, life});
    this.failureNotifications.reportSafe(summary, detail);
  }

  private aiSearchDialogService = inject(AiSearchDialogService);
  public mobileUx = inject(MobileUxService);
  private sanitizer = inject(DomSanitizer);
  private mobileBackNavigation = inject(MobileBackNavigationService);
  private mobileBackHandle: MobileBackHandle | null = null;
  private detailBackHandle: MobileBackHandle | null = null;

  private searchSub?: Subscription;
  private openSub?: Subscription;

  ngOnInit(): void {
    // Pre-render the AI Search info content from markdown
    this.aiSearchInfoHtml = this.markdownToHtml(this.getAiSearchInfoMarkdown());

    // Restore state from service
    this.searchQuery = this.aiSearchDialogService.cachedSearchQuery;
    this.results = this.aiSearchDialogService.cachedResults;
    this.hasSearched = this.aiSearchDialogService.cachedHasSearched;
    this.answer = this.aiSearchDialogService.cachedAnswer;
    this.chatHistory = this.aiSearchDialogService.cachedChatHistory || [];
    this.chatHistory.forEach(msg => this.preRenderMessageHtml(msg));
    this.bookIds = this.aiSearchDialogService.cachedBookIds || (this.aiSearchDialogService.cachedSingleBookId ? [this.aiSearchDialogService.cachedSingleBookId] : []);
    this.scopeBooks = this.aiSearchDialogService.cachedScopeBooks || [];
    if (this.bookIds.length > 0 && this.scopeBooks.length === 0) {
      this.updateScopeBooks();
    }
    this.visible = this.aiSearchDialogService.cachedVisible;
    this.localOnly = this.aiSearchDialogService.cachedLocalOnly;

    this.openSub = this.aiSearchDialogService.openCommand$.subscribe(bookIdsOrId => {
      this.open(bookIdsOrId);
    });
    this.checkLlmWarmedStatus();
  }

  checkLlmWarmedStatus(): void {
    this.isCheckingLlmWarmed = true;
    this.appSettingsService.getAiSearchServiceStatus().subscribe({
      next: (res) => {
        this.isCheckingLlmWarmed = false;
        this.llmWarmed = res && res.serviceReachable && res.llmWarmed !== undefined ? res.llmWarmed : true;
      },
      error: () => {
        this.isCheckingLlmWarmed = false;
        this.llmWarmed = true;
      }
    });
  }

  hideInfoPopover(): void {
    if (this.infoPopover) {
      this.infoPopover.hide();
    }
  }

  private markdownRenderer = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
  });

  normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  markdownToHtml(markdown: string | null): SafeHtml {
    if (!markdown) return this.sanitizer.bypassSecurityTrustHtml('');
    // Fix inline lists generated by lazy LLMs by adding newlines before " 1. ", " 2. ", etc.
    // Negative lookahead prevents matching numbers followed by a citation (e.g. "Seaguy 3. [Source: ...]")
    const fixedMarkdown = markdown.replace(/(^|\s+)(\d+\.)(?!\s*\[Source)/g, '\n$2');
    let html = this.markdownRenderer.render(fixedMarkdown);

    // Single-pass regex replacement prevents double-wrapping of [Source: ...] blocks
    html = html.replace(
      /\[Source\s*(?:\d+)?:\s*([^\]]+)\]/g,
      (match, content) => {
        // Check if content matches the "Title, Page N" pattern
        const pageMatch = content.match(/^(.*?),\s*Page\s*(\d+)$/i);
        if (pageMatch) {
          const title = pageMatch[1].trim();
          const page = pageMatch[2].trim();
          const escapedTitle = title.replace(/"/g, '&quot;');
          return `<span class="ai-search-citation-highlight"><em>[Source: ${title}, <span class="ai-search-citation-page-link" data-book-title="${escapedTitle}" data-page="${page}" tabindex="0" role="link">Page ${page}</span>]</em></span>`;
        } else {
          // Falls back to title-only or non-numeric page formats
          const cleanTitle = content.replace(/,\s*Page\s*\w+/i, '').trim();
          const escapedTitle = cleanTitle.replace(/"/g, '&quot;');
          return `<span class="ai-search-citation-highlight"><em>[Source: <span class="ai-search-citation-page-link" data-book-title="${escapedTitle}" data-page="0" tabindex="0" role="link">${content}</span>]</em></span>`;
        }
      }
    );

    const sanitized = DOMPurify.sanitize(html, {
      ADD_ATTR: ['data-book-title', 'data-page', 'role', 'tabindex']
    });
    return this.sanitizer.bypassSecurityTrustHtml(sanitized);
  }

  preRenderMessageHtml(msg: ChatMessage): void {
    if (msg.answer) {
      msg.answerHtml = this.markdownToHtml(msg.answer);
    }
    if (msg.answerItems) {
      msg.answerItemsHtml = msg.answerItems.map(item =>
        this.markdownToHtml(item.text + ' [Source: ' + item.bookTitle + ', Page ' + (item.pageNumber || 'N/A') + ']')
      );
    }
    if (msg.results) {
      msg.resultsHtml = msg.results.map(result =>
        this.markdownToHtml(result.chunkText + ' [Source: ' + result.bookTitle + ', Page ' + (result.pageNumber || 'N/A') + ']')
      );
    }
  }

  /** Handles clicks on inline citation page links within the AI answer markdown.
   * Uses event delegation on the markdown content container to find the clicked
   * page link, resolve it to a result, and open the reader at that page. */
  onCitationClick(event: Event, results?: AiSearchChunkResult[] | null): void {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('ai-search-citation-page-link')) return;

    const bookTitle = target.getAttribute('data-book-title');
    const page = parseInt(target.getAttribute('data-page') || '0', 10);
    if (!bookTitle) return;

    const normBookTitle = this.normalizeTitle(bookTitle);
    const searchResults = results || this.results || [];

    // Find the exact result matching book title and page number.
    const result = searchResults.find(
      r => this.normalizeTitle(r.bookTitle) === normBookTitle && (page > 0 ? r.pageNumber === page : true)
    );
    if (result) {
      this.readBookAtPage(result);
      return;
    }

    // Fallback 1: find by book title alone within the search results (page may differ due to post-processing).
    const byTitle = searchResults.find(r => {
      const normR = this.normalizeTitle(r.bookTitle);
      return normR === normBookTitle || normR.includes(normBookTitle) || normBookTitle.includes(normR);
    });
    if (byTitle) {
      this.close();
      if (page > 0) {
        const adjustedResult = { ...byTitle, pageNumber: page };
        this.readBookAtPage(adjustedResult);
      } else {
        this.bookService.readBook(byTitle.bookId);
      }
      return;
    }

    // Fallback 2: find by book title in the entire library from state.
    const allBooks = this.bookService.getCurrentBookState()?.books || [];
    const libraryBook = allBooks.find(b => {
      const title = b.metadata?.title || b.fileName || '';
      const normT = this.normalizeTitle(title);
      return normT === normBookTitle || normT.includes(normBookTitle) || normBookTitle.includes(normT);
    });
    if (libraryBook) {
      this.close();
      if (page > 0) {
        this.bookService.readBook(libraryBook.id, undefined, undefined, page);
      } else {
        this.bookService.readBook(libraryBook.id);
      }
    }
  }

  /** Returns true if the LLM answer text references at least one of the source book titles. */
  answerReferencesSources(msg: ChatMessage): boolean {
    if (!msg.answer || !msg.results || msg.results.length === 0) return false;
    const answerLower = msg.answer.toLowerCase();
    return msg.results.some(r => answerLower.includes(r.bookTitle.toLowerCase()));
  }

  isRawDisplay(msg: ChatMessage): boolean {
    // Explicit RAW mode — always show as Raw Results.
    if (msg.localOnly) return true;
    // No answer means no AI synthesis — show as Raw Results if results exist.
    if (!msg.answer) return true;
    // Legacy search() always returns a proper markdown answer (never raw chunk
    // dumps), and never sets answerItems. The answerItems field only existed for
    // the now-removed new pipeline. Checking it here caused every AI answer
    // containing [Source:] citations to be misclassified as RAW.
    return false;
  }

  bookIds: number[] = [];
  scopeBooks: { id: number; title: string }[] = [];

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
    this.aiSearchDialogService.cachedSingleBookId = this.bookIds.length === 1 ? this.bookIds[0] : null;
    this.aiSearchDialogService.cachedScopeBookTitle = this.bookIds.length === 1 ? this.scopeBooks[0]?.title : null;
    this.aiSearchDialogService.cachedBookIds = this.bookIds;
    this.aiSearchDialogService.cachedScopeBooks = this.scopeBooks;
    this.aiSearchDialogService.cachedVisible = this.visible;
    this.aiSearchDialogService.cachedLocalOnly = this.localOnly;
    this.aiSearchDialogService.saveToStorage();
  }

  open(bookIdsOrId: number[] | number | null = null): void {
    if (Array.isArray(bookIdsOrId)) {
      this.bookIds = bookIdsOrId;
    } else if (bookIdsOrId !== null) {
      this.bookIds = [bookIdsOrId];
    } else {
      this.bookIds = [];
    }

    this.updateScopeBooks();
    this.visible = true;
    this.aiSearchDialogService.dialogVisible$.next(true);
    if (!this.mobileBackHandle) {
      this.mobileBackHandle = this.mobileBackNavigation.register(() => {
        this.visible = false;
        this.aiSearchDialogService.dialogVisible$.next(false);
        this.mobileBackHandle = null;
        this.saveStateToCache();
      });
    }
    this.checkLlmWarmedStatus();
    this.saveStateToCache();
  }

  close(): void {
    this.searchInput?.nativeElement?.blur();
    this.visible = false;
    this.aiSearchDialogService.dialogVisible$.next(false);
    this.mobileBackHandle?.release();
    this.mobileBackHandle = null;
    this.closeResultDetail();
    this.saveStateToCache();
  }

  clearScope(): void {
    this.bookIds = [];
    this.scopeBooks = [];
    this.saveStateToCache();
  }

  removeBookFromScope(bookId: number): void {
    this.bookIds = this.bookIds.filter(id => id !== bookId);
    this.updateScopeBooks();
    this.saveStateToCache();
  }

  updateScopeBooks(): void {
    this.scopeBooks = this.bookIds.map(id => {
      const book = this.bookService.getBookByIdFromState(id);
      return {
        id: id,
        title: book?.metadata?.title ?? book?.fileName ?? `Book #${id}`
      };
    });
  }

  toggleLocalOnly(): void {
    this.localOnly = !this.localOnly;
    this.saveStateToCache();
  }


  saveToNotepad(result: AiSearchChunkResult): void {
    const user = this.userService.getCurrentUser();
    if (!user) return;

    let selectedText = result.chunkText || '';
    if (result.contextBefore || result.contextAfter) {
      selectedText = '';
      if (result.contextBefore) {
        selectedText += `[Context] ... ${result.contextBefore.trim()}\n\n`;
      }
      selectedText += `${(result.chunkText || '').trim()}`;
      if (result.contextAfter) {
        selectedText += `\n\n[Context] ${result.contextAfter.trim()} ...`;
      }
    }

    const similarityPercent = Math.round(result.similarity * 100);
    const queryStr = this.searchQuery.trim() || 'AI Semantic Search';
    const pageLink = result.pageNumber ? `[Source: ${result.bookTitle}, Page ${result.pageNumber}]` : `[Source: ${result.bookTitle}]`;
    const noteContent = `🔍 AI Search Query: "${queryStr}"\n📊 Similarity Score: ${similarityPercent}%\n📖 Citation: ${pageLink} (Chunk #${result.chunkId})`;
    const dummyCfi = result.pageNumber ? `page=${result.pageNumber}:${uuidv4()}` : `ai-search-result:${uuidv4()}`;

    const request: CreateBookNoteV2Request = {
      bookId: result.bookId,
      cfi: dummyCfi,
      selectedText: selectedText,
      noteContent: noteContent,
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
        this.toastError(this.t.translate('Save Failed'), this.t.translate('Failed to save to notepad.'), 3000);
      }
    });
  }

  saveAnswerToNotepad(msg?: ChatMessage): void {
    let answerContent = msg ? msg.answer : this.answer;
    const queryContent = msg ? msg.query : this.searchQuery;
    const resultsData = msg ? msg.results : this.results;
    
    if (!answerContent) {
      if (resultsData && resultsData.length > 0) {
        answerContent = resultsData.map(r => `Source: ${r.bookTitle}\n${r.chunkText}`).join('\n\n---\n\n');
      } else {
        return;
      }
    }
    const user = this.userService.getCurrentUser();
    if (!user) return;

    const bookId = (this.bookIds && this.bookIds.length === 1 ? this.bookIds[0] : null) || (resultsData && resultsData.length > 0 ? resultsData[0].bookId : 0);
    if (!bookId) return;

    let selectedText = answerContent;
    if (resultsData && resultsData.length > 0) {
      const citations = resultsData.map((r, idx) => {
        const similarityPercent = Math.round(r.similarity * 100);
        const pagePart = r.pageNumber ? `, Page ${r.pageNumber}` : '';
        return `[Source ${idx + 1}] [Source: ${r.bookTitle}${pagePart}] - Chapter: ${r.chapterTitle || 'N/A'} (Similarity: ${similarityPercent}%)`;
      }).join('\n');
      selectedText += `\n\n---\n📚 Sources Referenced:\n${citations}`;
    }

    const request: CreateBookNoteV2Request = {
      bookId: bookId,
      cfi: `ai-search-answer:${uuidv4()}`,
      selectedText: selectedText,
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
        this.toastError(this.t.translate('Save Failed'), this.t.translate('Failed to save answer to notepad.'), 3000);
      }
    });
  }

  onSearch(): void {
    const query = this.searchQuery.trim();
    if (query.length < 2) {
      return;
    }

    // Cancel any in-flight search before starting a new one. Without this the
    // previous HttpClient XHR keeps the browser connection open (and the Java
    // proxy thread busy) until its read timeout fires, which is why a second
    // query appeared to "hang" for minutes while the first one was still pending.
    this.cancelSearch();

    this.isLoading = true;
    this.hasSearched = true;
    this.aiSearchDialogService.searchActive$.next(true);
    this.aiSearchDialogService.searchError$.next(false);

    // Create a new message block for the UI
    const currentMessage: ChatMessage = {
      query: query,
      answer: null,
      answerItems: null,
      results: [],
      isLoading: true,
      localOnly: this.localOnly,
    };
    this.chatHistory.push(currentMessage);
    
    // Limit chat history to max 3 items
    if (this.chatHistory.length > 3) {
      this.chatHistory = this.chatHistory.slice(this.chatHistory.length - 3);
    }
    
    // Clear the input box immediately to feel responsive
    this.searchQuery = '';
    this.saveStateToCache();

    // Scroll to bottom of results area to show loading indicator
    setTimeout(() => {
      const el = document.querySelector('.ai-search-body');
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);

    const user = this.userService.getCurrentUser();
    if (!user) {
      this.isLoading = false;
      currentMessage.isLoading = false;
      return;
    }

    const bookIds = this.bookIds || [];

    // Extract the last 3 turns of history for context to avoid overloading the context window
    const historyPayload = this.chatHistory
      .slice(0, -1) // Exclude current ongoing query
      .slice(-3) // Take max 3 previous turns
      .filter(m => m.answer != null)
      .flatMap(m => [
        { role: 'user', content: m.query },
        { role: 'assistant', content: m.answer! }
      ]);

    this.searchSub = this.appSettingsService.searchWithAi(query, bookIds, historyPayload, this.localOnly).subscribe({
      next: (result) => {
        this.isLoading = false;
        currentMessage.isLoading = false;
        currentMessage.results = result.results || [];
        currentMessage.contextResults = result.contextResults || result.results || [];
        currentMessage.answer = result.answer || null;
        currentMessage.answerItems = result.answerItems || null;
        this.preRenderMessageHtml(currentMessage);
        this.aiSearchDialogService.searchActive$.next(false);

        // Emit search error if the backend returned an error or no results
        const backendError = result.error || null;
        this.lastError = backendError;
        const hasResults = result.results && result.results.length > 0;
        this.aiSearchDialogService.searchError$.next(!!(backendError || !hasResults));

        // Update top-level variables for backward compatibility if needed in UI
        this.results = currentMessage.results;
        this.answer = currentMessage.answer;
        
        this.saveStateToCache();
        this.checkLlmWarmedStatus();
        // Scroll to the new result at the bottom of the chat
        setTimeout(() => {
          const el = document.querySelector('.ai-search-body');
          if (el) el.scrollTop = el.scrollHeight;
        }, 100);
      },
      error: (err) => {
        this.isLoading = false;
        currentMessage.isLoading = false;
        currentMessage.results = [];
        this.lastError = err?.error?.message || err?.message || 'Could not reach the AI Search service. Is the container running?';
        this.aiSearchDialogService.searchActive$.next(false);
        this.aiSearchDialogService.searchError$.next(true);
        this.saveStateToCache();
        this.checkLlmWarmedStatus();
      },
    });
  }

  private bookService = inject(BookService);

  /**
   * Derives a content result title from the chunk text.
   * Looks for the first line that resembles a heading (short, standalone line).
   * Falls back to chapterTitle, then null.
   */
  getContentTitle(result: AiSearchChunkResult): string | null {
    // Only use the chapterTitle from the backend — this is populated from
    // HTML headings (h1-h6) or the EPUB table of contents during embedding.
    // Never fall back to chunk text, as that produces misleading "titles"
    // that are just the first words of a sentence.
    if (result.chapterTitle) {
      return result.chapterTitle;
    }
    return null;
  }

  /**
   * Returns a truncated snippet of the chunk text for display in result cards.
   * When a content title exists, show less text since the title provides context.
   */
  getResultSnippet(result: AiSearchChunkResult): string {
    const title = this.getContentTitle(result);
    const text = result.chunkText || '';
    const maxLen = title ? 150 : 300;
    if (text.length <= maxLen) {
      return text;
    }
    return text.substring(0, maxLen).trimEnd() + '...';
  }

  onResultClick(result: AiSearchChunkResult): void {
    this.selectedResult = result;
    if (!this.detailBackHandle) {
      this.detailBackHandle = this.mobileBackNavigation.register(() => {
        this.selectedResult = null;
        this.detailBackHandle = null;
      });
    }
  }

  closeResultDetail(): void {
    this.selectedResult = null;
    this.detailBackHandle?.release();
    this.detailBackHandle = null;
  }

  /** Deduped source cards for an answer — one card per book+page, preserving rank order. */
  getSourceCards(msg: ChatMessage): AiSearchChunkResult[] {
    const sources = msg.contextResults?.length ? msg.contextResults : (msg.results || []);
    const seen = new Set<string>();
    const cards: AiSearchChunkResult[] = [];
    for (const r of sources) {
      const key = `${r.bookId}:${r.pageNumber ?? 'x'}:${r.chunkId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cards.push(r);
      if (cards.length >= 8) break;
    }
    return cards;
  }

  toggleChunkExpanded(chunkId: number): void {
    if (this.expandedChunks.has(chunkId)) {
      this.expandedChunks.delete(chunkId);
    } else {
      this.expandedChunks.add(chunkId);
    }
  }

  isChunkExpanded(chunkId: number): boolean {
    return this.expandedChunks.has(chunkId);
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
    this.close();
    if (result.pageNumber) {
      this.bookService.readBook(result.bookId, undefined, undefined, result.pageNumber);
    } else {
      this.bookService.readBook(result.bookId);
    }
  }

  readBookAtPageForItem(item: AiSearchAnswerItem): void {
    const result = this.results.find(r => r.bookTitle === item.bookTitle && (item.pageNumber ? r.pageNumber === item.pageNumber : true));
    if (result) {
      this.readBookAtPage(result);
    } else if (item.chunkIds && item.chunkIds.length > 0) {
      const byChunk = this.results.find(r => item.chunkIds!.includes(r.chunkId));
      if (byChunk) {
        this.readBookAtPage(byChunk);
      }
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

  private getAiSearchInfoMarkdown(): string {
    return `### 🔍 Successful Searching: Scopes & Strategy

To get the most out of AI Search, choose the right scope for your query:

*   **Single Book Search:** Best for deep fact-finding or summarizing a specific book. Fast and highly focused.
*   **Selected Books Search:** Search across a custom list of selected books. Great for comparing perspectives across specific authors or themes without unrelated clutter.
*   **Library-Wide Search:** Explores your entire library. Useful for general discoveries.
*   *Potential Pitfall:* Library-wide searches can pull in irrelevant snippets if you have a large or diverse library, which can dilute the LLM's final synthesized answer. For complex or specific queries, targeting a handful of selected books is always more reliable.

---

### 💻 Optimizing for CPU & Small Models

If Fable's backend is running on a CPU or utilizing smaller local models (e.g., Llama 3 or Qwen on CPU):
*   **Keep Context Small:** Limit your search scope to a few selected books rather than the entire library. Less context means fewer tokens for the CPU to process, resulting in much faster responses.
*   **First-Load Warmup:** The very first query after startup can take 2-3 minutes while the model is loaded into memory. Subsequent queries will be significantly faster.
*   **Use Raw Mode:** If response generation feels too slow, toggle **Raw** mode (the list icon next to the input). Raw mode bypasses the LLM and displays matching passages instantly.

---

### ✍️ Phrasing Tips for Reliable Results

*   **Describe Concepts, Not Just Keywords:** Semantic search matches the meaning of your text, not exact spelling. Instead of searching \`"rum"\`, search for \`"rum-based cocktails"\` or \`"recipes containing rum"\`.
*   **Ask Direct Questions:** Framing your query as a question (e.g., *"How do different authors approach mindfulness meditation?"*) gives the LLM clear context for synthesizing its response.
*   **Exact Phrase Matching:** If you need to search for an exact phrase, wrap it in double quotes (e.g., \`"quantum mechanics"\`), though conceptual phrases generally yield better semantic results.

---

### 🚫 What to Avoid in Your Query

*   **Avoid Generic Prompts:** Queries like *"tell me about my library"* or *"what do my books say"* are too vague. Semantic search needs concrete topics to locate relevant excerpts.
*   **Avoid Out-of-Context Questions:** The LLM cannot access external information. Asking questions unrelated to the content of your books will trigger anti-hallucination safeguards and return no results.
*   **Avoid Multi-Part Complexity:** Break complex multi-stage questions into individual, focused queries.

---

### 🛠️ Troubleshooting & Adjustments (Without Re-embedding)

If your search results are not what you expected, adjust these settings under **Settings → AI Search**. Changing them takes effect immediately and does **not** require re-embedding your library:

*   **Answers contain fabrication/hallucinations:** Reduce **Temperature** (e.g., to \`0.0\` or \`0.1\`) to make the LLM deterministic and strict, or increase **Similarity Threshold** (e.g., to \`0.5\` or higher) so only strongly matching passages are sent to the LLM.
*   **LLM misses relevant information:** Increase **Top K** (to supply more context chunks to the LLM) or lower the **Similarity Threshold** (to allow slightly weaker matches to be considered).
*   **Answers are too verbose or unfocused:** Reduce **Top K** (e.g., to \`3\` or \`4\`) to feed the LLM a tighter context window.`;
  }

  /**
   * Cancel the currently in-flight search. Unsubscribing from the Angular
   * HttpClient observable aborts the underlying XHR, which closes the browser
   * connection and frees the Java proxy thread immediately instead of waiting
   * for the read timeout. The loading state is reset so the UI is responsive
   * again. The in-progress chat message is removed so the user does not see a
   * stale "Searching..." bubble that can never resolve.
   */
  cancelSearch(): void {
    if (this.searchSub && !this.searchSub.closed) {
      this.searchSub.unsubscribe();
    }
    this.searchSub = undefined;
    if (this.isLoading) {
      this.isLoading = false;
      this.aiSearchDialogService.searchActive$.next(false);
      // Remove the trailing "loading" message that was pushed for this search
      // so the chat history does not show a perpetual spinner.
      if (this.chatHistory.length > 0 && this.chatHistory[this.chatHistory.length - 1].isLoading) {
        this.chatHistory.pop();
      }
      this.saveStateToCache();
    }
  }

  ngOnDestroy(): void {
    this.mobileBackHandle?.release(false);
    this.mobileBackHandle = null;
    this.detailBackHandle?.release(false);
    this.detailBackHandle = null;
    this.saveStateToCache();
    this.searchSub?.unsubscribe();
    this.openSub?.unsubscribe();
  }
}
