import {inject, Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {filter} from 'rxjs/operators';
import {MessageService} from 'primeng/api';
import {NotificationEventService} from '../websocket/notification-event.service';
import {Severity} from '../websocket/model/log-notification.model';
import {RxStompService} from '../websocket/rx-stomp.service';
import {RxStompState} from '@stomp/rx-stomp';

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
  private readonly notificationService = inject(NotificationEventService);
  private readonly rxStompService = inject(RxStompService);
  private readonly progressSubject = new BehaviorSubject<AiSearchProgressPayload | null>(null);
  private readonly embeddingBookIdsSubject = new BehaviorSubject<Set<number>>(new Set());
  private clearTimer: ReturnType<typeof setTimeout> | undefined;

  readonly progress$ = this.progressSubject.asObservable();
  readonly embeddingBookIds$ = this.embeddingBookIdsSubject.asObservable();

  constructor() {
    this.rxStompService?.connectionState$?.subscribe(state => {
      if (state !== RxStompState.OPEN) {
        this.progressSubject.next(null);
      }
    });
  }

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

    // Instead of toast notifications, log to the system notification button dropdown
    const detail = this.buildStatusText(progress);
    const completionSummary = this.buildCompletionSummary(progress);
    const messageText = completionSummary || detail;

    let severity: Severity = Severity.INFO;
    if (progress.event === 'FAILED') {
      severity = Severity.ERROR;
    } else if (progress.event === 'STOPPED') {
      severity = Severity.WARN;
    }

    this.notificationService.handleNewNotification({
      timestamp: new Date().toLocaleTimeString(),
      message: messageText,
      severity
    });

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
      if (progress.event === 'STARTED' || total === 0) {
        return progress.message;
      }
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

  updateReaderToast(_progress: AiSearchProgressPayload): void {
    // Toast notifications are disabled as progress notifications are logged in the topbar dropdown instead.
  }
}
