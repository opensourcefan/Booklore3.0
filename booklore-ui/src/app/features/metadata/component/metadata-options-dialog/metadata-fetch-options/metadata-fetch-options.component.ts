import {Component, inject} from '@angular/core';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {MetadataRefreshRequest, MetadataRefreshTargetMode} from '../../../model/request/metadata-refresh-request.model';
import {MetadataRefreshType} from '../../../model/request/metadata-refresh-type.enum';
import {MetadataRefreshOptions} from '../../../model/request/metadata-refresh-options.model';
import {AppSettingsService} from '../../../../../shared/service/app-settings.service';
import {filter, take} from 'rxjs/operators';
import {MetadataAdvancedFetchOptionsComponent} from '../metadata-advanced-fetch-options/metadata-advanced-fetch-options.component';
import {TaskHelperService} from '../../../../settings/task-management/task-helper.service';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {Select} from 'primeng/select';
import {Button} from 'primeng/button';
import {MessageService} from 'primeng/api';
import {MetadataResumableTask, MetadataTaskService} from '../../../../book/service/metadata-task';
import {FormsModule} from '@angular/forms';

@Component({
  selector: 'app-metadata-fetch-options',
  standalone: true,
  templateUrl: './metadata-fetch-options.component.html',
  imports: [
    MetadataAdvancedFetchOptionsComponent,
    TranslocoDirective,
    Select,
    Button,
    FormsModule
  ],
  styleUrl: './metadata-fetch-options.component.scss'
})
export class MetadataFetchOptionsComponent {
  libraryId!: number;
  bookIds!: number[];
  metadataRefreshType!: MetadataRefreshType;
  currentMetadataOptions!: MetadataRefreshOptions;
  targetMode: MetadataRefreshTargetMode = 'ALL';
  olderThanDays: number | null = 30;
  latestResumableTask: MetadataResumableTask | null = null;

  private dynamicDialogConfig = inject(DynamicDialogConfig);
  dynamicDialogRef = inject(DynamicDialogRef);
  private taskHelperService = inject(TaskHelperService);
  private appSettingsService = inject(AppSettingsService);
  private metadataTaskService = inject(MetadataTaskService);
  private messageService = inject(MessageService);
  private readonly t = inject(TranslocoService);

  constructor() {
    this.libraryId = this.dynamicDialogConfig.data.libraryId;
    this.bookIds = this.dynamicDialogConfig.data.bookIds;
    this.metadataRefreshType = this.dynamicDialogConfig.data.metadataRefreshType;
    this.appSettingsService.appSettings$.pipe(
      filter(settings => settings != null),
      take(1)
    ).subscribe(settings => {
      this.currentMetadataOptions = settings?.defaultMetadataRefreshOptions;
    });

    this.metadataTaskService.getLatestResumableTask().subscribe({
      next: (task) => {
        this.latestResumableTask = task;
      },
      error: () => {
        this.latestResumableTask = null;
      }
    });
  }

  get targetModeOptions(): {label: string; value: MetadataRefreshTargetMode}[] {
    return [
      {label: this.t.translate('metadata.fetchOptions.targetBooks.all'), value: 'ALL'},
      {label: this.t.translate('metadata.fetchOptions.targetBooks.neverFetched'), value: 'NEVER_FETCHED'},
      {label: this.t.translate('metadata.fetchOptions.targetBooks.olderThan'), value: 'OLDER_THAN_DAYS'}
    ];
  }

  get olderThanOptions(): {label: string; value: number}[] {
    return [
      {label: this.t.translate('metadata.fetchOptions.targetBooks.days', {count: 1}), value: 1},
      {label: this.t.translate('metadata.fetchOptions.targetBooks.days', {count: 7}), value: 7},
      {label: this.t.translate('metadata.fetchOptions.targetBooks.days', {count: 30}), value: 30},
      {label: this.t.translate('metadata.fetchOptions.targetBooks.days', {count: 90}), value: 90}
    ];
  }

  onMetadataSubmit(metadataRefreshOptions: MetadataRefreshOptions) {
    const metadataRefreshRequest: MetadataRefreshRequest = {
      refreshType: this.metadataRefreshType,
      refreshOptions: metadataRefreshOptions,
      bookIds: this.bookIds,
      libraryId: this.libraryId,
      targetMode: this.targetMode,
      olderThanDays: this.targetMode === 'OLDER_THAN_DAYS' ? this.olderThanDays : null,
    };
    this.taskHelperService.refreshMetadataTask(metadataRefreshRequest).subscribe();
    this.dynamicDialogRef.close();
  }

  resumeLatestTask(): void {
    if (!this.latestResumableTask) {
      return;
    }

    this.metadataTaskService.resumeTask(this.latestResumableTask.taskId).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'info',
          summary: this.t.translate('metadata.fetchOptions.resume.toastSummary'),
          detail: this.t.translate('metadata.fetchOptions.resume.toastDetail', {count: this.latestResumableTask?.pendingBooksCount ?? 0})
        });
        this.dynamicDialogRef.close();
      },
      error: () => {
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('metadata.fetchOptions.resume.toastErrorSummary'),
          detail: this.t.translate('metadata.fetchOptions.resume.toastErrorDetail')
        });
      }
    });
  }
}
