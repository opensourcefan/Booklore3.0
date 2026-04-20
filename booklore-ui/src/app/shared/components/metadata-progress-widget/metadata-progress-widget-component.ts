import {Component, inject, OnDestroy, OnInit} from '@angular/core';
import {Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {KeyValuePipe} from '@angular/common';
import {ProgressBarModule} from 'primeng/progressbar';
import {ButtonModule} from 'primeng/button';
import {Divider} from 'primeng/divider';
import {Tooltip} from 'primeng/tooltip';
import {MessageService} from 'primeng/api';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';

import {MetadataBatchProgressNotification, MetadataBatchStatus} from '../../model/metadata-batch-progress.model';
import {MetadataProgressService} from '../../service/metadata-progress.service';
import {MetadataTaskService} from '../../../features/book/service/metadata-task';
import {Tag} from 'primeng/tag';
import {DialogLauncherService} from '../../services/dialog-launcher.service';
import {NotificationEventService} from '../../websocket/notification-event.service';

@Component({
  selector: 'app-metadata-progress-widget',
  templateUrl: './metadata-progress-widget-component.html',
  styleUrls: ['./metadata-progress-widget-component.scss'],
  standalone: true,
  imports: [KeyValuePipe, ProgressBarModule, ButtonModule, Divider, Tooltip, Tag, TranslocoDirective]
})
export class MetadataProgressWidgetComponent implements OnInit, OnDestroy {
  activeTasks: Record<string, MetadataBatchProgressNotification> = {};

  private destroy$ = new Subject<void>();
  private dialogLauncherService = inject(DialogLauncherService);
  private metadataProgressService = inject(MetadataProgressService);
  private metadataTaskService = inject(MetadataTaskService);
  private messageService = inject(MessageService);
  private readonly t = inject(TranslocoService);
  private notificationEventService = inject(NotificationEventService);

  ngOnInit(): void {
    this.metadataProgressService.activeTasks$
      .pipe(takeUntil(this.destroy$))
      .subscribe(tasks => {
        this.activeTasks = tasks;
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
        this.metadataProgressService.clearTask(taskId);
        this.notificationEventService.clearNotification();
      },
      error: (error) => {
        console.error('Failed to clear metadata task:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Discard Failed',
          detail: 'Unable to discard this metadata task. Please try again.'
        });
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
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('shared.metadataProgress.cancelFailedSummary'),
          detail: this.t.translate('shared.metadataProgress.cancelFailedDetail')
        });
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
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('shared.metadataProgress.resumeFailedSummary'),
          detail: this.t.translate('shared.metadataProgress.resumeFailedDetail')
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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

  isCancellationRequested(task: MetadataBatchProgressNotification): boolean {
    return task.status === MetadataBatchStatus.IN_PROGRESS && !!task.cancellationRequested;
  }

  canResume(task: MetadataBatchProgressNotification): boolean {
    return (task.status === MetadataBatchStatus.ERROR || task.status === MetadataBatchStatus.CANCELLED) && !!task.resumable;
  }

  protected readonly Object = Object;
}
