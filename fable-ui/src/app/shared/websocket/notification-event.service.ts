import {inject, Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {filter, tap} from 'rxjs/operators';
import {
  formatNotificationTime,
  isInboxSeverity,
  LogNotification
} from './model/log-notification.model';
import {HttpClient} from '@angular/common/http';
import {API_CONFIG} from '../../core/config/api-config';

@Injectable({
  providedIn: 'root',
})
export class NotificationEventService {
  private http = inject(HttpClient);

  private latestNotificationSubject = new BehaviorSubject<LogNotification | null>(null);

  latestNotification$: Observable<LogNotification> = this.latestNotificationSubject.asObservable().pipe(
    filter((event): event is LogNotification => event !== null)
  );

  activeNotification$: Observable<LogNotification | null> = this.latestNotificationSubject.asObservable();

  private notificationHighlightSubject = new BehaviorSubject<boolean>(false);
  notificationHighlight$ = this.notificationHighlightSubject.asObservable();

  private historicalNotificationsSubject = new BehaviorSubject<LogNotification[]>([]);
  historicalNotifications$ = this.historicalNotificationsSubject.asObservable();

  private unreadFailureCountSubject = new BehaviorSubject<number>(0);
  unreadFailureCount$ = this.unreadFailureCountSubject.asObservable();

  handleNewNotification(notification: LogNotification, highlight = true): void {
    const normalized: LogNotification = {
      ...notification,
      timestamp: notification.timestamp ?? new Date().toISOString(),
      message: this.stripHtml(notification.message)
    };

    // Failure inbox only — INFO success chatter does not enter Notifications
    if (!isInboxSeverity(normalized.severity)) {
      return;
    }

    this.latestNotificationSubject.next(normalized);
    this.prependHistorical(normalized);
    this.unreadFailureCountSubject.next(this.historicalNotificationsSubject.value.length);
    if (highlight) {
      this.notificationHighlightSubject.next(true);
    }
  }

  clearNotification(): void {
    this.notificationHighlightSubject.next(false);
    this.latestNotificationSubject.next(null);
  }

  fetchHistoricalNotifications(): void {
    this.http.get<LogNotification[]>(`${API_CONFIG.BASE_URL}/api/v1/notifications/recent?limit=50`)
      .subscribe({
        next: (notifications) => {
          const mapped = (notifications ?? [])
            .filter(n => isInboxSeverity(n.severity))
            .map(n => ({
              ...n,
              message: this.stripHtml(n.message),
              timestamp: n.timestamp ?? undefined
            }));
          this.historicalNotificationsSubject.next(mapped);
          this.unreadFailureCountSubject.next(mapped.length);
        },
        error: (err) => {
          console.warn('Failed to fetch historical notifications', err);
        }
      });
  }

  deleteNotification(id: number): Observable<void> {
    return this.http.delete<void>(`${API_CONFIG.BASE_URL}/api/v1/notifications/${id}`).pipe(
      tap(() => {
        const remaining = this.historicalNotificationsSubject.value.filter(n => n.id !== id);
        this.historicalNotificationsSubject.next(remaining);
        this.unreadFailureCountSubject.next(remaining.length);
        const active = this.latestNotificationSubject.value;
        if (active?.id === id) {
          this.clearNotification();
        }
      })
    );
  }

  deleteAllNotifications(): Observable<void> {
    return this.http.delete<void>(`${API_CONFIG.BASE_URL}/api/v1/notifications`).pipe(
      tap(() => {
        this.historicalNotificationsSubject.next([]);
        this.latestNotificationSubject.next(null);
        this.notificationHighlightSubject.next(false);
        this.unreadFailureCountSubject.next(0);
      })
    );
  }

  formatTimestamp(timestamp?: string): string {
    return formatNotificationTime(timestamp);
  }

  private prependHistorical(notification: LogNotification): void {
    const current = this.historicalNotificationsSubject.value;
    if (notification.id != null && current.some(n => n.id === notification.id)) {
      return;
    }
    this.historicalNotificationsSubject.next([notification, ...current].slice(0, 50));
  }

  private stripHtml(message: string): string {
    return (message ?? '').replace(/<[^>]*>/g, '').trim();
  }
}
