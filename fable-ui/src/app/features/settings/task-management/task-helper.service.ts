import {inject, Injectable} from '@angular/core';
import {MessageService} from 'primeng/api';
import {FailureNotificationService} from '../../../shared/service/failure-notification.service';
import {MetadataRefreshRequest} from '../../metadata/model/request/metadata-refresh-request.model';
import {catchError, map} from 'rxjs/operators';
import {of} from 'rxjs';
import {TaskCreateRequest, TaskService, TaskType} from './task.service';
import {TranslocoService} from '@jsverse/transloco';

export interface StartedTaskResult {
  success: boolean;
  taskId: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class TaskHelperService {
  private taskService = inject(TaskService);
  private messageService = inject(MessageService);
  private failureNotifications = inject(FailureNotificationService);
  private readonly t = inject(TranslocoService);

  refreshMetadataTask(options: MetadataRefreshRequest) {
    const request: TaskCreateRequest = {
      taskType: TaskType.REFRESH_METADATA_MANUAL,
      triggeredByCron: false,
      options
    };
    return this.taskService.startTask(request).pipe(
      map((response): StartedTaskResult => {
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('settingsTasks.toast.metadataScheduled'),
          detail: this.t.translate('settingsTasks.toast.metadataScheduledDetail')
        });
        return {success: true, taskId: response.taskId ?? null};
      }),
      catchError((e) => {
        if (e.status === 409) {
          this.messageService.add({
            severity: 'error',
            summary: this.t.translate('settingsTasks.toast.alreadyRunning'),
            detail: this.t.translate('settingsTasks.toast.metadataAlreadyRunningDetail'),
            life: 5000
          });
        } else {
          this.toastError(this.t.translate('settingsTasks.toast.metadataFailed'), this.t.translate('settingsTasks.toast.metadataFailedDetail'), 5000);
        }
        return of({success: false, taskId: null});
      })
    );
  }
  private toastError(summary: string, detail: string, life = 3000): void {
    this.messageService.add({severity: 'error', summary, detail, life});
    this.failureNotifications.reportSafe(summary, detail);
  }

}
