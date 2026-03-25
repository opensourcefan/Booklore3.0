import {inject, Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {distinctUntilChanged, filter, map} from 'rxjs/operators';
import {MessageService} from 'primeng/api';

import {AiPanelScanProgressPayload} from '../model/ai-panel-scan-progress.model';

@Injectable({providedIn: 'root'})
export class AiPanelScanProgressService {
  private readonly messageService = inject(MessageService);
  private readonly progressSubject = new BehaviorSubject<AiPanelScanProgressPayload | null>(null);

  readonly progress$ = this.progressSubject.asObservable();

  handleIncomingProgress(progress: AiPanelScanProgressPayload): void {
    this.progressSubject.next(progress);
  }

  bookProgress$(bookId: number): Observable<AiPanelScanProgressPayload> {
    return this.progress$.pipe(
      filter((progress): progress is AiPanelScanProgressPayload => !!progress && progress.mode === 'BOOK' && progress.bookId === bookId)
    );
  }

  batchProgress$(): Observable<AiPanelScanProgressPayload> {
    return this.progress$.pipe(
      filter((progress): progress is AiPanelScanProgressPayload => !!progress && progress.mode === 'BATCH')
    );
  }

  buildStatusText(progress: AiPanelScanProgressPayload): string {
    const processedPages = progress.processedPages ?? 0;
    const totalPages = progress.totalPages ?? 0;
    const panelsFound = progress.panelsFound ?? 0;
    const pagesWithPanels = progress.pagesWithPanels ?? 0;

    if (progress.event === 'FAILED') {
      return progress.error || progress.message || 'AI panel scan failed.';
    }

    if (progress.mode === 'BATCH') {
      const completedBooks = progress.completedBooks ?? 0;
      const totalBooks = progress.totalBooks ?? 0;
      return `${completedBooks}/${totalBooks} books, ${processedPages}/${totalPages || processedPages} pages, ${panelsFound} panels across ${pagesWithPanels} pages.`;
    }

    if (totalPages > 0) {
      return `${processedPages}/${totalPages} pages scanned, ${panelsFound} panels across ${pagesWithPanels} pages.`;
    }

    return `${processedPages} pages scanned, ${panelsFound} panels across ${pagesWithPanels} pages.`;
  }

  updateReaderToast(progress: AiPanelScanProgressPayload): void {
    const detail = this.buildStatusText(progress);

    if (progress.event === 'FAILED') {
      this.messageService.clear('ai-scan');
      this.messageService.add({
        key: 'ai-scan',
        severity: 'warn',
        summary: 'AI Panel Detection',
        detail,
        life: 5000
      });
      return;
    }

    if (progress.event === 'COMPLETED') {
      this.messageService.clear('ai-scan');
      this.messageService.add({
        key: 'ai-scan',
        severity: 'success',
        summary: 'AI Panel Detection',
        detail,
        life: 3500
      });
      return;
    }

    this.messageService.clear('ai-scan');
    this.messageService.add({
      key: 'ai-scan',
      severity: 'info',
      summary: 'AI is scanning panels',
      detail,
      sticky: true
    });
  }
}