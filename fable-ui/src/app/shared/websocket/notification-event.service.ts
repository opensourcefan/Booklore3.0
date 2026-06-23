import {inject, Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {filter} from 'rxjs/operators';
import {LogNotification} from './model/log-notification.model';
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

  private highlightTimeout: ReturnType<typeof setTimeout> | undefined;
  private clearTimeoutHandle: ReturnType<typeof setTimeout> | undefined;

  handleNewNotification(notification: LogNotification, highlight = true): void {
    this.latestNotificationSubject.next(notification);
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
          this.historicalNotificationsSubject.next(notifications);
        },
        error: (err) => {
          console.warn('Failed to fetch historical notifications', err);
        }
      });
  }
}
