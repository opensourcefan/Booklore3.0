import {Component, inject} from '@angular/core';
import {LiveNotificationBoxComponent} from '../live-notification-box/live-notification-box.component';
import {MetadataProgressService} from '../../service/metadata-progress.service';
import {map} from 'rxjs/operators';
import {AsyncPipe} from '@angular/common';
import {BookdropFileService} from '../../../features/bookdrop/service/bookdrop-file.service';
import {BookdropFilesWidgetComponent} from '../../../features/bookdrop/component/bookdrop-files-widget/bookdrop-files-widget.component';
import {MetadataProgressWidgetComponent} from '../metadata-progress-widget/metadata-progress-widget-component';
import {combineLatest} from 'rxjs';
import {AiSearchScanProgressService} from '../../service/ai-search-scan-progress.service';
import {AiSearchProgressWidgetComponent} from '../ai-search-progress-widget/ai-search-progress-widget-component';
import {Tab, TabList, TabPanel, TabPanels, Tabs} from 'primeng/tabs';
import {TranslocoDirective} from '@jsverse/transloco';
import {NotificationEventService} from '../../websocket/notification-event.service';

@Component({
  selector: 'app-unified-notification-popover-component',
  imports: [
    LiveNotificationBoxComponent,
    MetadataProgressWidgetComponent,
    AsyncPipe,
    BookdropFilesWidgetComponent,
    AiSearchProgressWidgetComponent,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    TranslocoDirective
  ],
  templateUrl: './unified-notification-popover-component.html',
  standalone: true,
  styleUrl: './unified-notification-popover-component.scss'
})
export class UnifiedNotificationBoxComponent {
  metadataProgressService = inject(MetadataProgressService);
  bookdropFileService = inject(BookdropFileService);
  aiSearchScanProgressService = inject(AiSearchScanProgressService);
  notificationEventService = inject(NotificationEventService);

  hasMetadataTasks$ = this.metadataProgressService.activeTasks$.pipe(
    map(tasks => Object.keys(tasks).length > 0)
  );

  hasPendingBookdropFiles$ = this.bookdropFileService.hasPendingFiles$;

  hasAiSearchScan$ = combineLatest([
    this.aiSearchScanProgressService.progress$,
    this.aiSearchScanProgressService.isStopping$
  ]).pipe(
    map(([progress, isStopping]) => {
      if (isStopping) return true;
      return !!(progress && progress.mode === 'BATCH');
    })
  );

  hasRunningTasks$ = combineLatest([
    this.hasMetadataTasks$,
    this.hasPendingBookdropFiles$,
    this.hasAiSearchScan$
  ]).pipe(
    map(([meta, bookdrop, ai]) => meta || bookdrop || ai)
  );

  failureCount$ = this.notificationEventService.unreadFailureCount$;
}
