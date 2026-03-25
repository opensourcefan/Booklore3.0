import {Component, inject, OnDestroy, OnInit} from '@angular/core';
import {NgClass} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {ToggleSwitch} from 'primeng/toggleswitch';
import {MultiSelect} from 'primeng/multiselect';
import {MessageService} from 'primeng/api';
import {TranslocoDirective} from '@jsverse/transloco';
import {Subject} from 'rxjs';
import {filter, take, takeUntil} from 'rxjs/operators';

import {AiServiceStatus, AppSettingKey, AppSettings} from '../../../shared/model/app-settings.model';
import {AiPanelScanProgressPayload} from '../../../shared/model/ai-panel-scan-progress.model';
import {AppSettingsService} from '../../../shared/service/app-settings.service';
import {AiPanelScanProgressService} from '../../../shared/service/ai-panel-scan-progress.service';
import {LibraryService} from '../../book/service/library.service';

@Component({
  selector: 'app-ai-settings',
  standalone: true,
  imports: [
    Button,
    FormsModule,
    MultiSelect,
    NgClass,
    ToggleSwitch,
    TranslocoDirective
  ],
  templateUrl: './ai-settings.component.html',
  styleUrl: './ai-settings.component.scss'
})
export class AiSettingsComponent implements OnInit, OnDestroy {
  private appSettingsService = inject(AppSettingsService);
  private messageService = inject(MessageService);
  private libraryService = inject(LibraryService);
  private aiPanelScanProgressService = inject(AiPanelScanProgressService);
  private destroy$ = new Subject<void>();

  appSettings$ = this.appSettingsService.appSettings$;

  aiEnabled = false;
  saveRunning = false;
  statusLoading = false;
  cleanupRunning = false;
  preScanRunning = false;

  status: AiServiceStatus | null = null;
  selectedLibraryPathIds: number[] = [];
  libraryPathOptions: Array<{label: string; value: number}> = [];
  batchProgress: AiPanelScanProgressPayload | null = null;

  ngOnInit(): void {
    this.appSettings$.pipe(
      filter((settings): settings is AppSettings => !!settings),
      take(1)
    ).subscribe(settings => {
      this.aiEnabled = settings.aiPanelDetectionEnabled ?? false;
      this.refreshStatus();
    });

    this.libraryService.libraryState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        const options = (state.libraries ?? []).flatMap(library =>
          (library.paths ?? [])
            .filter(path => typeof path.id === 'number')
            .map(path => ({
              label: `${library.name} · ${path.path}`,
              value: path.id as number
            }))
        );

        this.libraryPathOptions = options;
        if (!this.selectedLibraryPathIds.length) {
          this.selectedLibraryPathIds = options.map(option => option.value);
        } else {
          const validOptionIds = new Set(options.map(option => option.value));
          this.selectedLibraryPathIds = this.selectedLibraryPathIds.filter(id => validOptionIds.has(id));
        }
      });

    this.aiPanelScanProgressService.batchProgress$()
      .pipe(takeUntil(this.destroy$))
      .subscribe(progress => {
        this.batchProgress = progress;
        this.preScanRunning = !['COMPLETED', 'FAILED'].includes(progress.event);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
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

  preScanMissing(): void {
    if (!this.aiEnabled || !this.selectedLibraryPathIds.length || this.preScanRunning) {
      return;
    }

    this.preScanRunning = true;
    this.appSettingsService.scanMissingAiPanelData(this.selectedLibraryPathIds).subscribe({
      next: result => {
        this.preScanRunning = result.started;
        this.showMessage(
          result.started ? 'success' : 'info',
          result.started ? 'AI pre-scan started' : 'AI pre-scan not needed',
          result.message
        );
      },
      error: () => {
        this.preScanRunning = false;
        this.showMessage('error', 'Pre-scan failed', 'Could not start missing AI panel scanning.');
      }
    });
  }

  get statusEndpointLabel(): string {
    const baseUrl = this.status?.baseUrl?.trim();
    if (!baseUrl) {
      return '';
    }

    try {
      const {host} = new URL(baseUrl);
      if (host.startsWith('booklore-ai-panel') || host.startsWith('ai-panel')) {
        return 'Docker AI service';
      }
      return baseUrl;
    } catch {
      return baseUrl;
    }
  }

  get showDockerHint(): boolean {
    const baseUrl = this.status?.baseUrl?.trim();
    if (!baseUrl || this.status?.serviceReachable) {
      return false;
    }

    try {
      const {host} = new URL(baseUrl);
      return host.startsWith('booklore-ai-panel') || host.startsWith('ai-panel');
    } catch {
      return false;
    }
  }

  get batchProgressText(): string {
    return this.batchProgress ? this.aiPanelScanProgressService.buildStatusText(this.batchProgress) : '';
  }

  private showMessage(severity: 'success' | 'error' | 'info', summary: string, detail: string): void {
    this.messageService.add({severity, summary, detail});
  }
}
