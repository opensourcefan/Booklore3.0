import {AsyncPipe} from '@angular/common';
import {Component, inject, OnDestroy} from '@angular/core';
import {ButtonModule} from 'primeng/button';
import {ProgressBarModule} from 'primeng/progressbar';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {BehaviorSubject, combineLatest, map, Subject} from 'rxjs';
import {filter, takeUntil} from 'rxjs/operators';
import {
  TaskProgressPayload,
  TaskService,
  TaskStatus,
  TaskType
} from '../../../features/settings/task-management/task.service';
import {SidecarBackupProgressService} from '../../service/sidecar-backup-progress.service';
import {WriteProgressPayload, WriteProgressService} from '../../service/write-progress.service';

interface SystemJobRow {
  id: string;
  label: string;
  summary: string;
  progress: number | null;
  cancellable: boolean;
  taskId: string | null;
  tone: 'library' | 'metadata' | 'write';
}

const TRACKED_TASK_TYPES = new Set<string>([
  TaskType.FLUSH_METADATA_TO_FILES,
  TaskType.SYNC_LIBRARY_FILES,
  TaskType.DIRECTORY_TAGGING,
  TaskType.REFRESH_LIBRARY_METADATA,
  TaskType.REFRESH_METADATA_MANUAL,
  TaskType.UPDATE_BOOK_RECOMMENDATIONS
]);

@Component({
  selector: 'app-system-job-progress-widget',
  standalone: true,
  imports: [AsyncPipe, ButtonModule, ProgressBarModule, TranslocoDirective],
  templateUrl: './system-job-progress-widget.component.html',
  styleUrl: './system-job-progress-widget.component.scss'
})
export class SystemJobProgressWidgetComponent implements OnDestroy {
  private readonly taskService = inject(TaskService);
  private readonly writeProgressService = inject(WriteProgressService);
  private readonly sidecarBackupProgressService = inject(SidecarBackupProgressService);
  private readonly t = inject(TranslocoService);
  private readonly destroy$ = new Subject<void>();

  private readonly taskJobs$ = new BehaviorSubject<Record<string, SystemJobRow>>({});
  private readonly writeJob$ = new BehaviorSubject<SystemJobRow | null>(null);
  private readonly sidecarJob$ = new BehaviorSubject<SystemJobRow | null>(null);
  private readonly dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly rows$ = combineLatest([this.taskJobs$, this.writeJob$, this.sidecarJob$]).pipe(
    map(([tasks, write, sidecar]) => {
      const rows = Object.values(tasks);
      if (write) rows.push(write);
      if (sidecar) rows.push(sidecar);
      return rows;
    })
  );

  readonly hasJobs$ = this.rows$.pipe(map(rows => rows.length > 0));

  constructor() {
    this.taskService.taskProgress$
      .pipe(
        filter((p): p is TaskProgressPayload => !!p && TRACKED_TASK_TYPES.has(p.taskType)),
        takeUntil(this.destroy$)
      )
      .subscribe(progress => this.upsertTaskProgress(progress));

    this.writeProgressService.progress$
      .pipe(takeUntil(this.destroy$))
      .subscribe(progress => this.upsertWriteProgress(progress));

    this.sidecarBackupProgressService.active$
      .pipe(takeUntil(this.destroy$))
      .subscribe(active => {
        this.sidecarJob$.next(
          active
            ? {
                id: 'sidecar-backup',
                label: this.t.translate('layout.topbar.sidecarBackup'),
                summary: this.t.translate('layout.topbar.sidecarBackupWorking'),
                progress: null,
                cancellable: false,
                taskId: null,
                tone: 'metadata'
              }
            : null
        );
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    for (const timer of this.dismissTimers.values()) {
      clearTimeout(timer);
    }
  }

  cancel(row: SystemJobRow): void {
    if (!row.taskId || !row.cancellable) {
      return;
    }
    this.taskService.cancelTask(row.taskId).subscribe({
      error: () => {
        /* toast/inbox handled by callers elsewhere when wired */
      }
    });
  }

  private upsertTaskProgress(progress: TaskProgressPayload): void {
    const terminal =
      progress.taskStatus === TaskStatus.COMPLETED ||
      progress.taskStatus === TaskStatus.CANCELLED ||
      progress.taskStatus === TaskStatus.FAILED;

    const row: SystemJobRow = {
      id: progress.taskType,
      label: this.labelFor(progress.taskType),
      summary: progress.message || `${progress.progress ?? 0}%`,
      progress: typeof progress.progress === 'number' ? progress.progress : null,
      cancellable: progress.taskStatus === TaskStatus.IN_PROGRESS,
      taskId: progress.taskId,
      tone: this.toneFor(progress.taskType)
    };

    const next = {...this.taskJobs$.value, [progress.taskType]: row};
    this.taskJobs$.next(next);

    const existing = this.dismissTimers.get(progress.taskType);
    if (existing) {
      clearTimeout(existing);
      this.dismissTimers.delete(progress.taskType);
    }

    if (terminal) {
      const timer = setTimeout(() => {
        const trimmed = {...this.taskJobs$.value};
        delete trimmed[progress.taskType];
        this.taskJobs$.next(trimmed);
        this.dismissTimers.delete(progress.taskType);
      }, 5000);
      this.dismissTimers.set(progress.taskType, timer);
    }
  }

  private upsertWriteProgress(progress: WriteProgressPayload | null): void {
    if (!progress) {
      this.writeJob$.next(null);
      return;
    }
    this.writeJob$.next({
      id: 'write-progress',
      label: this.t.translate('layout.topbar.writeUpdating'),
      summary: progress.message,
      progress: progress.status === 'IN_PROGRESS' ? null : 100,
      cancellable: false,
      taskId: null,
      tone: 'write'
    });
    if (progress.status !== 'IN_PROGRESS') {
      setTimeout(() => {
        if (this.writeJob$.value?.summary === progress.message) {
          this.writeProgressService.clear();
        }
      }, 5000);
    }
  }

  private labelFor(taskType: string): string {
    switch (taskType) {
      case TaskType.FLUSH_METADATA_TO_FILES:
        return this.t.translate('layout.topbar.metadataFlush');
      case TaskType.SYNC_LIBRARY_FILES:
        return this.t.translate('layout.topbar.importScan');
      case TaskType.DIRECTORY_TAGGING:
        return this.t.translate('layout.topbar.directoryTagging');
      case TaskType.REFRESH_LIBRARY_METADATA:
      case TaskType.REFRESH_METADATA_MANUAL:
        return this.t.translate('layout.topbar.metadataFetch');
      case TaskType.UPDATE_BOOK_RECOMMENDATIONS:
        return this.t.translate('layout.topbar.recommendations');
      default:
        return taskType;
    }
  }

  private toneFor(taskType: string): SystemJobRow['tone'] {
    if (taskType === TaskType.SYNC_LIBRARY_FILES || taskType === TaskType.UPDATE_BOOK_RECOMMENDATIONS) {
      return 'library';
    }
    return 'metadata';
  }
}
