import {inject, Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable, tap} from 'rxjs';
import {API_CONFIG} from '../../core/config/api-config';
import {LogNotification, Severity} from '../websocket/model/log-notification.model';
import {NotificationEventService} from '../websocket/notification-event.service';

/**
 * Client helper: report a failure into the bell Notifications inbox (persisted).
 */
@Injectable({
  providedIn: 'root'
})
export class FailureNotificationService {
  private readonly http = inject(HttpClient);
  private readonly notificationEvents = inject(NotificationEventService);

  report(operation: string, detail: string): Observable<LogNotification> {
    const message = detail?.trim() || 'Unknown error';
    return this.http.post<LogNotification>(`${API_CONFIG.BASE_URL}/api/v1/notifications`, {
      operation: operation?.trim() || undefined,
      message
    }).pipe(
      tap(notification => {
        this.notificationEvents.handleNewNotification({
          ...notification,
          severity: notification.severity ?? Severity.ERROR
        });
      })
    );
  }

  /** Fire-and-forget; logs warning on failure to report. */
  reportSafe(operation: string, detail: string): void {
    this.report(operation, detail).subscribe({
      error: err => console.warn('Failed to persist failure notification', err)
    });
  }
}
