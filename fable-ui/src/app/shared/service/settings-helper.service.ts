import {Injectable, inject} from '@angular/core';
import {AppSettingsService} from './app-settings.service';
import {MessageService} from 'primeng/api';
import {TranslocoService} from '@jsverse/transloco';
import {Observable} from 'rxjs';
import {FailureNotificationService} from './failure-notification.service';
import {SaveButtonStatusController} from './save-button-status.controller';

@Injectable({
  providedIn: 'root'
})
export class SettingsHelperService {

  private readonly appSettingsService = inject(AppSettingsService);
  private readonly messageService = inject(MessageService);
  private readonly failureNotifications = inject(FailureNotificationService);
  private readonly t = inject(TranslocoService);

  saveSetting(key: string, value: unknown, saveStatus?: SaveButtonStatusController): Observable<void> {
    const observable = this.appSettingsService.saveSettings([{key, newValue: value}]);

    observable.subscribe({
      next: () => {
        saveStatus?.markSuccess();
        // Toast demoted — button color is the primary success signal when provided
        if (!saveStatus) {
          this.showSuccessMessage();
        }
      },
      error: (error) => {
        console.error('Failed to save setting:', error);
        saveStatus?.markError();
        this.showErrorMessage(saveStatus);
      }
    });

    return observable;
  }

  private showSuccessMessage(): void {
    this.messageService.add({
      severity: 'success',
      summary: this.t.translate('shared.settingsHelper.settingsSavedSummary'),
      detail: this.t.translate('shared.settingsHelper.settingsSavedDetail'),
      life: 2000
    });
  }

  private showErrorMessage(saveStatus?: SaveButtonStatusController): void {
    const detail = this.t.translate('shared.settingsHelper.saveErrorDetail');
    this.failureNotifications.reportSafe(
      this.t.translate('shared.settingsHelper.settingsSavedSummary'),
      detail
    );
    // Soft toast only when there is no anchored save-button status
    if (!saveStatus) {
      this.messageService.add({
        severity: 'error',
        summary: this.t.translate('common.error'),
        detail
      });
    }
  }

  showMessage(severity: 'success' | 'error', summary: string, detail: string): void {
    if (severity === 'error') {
      this.failureNotifications.reportSafe(summary, detail);
    }
    this.messageService.add({severity, summary, detail, life: severity === 'success' ? 2000 : 4000});
  }
}
