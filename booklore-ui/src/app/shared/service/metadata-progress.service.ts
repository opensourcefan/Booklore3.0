import {inject, Injectable, OnDestroy} from '@angular/core';
import {BehaviorSubject, Subject, Subscription, timer} from 'rxjs';
import {MetadataBatchProgressNotification} from '../model/metadata-batch-progress.model';
import {MetadataTaskService} from '../../features/book/service/metadata-task';
import {UserService} from '../../features/settings/user-management/user.service';
import {filter, switchMap, take} from 'rxjs/operators';

@Injectable({providedIn: 'root'})
export class MetadataProgressService implements OnDestroy {
  private progressMap = new Map<string, BehaviorSubject<MetadataBatchProgressNotification>>();

  private progressUpdatesSubject = new Subject<MetadataBatchProgressNotification>();
  progressUpdates$ = this.progressUpdatesSubject.asObservable();

  private activeTasksSubject = new BehaviorSubject<Record<string, MetadataBatchProgressNotification>>({});
  activeTasks$ = this.activeTasksSubject.asObservable();

  private metadataTaskService = inject(MetadataTaskService);
  private userService = inject(UserService);

  private subscriptions = new Subscription();

  constructor() {
    const sub = this.userService.userState$
      .pipe(
        filter(userState => !!userState?.user),
        take(1)
      )
      .subscribe(userState => {
        if (!this.hasMetadataPermissions(userState.user)) {
          return;
        }
        const activeTasksSub = timer(0, 30000).pipe(
          switchMap(() => this.metadataTaskService.getActiveTasks())
        ).subscribe({
          next: (tasks) => this.syncActiveTasks(tasks),
          error: (err) => console.warn('Failed to fetch active metadata tasks:', err)
        });
        this.subscriptions.add(activeTasksSub);
      });

    this.subscriptions.add(sub);
  }

  handleIncomingProgress(progress: MetadataBatchProgressNotification): void {
    const {taskId} = progress;
    const existing = this.progressMap.get(taskId)?.getValue();
    const mergedProgress = this.mergeTaskProgress(existing, progress);

    if (!this.progressMap.has(taskId)) {
      this.progressMap.set(taskId, new BehaviorSubject(mergedProgress));
    } else {
      this.progressMap.get(taskId)!.next(mergedProgress);
    }

    this.progressUpdatesSubject.next(mergedProgress);
    this.activeTasksSubject.next(this.getActiveTasks());
  }

  markCancellationRequested(taskId: string, message: string): void {
    const task = this.progressMap.get(taskId)?.getValue();
    if (!task || task.status !== 'IN_PROGRESS') {
      return;
    }

    const updatedTask: MetadataBatchProgressNotification = {
      ...task,
      cancellationRequested: true,
      message,
    };

    this.progressMap.get(taskId)!.next(updatedTask);
    this.progressUpdatesSubject.next(updatedTask);
    this.activeTasksSubject.next(this.getActiveTasks());
  }

  clearTask(taskId: string): void {
    this.progressMap.delete(taskId);
    this.activeTasksSubject.next(this.getActiveTasks());
  }

  getActiveTasks(): Record<string, MetadataBatchProgressNotification> {
    const result: Record<string, MetadataBatchProgressNotification> = {};
    this.progressMap.forEach((subject, taskId) => {
      result[taskId] = subject.getValue();
    });
    return result;
  }

  private hasMetadataPermissions(user: { permissions: { admin: boolean; canEditMetadata: boolean } } | null): boolean {
    return !!(user?.permissions?.admin || user?.permissions?.canEditMetadata);
  }

  private syncActiveTasks(tasks: MetadataBatchProgressNotification[]): void {
    const incomingTaskIds = new Set(tasks.map(task => task.taskId));

    for (const taskId of this.progressMap.keys()) {
      if (!incomingTaskIds.has(taskId)) {
        this.progressMap.delete(taskId);
      }
    }

    for (const task of tasks) {
      const existing = this.progressMap.get(task.taskId)?.getValue();
      const mergedTask = this.mergeTaskProgress(existing, task);

      if (!this.progressMap.has(task.taskId)) {
        this.progressMap.set(task.taskId, new BehaviorSubject(mergedTask));
      } else {
        this.progressMap.get(task.taskId)!.next(mergedTask);
      }
      this.progressUpdatesSubject.next(mergedTask);
    }
    this.activeTasksSubject.next(this.getActiveTasks());
  }

  private mergeTaskProgress(
    existing: MetadataBatchProgressNotification | undefined,
    incoming: MetadataBatchProgressNotification
  ): MetadataBatchProgressNotification {
    if (incoming.status !== 'IN_PROGRESS') {
      return {...incoming, cancellationRequested: false};
    }

    return {
      ...incoming,
      cancellationRequested: existing?.cancellationRequested ?? false,
    };
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.progressMap.forEach(subject => subject.complete());
    this.progressUpdatesSubject.complete();
    this.activeTasksSubject.complete();
  }
}
