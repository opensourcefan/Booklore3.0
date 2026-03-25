import {Component, inject, OnInit} from '@angular/core';
import {NgClass} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {ToggleSwitch} from 'primeng/toggleswitch';
import {MessageService} from 'primeng/api';
import {TranslocoDirective} from '@jsverse/transloco';
import {filter, take} from 'rxjs/operators';

import {AiServiceStatus, AppSettingKey, AppSettings} from '../../../shared/model/app-settings.model';
import {AppSettingsService} from '../../../shared/service/app-settings.service';

@Component({
  selector: 'app-ai-settings',
  standalone: true,
  imports: [
    Button,
    FormsModule,
    NgClass,
    ToggleSwitch,
    TranslocoDirective
  ],
  templateUrl: './ai-settings.component.html',
  styleUrl: './ai-settings.component.scss'
})
export class AiSettingsComponent implements OnInit {
  private appSettingsService = inject(AppSettingsService);
  private messageService = inject(MessageService);

  appSettings$ = this.appSettingsService.appSettings$;

  aiEnabled = false;
  saveRunning = false;
  statusLoading = false;
  cleanupRunning = false;

  status: AiServiceStatus | null = null;

  ngOnInit(): void {
    this.appSettings$.pipe(
      filter((settings): settings is AppSettings => !!settings),
      take(1)
    ).subscribe(settings => {
      this.aiEnabled = settings.aiPanelDetectionEnabled ?? false;
      this.refreshStatus();
    });
  }

  onToggleAiEnabled(checked: boolean): void {
    const previousValue = this.aiEnabled;
    this.aiEnabled = checked;
    this.saveRunning = true;

    this.appSettingsService
      .saveSettings([{key: AppSettingKey.AI_PANEL_DETECTION_ENABLED, newValue: checked}])
      .subscribe({
        next: () => {
          this.saveRunning = false;
          this.showMessage('success', 'AI settings updated', checked ? 'AI panel detection is enabled.' : 'AI panel detection is disabled.');
          this.refreshStatus();
        },
        error: () => {
          this.saveRunning = false;
          this.aiEnabled = previousValue;
          this.refreshStatus();
          this.showMessage('error', 'Save failed', 'Could not update AI panel detection setting.');
        }
      });
  }

  refreshStatus(): void {
    this.statusLoading = true;
    this.appSettingsService.getAiServiceStatus().subscribe({
      next: status => {
        this.status = status;
        this.statusLoading = false;
      },
      error: err => {
        this.statusLoading = false;
        this.status = {
          enabled: this.aiEnabled,
          serviceReachable: false,
          status: 'ERROR',
          message: 'Failed to fetch AI service status.',
          error: err?.message ?? 'Unknown error',
          baseUrl: ''
        };
      }
    });
  }

  cleanupAiData(): void {
    this.cleanupRunning = true;
    this.appSettingsService.cleanupAiPanelData().subscribe({
      next: result => {
        this.cleanupRunning = false;
        this.showMessage('success', 'Cleanup completed', `Deleted ${result.deletedCount} saved AI panel-flow records.`);
      },
      error: () => {
        this.cleanupRunning = false;
        this.showMessage('error', 'Cleanup failed', 'Could not delete saved AI panel-flow records.');
      }
    });
  }

  private showMessage(severity: 'success' | 'error', summary: string, detail: string): void {
    this.messageService.add({severity, summary, detail});
  }
}
