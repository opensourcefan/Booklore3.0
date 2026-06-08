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
import {Popover} from 'primeng/popover';
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
    // Pre-render the AI Search info content from markdown
    this.aiSearchInfoHtml = this.markdownToHtml(this.getAiSearchInfoMarkdown());

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

  /** Returns true if the LLM answer text references at least one of the source book titles. */
  answerReferencesSources(msg: ChatMessage): boolean {
    if (!msg.answer || !msg.results || msg.results.length === 0) return false;
    const answerLower = msg.answer.toLowerCase();
    return msg.results.some(r => answerLower.includes(r.bookTitle.toLowerCase()));
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
        
        // Capture backend diagnostic errors (e.g., dimension mismatch)
        this.lastError = result.error || null;

        // Update top-level variables for backward compatibility if needed in UI
        this.results = currentMessage.results;
        this.answer = currentMessage.answer;
        
        this.saveStateToCache();
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
        this.saveStateToCache();
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

  ngOnDestroy(): void {
    this.saveStateToCache();
    this.searchSub?.unsubscribe();
    this.openSub?.unsubscribe();
  }
}
