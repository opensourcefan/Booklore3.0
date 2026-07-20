import {Component, inject, OnDestroy, OnInit} from '@angular/core';
import {Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {KeyValuePipe, NgClass} from '@angular/common';
import {ProgressBarModule} from 'primeng/progressbar';
import {ButtonModule} from 'primeng/button';
import {Divider} from 'primeng/divider';
import {Tooltip} from 'primeng/tooltip';
import {MessageService} from 'primeng/api';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';

import {
  MetadataBatchPhase,
  MetadataBatchProgressNotification,
  MetadataBatchStatus
} from '../../model/metadata-batch-progress.model';
import {MetadataProgressService} from '../../service/metadata-progress.service';
import {MetadataTaskService} from '../../../features/book/service/metadata-task';
import {Tag} from 'primeng/tag';
import {DialogLauncherService} from '../../services/dialog-launcher.service';
import {NotificationEventService} from '../../websocket/notification-event.service';
import {FailureNotificationService} from '../../service/failure-notification.service';

@Component({
  selector: 'app-metadata-progress-widget',
  templateUrl: './metadata-progress-widget-component.html',
  styleUrls: ['./metadata-progress-widget-component.scss'],
  standalone: true,
  imports: [KeyValuePipe, NgClass, ProgressBarModule, ButtonModule, Divider, Tooltip, Tag, TranslocoDirective]
})
export class MetadataProgressWidgetComponent implements OnInit, OnDestroy {
  activeTasks: Record<string, MetadataBatchProgressNotification> = {};

  /** Phase used for title/colors; ISBN_FAILED can lag behind the raw task for a brief flash. */
  displayPhases: Record<string, string | null | undefined> = {};

  private static readonly ISBN_FAILED_FLASH_MS = 2500;

  private destroy$ = new Subject<void>();
  private dialogLauncherService = inject(DialogLauncherService);
  private metadataProgressService = inject(MetadataProgressService);
  private metadataTaskService = inject(MetadataTaskService);
  private messageService = inject(MessageService);
  private failureNotifications = inject(FailureNotificationService);
  private readonly t = inject(TranslocoService);
  private notificationEventService = inject(NotificationEventService);
  private readonly isbnFailedTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly isbnFailedLockedUntil = new Map<string, number>();

  ngOnInit(): void {
    this.metadataProgressService.activeTasks$
      .pipe(takeUntil(this.destroy$))
      .subscribe(tasks => {
        this.activeTasks = tasks;
        this.syncDisplayPhases(tasks);
      });
  }

  getProgressPercent(task: MetadataBatchProgressNotification): number {
    if (task.total <= 0) return 0;
    if (task.status === 'COMPLETED') return 100;
    return Math.round((task.completed / task.total) * 100);
  }

  clearTask(taskId: string): void {
    this.metadataTaskService.deleteTask(taskId).subscribe({
      next: () => {
        this.clearPhaseState(taskId);
        this.metadataProgressService.clearTask(taskId);
        this.notificationEventService.clearNotification();
      },
      error: (error) => {
        console.error('Failed to clear metadata task:', error);
        this.toastError(
          'Close Failed',
          'Unable to close this metadata task notification. Please try again.'
        );
      }
    });
  }

  reviewTask(taskId: string): void {
    this.dialogLauncherService.openMetadataReviewDialog(taskId);
  }

  cancelTask(taskId: string): void {
    this.metadataTaskService.cancelTask(taskId).subscribe({
      next: () => {
        this.metadataProgressService.markCancellationRequested(
          taskId,
          this.t.translate('shared.metadataProgress.taskCancellationRequested')
        );

        this.messageService.add({
          severity: 'info',
          summary: this.t.translate('shared.metadataProgress.cancellationScheduledSummary'),
          detail: this.t.translate('shared.metadataProgress.cancellationScheduledDetail')
        });
      },
      error: (error) => {
        console.error('Failed to cancel task:', error);
        this.toastError(
          this.t.translate('shared.metadataProgress.cancelFailedSummary'),
          this.t.translate('shared.metadataProgress.cancelFailedDetail')
        );
      }
    });
  }

  resumeTask(taskId: string, pendingCount: number | null | undefined): void {
    this.metadataTaskService.resumeTask(taskId).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'info',
          summary: this.t.translate('shared.metadataProgress.resumeStartedSummary'),
          detail: this.t.translate('shared.metadataProgress.resumeStartedDetail', {count: pendingCount ?? 0})
        });
      },
      error: (error) => {
        console.error('Failed to resume task:', error);
        this.toastError(
          this.t.translate('shared.metadataProgress.resumeFailedSummary'),
          this.t.translate('shared.metadataProgress.resumeFailedDetail')
        );
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    for (const timer of this.isbnFailedTimers.values()) {
      clearTimeout(timer);
    }
    this.isbnFailedTimers.clear();
    this.isbnFailedLockedUntil.clear();
  }

  getTagSeverity(status: 'IN_PROGRESS' | 'COMPLETED' | 'ERROR' | 'CANCELLED'): 'info' | 'success' | 'danger' | 'warn' {
    switch (status) {
      case 'COMPLETED':
        return 'success';
      case 'ERROR':
        return 'danger';
      case 'CANCELLED':
        return 'warn';
      case 'IN_PROGRESS':
      default:
        return 'info';
    }
  }

  private readonly statusLabelKeys: Record<MetadataBatchStatus, string> = {
    [MetadataBatchStatus.IN_PROGRESS]: 'shared.metadataProgress.statusInProgress',
    [MetadataBatchStatus.COMPLETED]: 'shared.metadataProgress.statusCompleted',
    [MetadataBatchStatus.ERROR]: 'shared.metadataProgress.statusError',
    [MetadataBatchStatus.CANCELLED]: 'shared.metadataProgress.statusCancelled',
  };

  getStatusLabel(status: MetadataBatchStatus): string {
    const key = this.statusLabelKeys[status];
    return key ? this.t.translate(key) : status;
  }

  getTaskTitle(taskId: string, task: MetadataBatchProgressNotification): string {
    const phase = this.getDisplayPhase(taskId, task);
    switch (phase) {
      case MetadataBatchPhase.ISBN_DISCOVERY:
        return this.t.translate('shared.metadataProgress.taskTitleIsbnDiscovery');
      case MetadataBatchPhase.METADATA_FETCH:
        return this.t.translate('shared.metadataProgress.taskTitleMetadataFetch');
      case MetadataBatchPhase.ISBN_FAILED:
        return this.t.translate('shared.metadataProgress.taskTitleIsbnFailed');
      default:
        return this.t.translate('shared.metadataProgress.taskTitle');
    }
  }

  getPhaseToneClass(taskId: string, task: MetadataBatchProgressNotification): Record<string, boolean> {
    const phase = this.getDisplayPhase(taskId, task);
    return {
      'task-card--phase-isbn': phase === MetadataBatchPhase.ISBN_DISCOVERY,
      'task-card--phase-metadata': phase === MetadataBatchPhase.METADATA_FETCH,
      'task-card--phase-isbn-failed': phase === MetadataBatchPhase.ISBN_FAILED,
    };
  }

  /**
   * Package-visible for unit tests: resolves the phase used for styling/title,
   * honoring the ISBN_FAILED flash lock.
   */
  getDisplayPhase(taskId: string, task: MetadataBatchProgressNotification): string | null | undefined {
    const lockedUntil = this.isbnFailedLockedUntil.get(taskId);
    if (lockedUntil != null && Date.now() < lockedUntil) {
      return MetadataBatchPhase.ISBN_FAILED;
    }
    return this.displayPhases[taskId] ?? task.phase ?? null;
  }

  isCancellationRequested(task: MetadataBatchProgressNotification): boolean {
    return task.status === MetadataBatchStatus.IN_PROGRESS && !!task.cancellationRequested;
  }

  canResume(task: MetadataBatchProgressNotification): boolean {
    return (task.status === MetadataBatchStatus.ERROR || task.status === MetadataBatchStatus.CANCELLED) && !!task.resumable;
  }

  hasReviewItems(task: MetadataBatchProgressNotification): boolean {
    if (!task.review) {
      return false;
    }

    if (task.status !== MetadataBatchStatus.COMPLETED) {
      return true;
    }

    return task.completed < task.total;
  }

  protected readonly Object = Object;

  private syncDisplayPhases(tasks: Record<string, MetadataBatchProgressNotification>): void {
    const next: Record<string, string | null | undefined> = {};
    for (const [taskId, task] of Object.entries(tasks)) {
      const incomingPhase = task.phase ?? null;
      const lockedUntil = this.isbnFailedLockedUntil.get(taskId);

      if (incomingPhase === MetadataBatchPhase.ISBN_FAILED) {
        this.lockIsbnFailedFlash(taskId);
        next[taskId] = MetadataBatchPhase.ISBN_FAILED;
        continue;
      }

      if (lockedUntil != null && Date.now() < lockedUntil) {
        next[taskId] = MetadataBatchPhase.ISBN_FAILED;
        continue;
      }

      this.clearIsbnFailedLock(taskId);
      next[taskId] = incomingPhase;
    }

    for (const taskId of [...this.isbnFailedTimers.keys()]) {
      if (!(taskId in tasks)) {
        this.clearPhaseState(taskId);
      }
    }

    this.displayPhases = next;
  }

  private lockIsbnFailedFlash(taskId: string): void {
    const until = Date.now() + MetadataProgressWidgetComponent.ISBN_FAILED_FLASH_MS;
    this.isbnFailedLockedUntil.set(taskId, until);
    const existing = this.isbnFailedTimers.get(taskId);
    if (existing) {
      clearTimeout(existing);
    }
    this.isbnFailedTimers.set(taskId, setTimeout(() => {
      this.isbnFailedTimers.delete(taskId);
      this.isbnFailedLockedUntil.delete(taskId);
      const task = this.activeTasks[taskId];
      if (!task) {
        delete this.displayPhases[taskId];
        return;
      }
      this.displayPhases = {
        ...this.displayPhases,
        [taskId]: task.phase ?? null,
      };
    }, MetadataProgressWidgetComponent.ISBN_FAILED_FLASH_MS));
  }

  private clearIsbnFailedLock(taskId: string): void {
    const timer = this.isbnFailedTimers.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.isbnFailedTimers.delete(taskId);
    }
    this.isbnFailedLockedUntil.delete(taskId);
  }

  private clearPhaseState(taskId: string): void {
    this.clearIsbnFailedLock(taskId);
    delete this.displayPhases[taskId];
  }

  private toastError(summary: string, detail: string, life?: number): void {
    this.failureNotifications.reportSafe(summary, detail);
    this.messageService.add({severity: 'error', summary, detail, ...(life != null ? {life} : {})});
  }
}
