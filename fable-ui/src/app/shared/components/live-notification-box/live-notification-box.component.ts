import {Component, inject, OnInit} from '@angular/core';
import {NotificationEventService} from '../../websocket/notification-event.service';
import {CommonModule} from '@angular/common';
import {TagComponent} from '../tag/tag.component';
import {TranslocoDirective} from '@jsverse/transloco';
import {formatNotificationTime} from '../../websocket/model/log-notification.model';

@Component({
  selector: 'app-live-notification-box',
  standalone: true,
  templateUrl: './live-notification-box.component.html',
  styleUrls: ['./live-notification-box.component.scss'],
  host: {
    class: 'config-panel'
  },
  imports: [
    CommonModule,
    TagComponent,
    TranslocoDirective
  ]
})
export class LiveNotificationBoxComponent implements OnInit {
  private notificationService = inject(NotificationEventService);
  historicalNotifications$ = this.notificationService.historicalNotifications$;

  ngOnInit(): void {
    this.notificationService.fetchHistoricalNotifications();
  }

  dismissNotification(id?: number): void {
    if (id != null) {
      this.notificationService.deleteNotification(id).subscribe();
      return;
    }
    this.notificationService.clearNotification();
  }

  dismissAllNotifications(): void {
    this.notificationService.deleteAllNotifications().subscribe();
  }

  getSeverityColor(severity?: string): 'red' | 'amber' | 'green' | 'gray' {
    switch (severity) {
      case 'ERROR':
        return 'red';
      case 'WARN':
        return 'amber';
      case 'INFO':
        return 'green';
      default:
        return 'gray';
    }
  }

  formatTimestamp(timestamp?: string): string {
    return formatNotificationTime(timestamp);
  }

  trackById(_index: number, notification: {id?: number; timestamp?: string; message: string}): string | number {
    return notification.id ?? `${notification.timestamp}-${notification.message}`;
  }
}
