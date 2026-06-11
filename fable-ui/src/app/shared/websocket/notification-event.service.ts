import {Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {filter} from 'rxjs/operators';
import {LogNotification} from './model/log-notification.model';

@Injectable({
  providedIn: 'root',
})
export class NotificationEventService {
  private latestNotificationSubject = new BehaviorSubject<LogNotification | null>(null);

  latestNotification$: Observable<LogNotification> = this.latestNotificationSubject.asObservable().pipe(
    filter((event): event is LogNotification => event !== null)
  );

  activeNotification$: Observable<LogNotification | null> = this.latestNotificationSubject.asObservable();

  private notificationHighlightSubject = new BehaviorSubject<boolean>(false);
  notificationHighlight$ = this.notificationHighlightSubject.asObservable();

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
}
