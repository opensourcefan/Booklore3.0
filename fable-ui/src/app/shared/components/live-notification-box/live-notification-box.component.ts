import {Component, inject} from '@angular/core';
import {NotificationEventService} from '../../websocket/notification-event.service';
import {CommonModule} from '@angular/common';

import {TagComponent} from '../tag/tag.component';

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
    TagComponent
  ]
})
export class LiveNotificationBoxComponent {
  private notificationService = inject(NotificationEventService);
  activeNotification$ = this.notificationService.activeNotification$;

  dismissNotification(): void {
    this.notificationService.clearNotification();
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
}
