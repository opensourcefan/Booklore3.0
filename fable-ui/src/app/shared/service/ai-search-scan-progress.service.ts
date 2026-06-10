import {inject, Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {filter} from 'rxjs/operators';
import {MessageService} from 'primeng/api';

export interface AiSearchProgressPayload {
  mode: 'SINGLE' | 'BATCH';
  event: 'STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'STOPPED';
  message: string;
  error?: string;
  current?: number;
  total?: number;
  importedBooks?: string[];
  failedBooks?: string[];
}

@Injectable({providedIn: 'root'})
export class AiSearchScanProgressService {
  private readonly messageService = inject(MessageService);
  private readonly progressSubject = new BehaviorSubject<AiSearchProgressPayload | null>(null);
  private readonly embeddingBookIdsSubject = new BehaviorSubject<Set<number>>(new Set());
  private clearTimer: ReturnType<typeof setTimeout> | undefined;

  readonly progress$ = this.progressSubject.asObservable();
  readonly embeddingBookIds$ = this.embeddingBookIdsSubject.asObservable();

  handleIncomingProgress(progress: AiSearchProgressPayload): void {
    if (this.clearTimer) {
      clearTimeout(this.clearTimer);
      this.clearTimer = undefined;
    }

    this.progressSubject.next(progress);

    if (progress.mode === 'BATCH' && (progress.event === 'COMPLETED' || progress.event === 'FAILED')) {
      this.clearTimer = setTimeout(() => {
        if (this.progressSubject.value === progress) {
          this.progressSubject.next(null);
        }
      }, 5000);
    }

    this.updateReaderToast(progress);
  }

  batchProgress$(): Observable<AiSearchProgressPayload> {
    return this.progress$.pipe(
      filter((progress): progress is AiSearchProgressPayload => !!progress && progress.mode === 'BATCH')
    );
  }

  singleProgress$(): Observable<AiSearchProgressPayload> {
    return this.progress$.pipe(
      filter((progress): progress is AiSearchProgressPayload => !!progress && progress.mode === 'SINGLE')
    );
  }

  buildStatusText(progress: AiSearchProgressPayload): string {
    if (progress.event === 'FAILED') {
      return progress.error || progress.message || 'AI search embedding failed.';
    }

    if (progress.mode === 'BATCH') {
      const current = progress.current ?? 0;
      const total = progress.total ?? 0;
      return `${current}/${total} books embedded. ${progress.message}`;
    }

    return progress.message;
  }

  buildCompletionSummary(progress: AiSearchProgressPayload): string {
    const imported = progress.importedBooks;
    const failed = progress.failedBooks;
    const parts: string[] = [];

    if (imported && imported.length > 0) {
      const count = imported.length;
      const titles = imported.slice(0, 3).join(', ');
      const suffix = imported.length > 3 ? ` and ${imported.length - 3} more` : '';
      parts.push(`Imported (${count}): ${titles}${suffix}`);
    }

    if (failed && failed.length > 0) {
      const count = failed.length;
      const titles = failed.slice(0, 3).join(', ');
      const suffix = failed.length > 3 ? ` and ${failed.length - 3} more` : '';
      parts.push(`Failed (${count}): ${titles}${suffix}`);
    }

    return parts.length > 0 ? parts.join('. ') : '';
  }

  updateReaderToast(progress: AiSearchProgressPayload): void {
    const detail = this.buildStatusText(progress);
    const completionSummary = this.buildCompletionSummary(progress);

    if (progress.event === 'FAILED') {
      this.messageService.clear('ai-search-scan');
      this.messageService.add({
        key: 'ai-search-scan',
        severity: 'warn',
        summary: 'AI Search Embeddings',
        detail: completionSummary || detail,
        life: 8000
      });
      return;
    }

    if (progress.event === 'COMPLETED') {
      this.messageService.clear('ai-search-scan');
      this.messageService.add({
        key: 'ai-search-scan',
        severity: 'success',
        summary: 'AI Search Embeddings',
        detail: completionSummary || detail,
        life: 8000
      });
      return;
    }

    this.messageService.clear('ai-search-scan');
    this.messageService.add({
      key: 'ai-search-scan',
      severity: 'info',
      summary: 'AI Search is embedding books...',
      detail,
      sticky: true
    });
  }
}
