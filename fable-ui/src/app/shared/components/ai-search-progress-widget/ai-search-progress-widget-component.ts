import {Component, inject, OnDestroy, OnInit} from '@angular/core';
import {Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {ProgressBarModule} from 'primeng/progressbar';
import {ButtonModule} from 'primeng/button';
import {MessageService} from 'primeng/api';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {Tag} from 'primeng/tag';

import {AiSearchProgressPayload, AiSearchScanProgressService} from '../../service/ai-search-scan-progress.service';
import {AppSettingsService} from '../../service/app-settings.service';

@Component({
  selector: 'app-ai-search-progress-widget',
  templateUrl: './ai-search-progress-widget-component.html',
  styleUrls: ['./ai-search-progress-widget-component.scss'],
  standalone: true,
  imports: [ProgressBarModule, ButtonModule, Tag, TranslocoDirective]
})
export class AiSearchProgressWidgetComponent implements OnInit, OnDestroy {
  aiSearchBatchProgress: AiSearchProgressPayload | null = null;
  isStopping = false;

  private destroy$ = new Subject<void>();
  private aiSearchScanProgressService = inject(AiSearchScanProgressService);
  private appSettingsService = inject(AppSettingsService);
  private messageService = inject(MessageService);
  private readonly t = inject(TranslocoService);

  ngOnInit(): void {
    this.aiSearchScanProgressService.progress$
      .pipe(takeUntil(this.destroy$))
      .subscribe(progress => {
        if (progress && progress.mode === 'BATCH') {
          this.aiSearchBatchProgress = progress;
        } else if (!progress) {
          this.aiSearchBatchProgress = null;
        }
      });

    this.aiSearchScanProgressService.isStopping$
      .pipe(takeUntil(this.destroy$))
      .subscribe(stopping => {
        this.isStopping = stopping;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  getProgressPercent(): number {
    if (!this.aiSearchBatchProgress) return 0;
    const total = this.aiSearchBatchProgress.total ?? 0;
    const current = this.aiSearchBatchProgress.current ?? 0;
    if (total <= 0) return 0;
    if (this.aiSearchBatchProgress.event === 'COMPLETED') return 100;
    return Math.round((current / total) * 100);
  }

  hasProgress(): boolean {
    if (!this.aiSearchBatchProgress) return false;
    const total = this.aiSearchBatchProgress.total ?? 0;
    return total > 0;
  }

  getProgressInfo(): string {
    if (!this.aiSearchBatchProgress) return '';
    const current = this.aiSearchBatchProgress.current ?? 0;
    const total = this.aiSearchBatchProgress.total ?? 0;
    return `Book <strong>${current}</strong> of ${total}`;
  }

  isActive(): boolean {
    if (!this.aiSearchBatchProgress) return false;
    const event = this.aiSearchBatchProgress.event;
    return event !== 'COMPLETED' && event !== 'FAILED' && event !== 'STOPPED';
  }

  private getTranslation(key: string, fallback: string): string {
    const val = this.t.translate(key);
    return val === key ? fallback : val;
  }

  stopScan(): void {
    this.aiSearchScanProgressService.setStopping(true);
    this.appSettingsService.stopAiSearchScan().subscribe({
      next: () => {
        this.messageService.add({
          severity: 'info',
          summary: this.getTranslation('shared.aiSearchProgress.cancellationScheduledSummary', 'Cancellation Requested'),
          detail: this.getTranslation('shared.aiSearchProgress.cancellationScheduledDetail', 'Fable will stop this task after completing the current book.')
        });
      },
      error: (error) => {
        console.error('Failed to cancel AI Search scan:', error);
        this.aiSearchScanProgressService.setStopping(false);
        this.messageService.add({
          severity: 'error',
          summary: this.getTranslation('shared.aiSearchProgress.cancelFailedSummary', 'Cancel Failed'),
          detail: this.getTranslation('shared.aiSearchProgress.cancelFailedDetail', 'Failed to cancel the scan. Please try again.')
        });
      }
    });
  }

  dismiss(): void {
    this.aiSearchScanProgressService.clearProgress();
  }

  getStatusText(): string {
    if (this.isStopping) {
      return 'Stopping... (Completing current book)';
    }
    return this.aiSearchBatchProgress ? this.aiSearchScanProgressService.buildStatusText(this.aiSearchBatchProgress) : '';
  }

  getStatusLabel(): string {
    if (this.isStopping) {
      return this.getTranslation('shared.aiSearchProgress.statusStopping', 'Stopping');
    }
    if (!this.aiSearchBatchProgress) return '';
    const event = this.aiSearchBatchProgress.event;
    switch (event) {
      case 'STARTED':
      case 'IN_PROGRESS':
        return this.getTranslation('shared.aiSearchProgress.statusInProgress', 'In Progress');
      case 'COMPLETED':
        return this.getTranslation('shared.aiSearchProgress.statusCompleted', 'Completed');
      case 'FAILED':
        return this.getTranslation('shared.aiSearchProgress.statusError', 'Error');
      case 'STOPPED':
        return this.getTranslation('shared.aiSearchProgress.statusStopped', 'Stopped');
      default:
        return event;
    }
  }

  getTagSeverity(): 'info' | 'success' | 'danger' | 'warn' {
    if (this.isStopping) {
      return 'warn';
    }
    if (!this.aiSearchBatchProgress) return 'info';
    const event = this.aiSearchBatchProgress.event;
    switch (event) {
      case 'COMPLETED':
        return 'success';
      case 'FAILED':
        return 'danger';
      case 'STOPPED':
        return 'warn';
      case 'STARTED':
      case 'IN_PROGRESS':
      default:
        return 'info';
    }
  }
}
