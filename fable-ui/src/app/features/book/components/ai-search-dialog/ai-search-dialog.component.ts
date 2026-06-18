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
import {AiSearchChunkResult, AiSearchAnswerItem} from '../../../../shared/model/app-settings.model';
import {BehaviorSubject, Subscription, Subject} from 'rxjs';
import {TooltipModule} from 'primeng/tooltip';
import {Popover} from 'primeng/popover';
import {MessageService} from 'primeng/api';
import {BookNoteService, CreateBookNoteV2Request} from '../../../../shared/service/book-note.service';
import {BookService} from '../../service/book.service';
import {SidebarBadgeRefreshService} from '../../service/sidebar-badge-refresh.service';
import {CoverGeneratorComponent} from '../../../../shared/components/cover-generator/cover-generator.component';
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';
import {MobileUxService} from '../../../../core/services/mobile-ux.service';

export interface ChatMessage {
  query: string;
  answer: string | null;
  answerItems: AiSearchAnswerItem[] | null;
  results: AiSearchChunkResult[];
  isLoading: boolean;
  localOnly: boolean;
}

@Injectable({providedIn: 'root'})
export class AiSearchDialogService {
  private openCommand = new Subject<number | null>();
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
  cachedVisible = false;
  cachedLocalOnly = false;

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
        bt: this.cachedScopeBookTitle,
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
        this.cachedResults = data.r || [];
        this.cachedHasSearched = !!data.h;
        this.cachedAnswer = data.a || null;
        this.cachedChatHistory = data.ch || [];
        this.cachedSingleBookId = data.bId || null;
        this.cachedScopeBookTitle = data.bt || null;
        this.cachedVisible = !!data.v;
        this.cachedLocalOnly = !!data.lo;
      }
    } catch (e) {
      console.error('Failed to load AI search state', e);
    }
  }

  open(bookId: number | null = null) {
    this.searchError$.next(false);
    this.dialogVisible$.next(true);
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
  aiSearchInfoHtml = '';
  lastError: string | null = null;
  llmWarmed: boolean | null = null;
  isCheckingLlmWarmed = false;

  private appSettingsService = inject(AppSettingsService);
  private userService = inject(UserService);
  protected urlHelper = inject(UrlHelperService);
  private router = inject(Router);
  private readonly t = inject(TranslocoService);
  private bookNoteService = inject(BookNoteService);
  private messageService = inject(MessageService);
  private sidebarBadgeRefresh = inject(SidebarBadgeRefreshService);

  private aiSearchDialogService = inject(AiSearchDialogService);
  public mobileUx = inject(MobileUxService);

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
    this.singleBookId = this.aiSearchDialogService.cachedSingleBookId;
    this.scopeBookTitle = this.aiSearchDialogService.cachedScopeBookTitle;
    this.visible = this.aiSearchDialogService.cachedVisible;
    this.localOnly = this.aiSearchDialogService.cachedLocalOnly;

    this.openSub = this.aiSearchDialogService.openCommand$.subscribe(bookId => {
      this.open(bookId);
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

  private markdownRenderer = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
  });

  markdownToHtml(markdown: string | null): string {
    if (!markdown) return '';
    // Fix inline lists generated by lazy LLMs by adding newlines before " 1. ", " 2. ", etc.
    const fixedMarkdown = markdown.replace(/(^|\s+)(\d+\.)/g, '\n$2');
    let html = this.markdownRenderer.render(fixedMarkdown);

    // First pass: citations with page numbers — make the page number a clickable
    // link and wrap the entire citation in an italic highlight span.
    // Format: [Source: Book Title, Page N]
    html = html.replace(
      /\[Source\s*(?:\d+)?:\s*([^,]+),\s*Page\s*(\d+)\]/g,
      '<span class="ai-search-citation-highlight"><em>[Source: $1, <span class="ai-search-citation-page-link" data-book-title="$1" data-page="$2" tabindex="0" role="link">Page $2</span>]</em></span>'
    );

    // Second pass: citations without page numbers (e.g. [Source: Book Title]).
    // These get italic styling but no page link.
    html = html.replace(
      /\[Source\s*(?:\d+)?:\s*([^\]]+)\]/g,
      '<span class="ai-search-citation-highlight"><em>[Source: $1]</em></span>'
    );

    return DOMPurify.sanitize(html);
  }

  /** Handles clicks on inline citation page links within the AI answer markdown.
   * Uses event delegation on the markdown content container to find the clicked
   * page link, resolve it to a result, and open the reader at that page. */
  onCitationClick(event: MouseEvent, results?: AiSearchChunkResult[] | null): void {
    const target = event.target as HTMLElement;
    if (!target.classList.contains('ai-search-citation-page-link')) return;

    const bookTitle = target.getAttribute('data-book-title');
    const page = parseInt(target.getAttribute('data-page') || '0', 10);
    if (!bookTitle || !page) return;

    // Find the exact result matching book title and page number.
    const result = results?.find(
      r => r.bookTitle === bookTitle && r.pageNumber === page
    );
    if (result) {
      this.readBookAtPage(result);
      return;
    }

    // Fallback: find by book title alone (page may differ due to post-processing).
    const byTitle = results?.find(r => r.bookTitle === bookTitle);
    if (byTitle) {
      this.readBookAtPage(byTitle);
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

  private singleBookId: number | null = null;
  scopeBookTitle: string | null = null;

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
    this.aiSearchDialogService.cachedScopeBookTitle = this.scopeBookTitle;
    this.aiSearchDialogService.cachedVisible = this.visible;
    this.aiSearchDialogService.cachedLocalOnly = this.localOnly;
    this.aiSearchDialogService.saveToStorage();
  }

  open(bookId: number | null = null): void {
    this.singleBookId = bookId;
    this.scopeBookTitle = bookId ? this.bookService.getBookByIdFromState(bookId)?.metadata?.title ?? null : null;
    this.visible = true;
    this.aiSearchDialogService.dialogVisible$.next(true);
    this.checkLlmWarmedStatus();
    this.saveStateToCache();
  }

  close(): void {
    this.visible = false;
    this.aiSearchDialogService.dialogVisible$.next(false);
    this.saveStateToCache();
  }

  clearScope(): void {
    this.singleBookId = null;
    this.scopeBookTitle = null;
    this.saveStateToCache();
  }

  toggleLocalOnly(): void {
    this.localOnly = !this.localOnly;
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

    this.searchSub = this.appSettingsService.searchWithAi(query, bookIds, user.id, historyPayload, this.localOnly).subscribe({
      next: (result) => {
        this.isLoading = false;
        currentMessage.isLoading = false;
        currentMessage.results = result.results || [];
        currentMessage.answer = result.answer || null;
        currentMessage.answerItems = result.answerItems || null;
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
  }

  closeResultDetail(): void {
    this.selectedResult = null;
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
    return `### The Real Value of Raw Mode

Raw mode is for when you want to discover what your library contains without knowing the exact terminology an author used. You can search for broad concepts ("medieval warfare tactics", "cognitive biases in decision making", "cocktails with rum") and find relevant passages across dozens of books simultaneously — something Ctrl+F can never do because it doesn't understand that "rum-based drinks" and "cocktails with rum" are the same thing.

The AI mode goes one step further by having an LLM read those matched passages and synthesize a coherent answer. Raw mode stops at retrieval — it hands you the raw passages and lets you do the synthesis yourself.


### The Real Value of AI Mode

AI mode combines semantic search with LLM-powered synthesis. Instead of just retrieving matching passages like Raw mode, AI mode reads those passages and generates a coherent, cited answer that connects information across multiple books. This is valuable when you want a direct answer rather than raw excerpts.

For example, searching "What do my books say about the history of coffee?" will return a synthesized summary with citations to specific passages, saving you from manually piecing together information from dozens of individual chunks.

AI mode is particularly useful for:
- **Comparative questions:** "Compare how different authors approach mindfulness meditation"
- **Summarization:** "Summarize the key arguments about climate change across my library"
- **Fact-finding:** "What is the recipe for an Old Fashioned cocktail mentioned in my books?"
- **Cross-reference discovery:** "Which books discuss both quantum mechanics and consciousness?"


### Existing AI Mode Anti-Hallucination Safeguards

Fable already has several layers of defense against fabricated responses. There is no single "disable hallucinations" toggle, but the combination of existing controls gives you strong protection:

1. **System Prompt Grounding (Always Active)**
The LLM is instructed at \`docker/ai-search/app.py:150-158\` to only answer from the provided context and to use a specific sentinel phrase when nothing is relevant:
\`\`\`
system_prompt = (
    "You are an AI search assistant. Read the provided Context carefully.\\n"
    "Your task is to respond to the user's Query based ONLY on the Context.\\n"
    ...
    "If the context contains no relevant information at all, reply EXACTLY with: "
    "'I could not find any relevant information for this search.' and nothing else."
)
\`\`\`

2. **Sentinel Phrase Detection (Always Active)**
Even if the LLM ignores the system prompt and returns the "not found" sentinel when results do exist, the backend at \`docker/ai-search/app.py:467-473\` suppresses that misleading answer so the frontend falls back to showing raw matches instead.

3. **Configurable Temperature (Settings → AI Search)**
You can set Temperature from 0.0–1.0. The default is 0.1 (very deterministic). Setting it to 0.0 maximizes factual adherence — the LLM will pick the most probable token every time, minimizing creative fabrication.

4. **Configurable Similarity Threshold (Settings → AI Search)**
The Similarity Threshold (default 0.3, range 0.1–0.9) controls how strict the semantic match must be. Raising it (e.g., to 0.5–0.7) means only strongly relevant chunks reach the LLM, reducing the chance it fabricates from weak context.

5. **Raw-Only Mode (Per-Query Toggle)**
The Raw / AI toggle button in the search dialog completely bypasses the LLM. When toggled to "Raw," the backend skips answer generation entirely. You get only the raw matching passages — zero hallucination risk.

### Recommended Configuration for Maximum Integrity

| Setting | Value | Effect |
|---|---|---|
| Temperature | 0.0 | Eliminates creative token selection |
| Similarity Threshold | 0.5–0.7 | Only strongly relevant context reaches the LLM |
| Top K | 3–5 | Less context = less room to confabulate |
| Raw-Only toggle | On | Zero LLM involvement, raw passages only |

There is no additional "strict/grounded-only" mode beyond these controls. The system prompt grounding + low temperature + high similarity threshold + the raw-only escape hatch form the complete anti-hallucination strategy.`;
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
    this.saveStateToCache();
    this.searchSub?.unsubscribe();
    this.openSub?.unsubscribe();
  }
}
