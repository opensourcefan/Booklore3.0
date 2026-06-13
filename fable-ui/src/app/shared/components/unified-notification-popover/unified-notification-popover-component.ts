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

@Component({
  selector: 'app-unified-notification-popover-component',
  imports: [
    LiveNotificationBoxComponent,
    MetadataProgressWidgetComponent,
    AsyncPipe,
    BookdropFilesWidgetComponent,
    AiSearchProgressWidgetComponent
  ],
  templateUrl: './unified-notification-popover-component.html',
  standalone: true,
  styleUrl: './unified-notification-popover-component.scss'
})
export class UnifiedNotificationBoxComponent {
  metadataProgressService = inject(MetadataProgressService);
  bookdropFileService = inject(BookdropFileService);
  aiSearchScanProgressService = inject(AiSearchScanProgressService);

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
}
