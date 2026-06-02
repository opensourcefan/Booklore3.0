import {Component, inject, OnDestroy, OnInit} from '@angular/core';
import {NgClass} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {Dialog} from 'primeng/dialog';
import {ToggleSwitch} from 'primeng/toggleswitch';
import {MessageService} from 'primeng/api';
import {TranslocoDirective} from '@jsverse/transloco';
import {Subject} from 'rxjs';
import {filter, take, takeUntil} from 'rxjs/operators';

import {AiPanelFlowStats, AiServiceStatus, AppSettingKey, AppSettings} from '../../../shared/model/app-settings.model';
import {AiPanelScanProgressPayload} from '../../../shared/model/ai-panel-scan-progress.model';
import {AppSettingsService} from '../../../shared/service/app-settings.service';
import {AiPanelScanProgressService} from '../../../shared/service/ai-panel-scan-progress.service';
import {AiSearchProgressPayload, AiSearchScanProgressService} from '../../../shared/service/ai-search-scan-progress.service';
import {LibraryService} from '../../book/service/library.service';
import {BookService} from '../../book/service/book.service';
import {DialogLauncherService} from '../../../shared/services/dialog-launcher.service';

const LS_KEY_AI_SCAN_PATH_IDS = 'booklore.aiScanSelectedPathIds';
const LS_KEY_AI_SCAN_LIBRARY_FILTER_IDS = 'booklore.aiScanLibraryFilterIds';

interface AiStartupEvent {
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  text: string;
}

@Component({
  selector: 'app-ai-settings',
  standalone: true,
  imports: [
    Button,
    Dialog,
    FormsModule,
    NgClass,
    ToggleSwitch,
    TranslocoDirective
  ],
  templateUrl: './ai-settings.component.html',
  styleUrl: './ai-settings.component.scss'
})
export class AiSettingsComponent implements OnInit, OnDestroy {
  private startupPollHandle: ReturnType<typeof setTimeout> | null = null;
  private lastStartupFingerprint: string | null = null;
  private aiSearchStartupPollHandle: ReturnType<typeof setTimeout> | null = null;
  private lastAiSearchStartupFingerprint: string | null = null;

  private appSettingsService = inject(AppSettingsService);
  private messageService = inject(MessageService);
  private libraryService = inject(LibraryService);
  private bookService = inject(BookService);
  private aiPanelScanProgressService = inject(AiPanelScanProgressService);
  private aiSearchScanProgressService = inject(AiSearchScanProgressService);
  private dialogLauncherService = inject(DialogLauncherService);
  private destroy$ = new Subject<void>();

  appSettings$ = this.appSettingsService.appSettings$;

  aiEnabled = false;
  aiSearchEnabled = false;
  saveRunning = false;
  statusLoading = false;
  cleanupRunning = false;
  showDeleteConfirm = false;
  preScanRunning = false;
  reloadRunning = false;
  startupExpanded = false;

  status: AiServiceStatus | null = null;
  aiSearchStatus: AiServiceStatus | null = null;
  aiSearchStatusLoading = false;
  aiSearchReloadRunning = false;
  aiSearchStartupExpanded = false;
  aiSearchStartupEvents: AiStartupEvent[] = [];
  aiSearchLastStatusCheckedAt: string | null = null;
  selectedLibraryPathIds: number[] = [];
  selectedLibraryFilterIds: number[] = [];
  batchProgress: AiPanelScanProgressPayload | null = null;
  aiSearchPreScanRunning = false;
  aiSearchBatchProgress: AiSearchProgressPayload | null = null;
  panelFlowStats: AiPanelFlowStats | null = null;
  startupEvents: AiStartupEvent[] = [];
  lastStatusCheckedAt: string | null = null;

  ngOnInit(): void {
    this.appSettings$.pipe(
      filter((settings): settings is AppSettings => !!settings),
      take(1)
    ).subscribe(settings => {
      this.aiEnabled = settings.aiPanelDetectionEnabled ?? false;
      this.aiSearchEnabled = settings.aiSearchEnabled ?? false;
      this.refreshStatus();
      this.refreshPanelFlowStats();
      if (this.aiSearchEnabled) {
        this.refreshAiSearchStatus();
      }
    });

    this.libraryService.libraryState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        const validPathIds = new Set<number>();
        const validLibraryIds = new Set<number>();
        for (const library of state.libraries ?? []) {
          if (typeof library.id === 'number') {
            validLibraryIds.add(library.id);
          }
          for (const path of library.paths ?? []) {
            if (typeof path.id === 'number') {
              validPathIds.add(path.id);
            }
          }
        }

        const stored = this.loadPersistedPathIds();
        if (stored !== null) {
          this.selectedLibraryPathIds = stored.filter(id => validPathIds.has(id));
        } else if (!this.selectedLibraryPathIds.length) {
          this.selectedLibraryPathIds = Array.from(validPathIds);
        } else {
          this.selectedLibraryPathIds = this.selectedLibraryPathIds.filter(id => validPathIds.has(id));
        }

        const storedLibraryFilter = this.loadPersistedLibraryFilterIds();
        if (storedLibraryFilter !== null) {
          this.selectedLibraryFilterIds = storedLibraryFilter.filter(id => validLibraryIds.has(id));
        }
      });

    this.aiPanelScanProgressService.batchProgress$()
      .pipe(takeUntil(this.destroy$))
      .subscribe(progress => {
        this.batchProgress = progress;
        this.preScanRunning = !['COMPLETED', 'FAILED', 'STOPPED'].includes(progress.event);
        if (progress.event === 'COMPLETED') {
          this.refreshPanelFlowStats();
        }
      });

    this.aiSearchScanProgressService.batchProgress$()
      .pipe(takeUntil(this.destroy$))
      .subscribe(progress => {
        this.aiSearchBatchProgress = progress;
        this.aiSearchPreScanRunning = !['COMPLETED', 'FAILED', 'STOPPED'].includes(progress.event);
      });
  }

  ngOnDestroy(): void {
    this.clearStartupPolling();
    this.clearAiSearchStartupPolling();
    this.destroy$.next();
    this.destroy$.complete();
  }

  openDirectoryDialog(): void {
    const liveSelection$ = new Subject<number[]>();
    const liveSelectionSub = liveSelection$.pipe(takeUntil(this.destroy$)).subscribe(pathIds => {
      this.selectedLibraryPathIds = pathIds;
      this.persistPathIds(pathIds);
    });

    const liveLibraryFilter$ = new Subject<number[]>();
    const liveLibraryFilterSub = liveLibraryFilter$.pipe(takeUntil(this.destroy$)).subscribe(libraryIds => {
      this.selectedLibraryFilterIds = libraryIds;
      this.persistLibraryFilterIds(libraryIds);
    });

    const ref = this.dialogLauncherService.openAiScanDirectoryDialog(
      this.selectedLibraryPathIds,
      this.selectedLibraryFilterIds,
      liveSelection$,
      liveLibraryFilter$
    );
    if (!ref) {
      liveSelectionSub.unsubscribe();
      liveLibraryFilterSub.unsubscribe();
      return;
    }

    ref.onClose.pipe(take(1)).subscribe(() => {
      liveSelectionSub.unsubscribe();
      liveLibraryFilterSub.unsubscribe();
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
        this.applyStatus(status, false);
        this.statusLoading = false;
      },
      error: err => {
        this.statusLoading = false;
        this.applyStatus({
          enabled: this.aiEnabled,
          serviceReachable: false,
          status: 'ERROR',
          message: 'Failed to fetch AI service status.',
          error: err?.message ?? 'Unknown error',
          baseUrl: '',
          modelExists: null,
          modelPath: null
        }, false);
      }
    });
  }

  confirmCleanupAiData(): void {
    this.showDeleteConfirm = false;
    this.cleanupAiData();
  }

  cleanupAiData(): void {
    this.cleanupRunning = true;
    this.appSettingsService.cleanupAiPanelData().subscribe({
      next: result => {
        this.cleanupRunning = false;
        this.refreshPanelFlowStats();
        this.bookService.clearAiPanelDataFromState();
        this.showMessage('success', 'Cleanup completed', `Deleted ${result.deletedCount} saved AI panel-flow records.`);
      },
      error: () => {
        this.cleanupRunning = false;
        this.showMessage('error', 'Cleanup failed', 'Could not delete saved AI panel-flow records.');
      }
    });
  }

  reloadAiService(): void {
    this.reloadRunning = true;
    this.appSettingsService.reloadAiService().subscribe({
      next: result => {
        this.reloadRunning = false;
        if (result.triggered) {
          this.showMessage('success', 'Reload triggered', 'Model load has started. Status will update shortly.');
          setTimeout(() => this.refreshStatus(), 1500);
        } else {
          this.showMessage('info', 'Reload not started', result.reason);
        }
      },
      error: () => {
        this.reloadRunning = false;
        this.showMessage('error', 'Reload failed', 'Could not contact the AI service.');
      }
    });
  }

  get isActivelyScanning(): boolean {
    if (!this.batchProgress) return false;
    const event = this.batchProgress.event;
    return event !== 'COMPLETED' && event !== 'FAILED' && event !== 'STOPPED';
  }

  stopAiScan(): void {
    this.appSettingsService.stopAiScan().subscribe();
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

  get isAiSearchActivelyScanning(): boolean {
    if (!this.aiSearchBatchProgress) return false;
    const event = this.aiSearchBatchProgress.event;
    return event !== 'COMPLETED' && event !== 'FAILED' && event !== 'STOPPED';
  }

  stopAiSearchScan(): void {
    this.appSettingsService.stopAiSearchScan().subscribe();
  }

  preScanMissingAiSearch(): void {
    if (!this.aiSearchEnabled || !this.selectedLibraryPathIds.length || this.aiSearchPreScanRunning) {
      return;
    }

    this.aiSearchPreScanRunning = true;
    this.appSettingsService.scanMissingAiSearchData(this.selectedLibraryPathIds).subscribe({
      next: result => {
        this.aiSearchPreScanRunning = result.status === 'STARTED';
        this.showMessage(
          result.status === 'STARTED' ? 'success' : 'info',
          result.status === 'STARTED' ? 'AI Search scan started' : 'Scan status',
          'Batch scan ' + result.status
        );
      },
      error: () => {
        this.aiSearchPreScanRunning = false;
        this.showMessage('error', 'Scan failed', 'Could not start AI Search scanning.');
      }
    });
  }

  get aiSearchBatchProgressText(): string {
    return this.aiSearchBatchProgress ? this.aiSearchScanProgressService.buildStatusText(this.aiSearchBatchProgress) : '';
  }

  get aiSearchBatchProgressTone(): 'ok' | 'warning' | 'error' {
    if (!this.aiSearchBatchProgress) {
      return 'warning';
    }

    if (this.aiSearchBatchProgress.event === 'FAILED') {
      return 'error';
    }

    if (this.aiSearchBatchProgress.event === 'COMPLETED') {
      return 'ok';
    }

    return 'warning';
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

  get statusTone(): 'ok' | 'warning' | 'error' {
    switch (this.status?.status) {
      case 'READY':
        return 'ok';
      case 'STARTING':
        return 'warning';
      default:
        return 'error';
    }
  }

  get showStartupActivity(): boolean {
    return this.isDockerEndpoint && this.aiEnabled;
  }

  get isDockerEndpoint(): boolean {
    const baseUrl = this.status?.baseUrl?.trim();
    if (!baseUrl) {
      return false;
    }

    try {
      const {host} = new URL(baseUrl);
      return host.startsWith('booklore-ai-panel') || host.startsWith('ai-panel');
    } catch {
      return false;
    }
  }

  get startupPanelTone(): 'ok' | 'warning' | 'error' {
    if (this.status?.status === 'READY') {
      return 'ok';
    }
    if (this.status?.status === 'STARTING') {
      return 'warning';
    }
    return 'error';
  }

  get batchProgressText(): string {
    return this.batchProgress ? this.aiPanelScanProgressService.buildStatusText(this.batchProgress) : '';
  }

  get batchProgressTone(): 'ok' | 'warning' | 'error' {
    if (!this.batchProgress) {
      return 'warning';
    }

    if (this.batchProgress.event === 'FAILED') {
      return 'error';
    }

    if (this.batchProgress.event === 'COMPLETED') {
      return 'ok';
    }

    return 'warning';
  }

  get batchProgressStateLabel(): string {
    if (!this.batchProgress) {
      return '';
    }

    if (this.batchProgress.event === 'FAILED') {
      return 'Failed';
    }

    if (this.batchProgress.event === 'COMPLETED') {
      return 'Completed';
    }

    return 'Scanning';
  }

  get panelFlowStorageLabel(): string {
    return this.formatBytes(this.panelFlowStats?.storedBytes ?? 0);
  }

  private loadPersistedPathIds(): number[] | null {
    try {
      const raw = localStorage.getItem(LS_KEY_AI_SCAN_PATH_IDS);
      if (raw === null) return null;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((v: unknown) => typeof v === 'number')) {
        return parsed as number[];
      }
      return null;
    } catch {
      return null;
    }
  }

  private persistPathIds(pathIds: number[]): void {
    try {
      localStorage.setItem(LS_KEY_AI_SCAN_PATH_IDS, JSON.stringify(pathIds));
    } catch {
      // localStorage may be unavailable (e.g. private browsing), silently ignore
    }
  }

  private loadPersistedLibraryFilterIds(): number[] | null {
    try {
      const raw = localStorage.getItem(LS_KEY_AI_SCAN_LIBRARY_FILTER_IDS);
      if (raw === null) return null;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((v: unknown) => typeof v === 'number')) {
        return parsed as number[];
      }
      return null;
    } catch {
      return null;
    }
  }

  private persistLibraryFilterIds(libraryIds: number[]): void {
    try {
      localStorage.setItem(LS_KEY_AI_SCAN_LIBRARY_FILTER_IDS, JSON.stringify(libraryIds));
    } catch {
      // localStorage may be unavailable (e.g. private browsing), silently ignore
    }
  }

  private applyStatus(status: AiServiceStatus, fromPolling: boolean): void {
    this.status = status;
    this.lastStatusCheckedAt = this.formatTimestamp(new Date());
    this.recordStartupEvent(status, fromPolling);

    if (status.status === 'STARTING') {
      this.scheduleStartupPolling();
      return;
    }

    this.clearStartupPolling();
  }

  private scheduleStartupPolling(): void {
    if (this.startupPollHandle) {
      return;
    }

    this.startupPollHandle = setTimeout(() => {
      this.startupPollHandle = null;
      this.appSettingsService.getAiServiceStatus().subscribe({
        next: status => this.applyStatus(status, true),
        error: err => {
          this.applyStatus({
            enabled: this.aiEnabled,
            serviceReachable: false,
            status: 'ERROR',
            message: 'Failed to refresh AI startup status.',
            error: err?.message ?? 'Unknown error',
            baseUrl: this.status?.baseUrl ?? '',
            modelExists: null,
            modelPath: null
          }, true);
        }
      });
    }, 5000);
  }

  private clearStartupPolling(): void {
    if (!this.startupPollHandle) {
      return;
    }

    clearTimeout(this.startupPollHandle);
    this.startupPollHandle = null;
  }

  private recordStartupEvent(status: AiServiceStatus, fromPolling: boolean): void {
    if (!this.isDockerEndpoint && !status.baseUrl) {
      return;
    }

    const detailParts = [
      `state=${status.status}`,
      `reachable=${status.serviceReachable}`,
      `modelExists=${status.modelExists ?? 'unknown'}`,
      `modelPath=${status.modelPath ?? 'n/a'}`,
      `message=${status.message}`,
      `error=${status.error ?? 'none'}`
    ];
    const fingerprint = detailParts.join('|');

    if (fromPolling && fingerprint === this.lastStartupFingerprint) {
      return;
    }

    this.lastStartupFingerprint = fingerprint;
    const prefix = fromPolling ? 'Auto-check' : 'Manual check';
    const textParts = [`${prefix}: ${status.message}`];

    if (status.modelPath) {
      textParts.push(`model path ${status.modelPath}`);
    }

    if (status.modelExists === false) {
      textParts.push('local model file not present yet');
    } else if (status.modelExists === true) {
      textParts.push('local model file detected');
    }

    if (status.error) {
      textParts.push(`error ${status.error}`);
    }

    const level: AiStartupEvent['level'] = status.status === 'READY'
      ? 'success'
      : status.status === 'STARTING'
        ? 'warning'
        : status.status === 'ERROR' || status.status === 'UNAVAILABLE'
          ? 'error'
          : 'info';

    this.startupEvents = [
      {
        timestamp: this.formatTimestamp(new Date()),
        level,
        text: textParts.join(' · ')
      },
      ...this.startupEvents
    ].slice(0, 12);
  }

  private formatTimestamp(date: Date): string {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  private refreshPanelFlowStats(): void {
    this.appSettingsService.getAiPanelFlowStats().subscribe({
      next: stats => {
        this.panelFlowStats = stats;
      },
      error: () => {
        this.panelFlowStats = null;
      }
    });
  }

  onToggleAiSearchEnabled(checked: boolean): void {
    const previousValue = this.aiSearchEnabled;
    this.aiSearchEnabled = checked;
    this.saveRunning = true;

    this.appSettingsService
      .saveSettings([{key: AppSettingKey.AI_SEARCH_ENABLED, newValue: checked}])
      .subscribe({
        next: () => {
          this.saveRunning = false;
          this.showMessage('success', 'AI Search settings updated', checked ? 'AI semantic search is enabled.' : 'AI semantic search is disabled.');
          if (checked) {
            this.refreshAiSearchStatus();
          } else {
            this.refreshAiSearchStatus();
          }
        },
        error: () => {
          this.saveRunning = false;
          this.aiSearchEnabled = previousValue;
          this.showMessage('error', 'Save failed', 'Could not update AI search setting.');
        }
      });
  }

  refreshAiSearchStatus(): void {
    this.aiSearchStatusLoading = true;
    this.appSettingsService.getAiSearchServiceStatus().subscribe({
      next: status => {
        this.applyAiSearchStatus(status, false);
        this.aiSearchStatusLoading = false;
      },
      error: err => {
        this.aiSearchStatusLoading = false;
        this.applyAiSearchStatus({
          enabled: this.aiSearchEnabled,
          serviceReachable: false,
          status: 'ERROR',
          message: 'Failed to fetch AI Search service status.',
          error: err?.message ?? 'Unknown error',
          baseUrl: '',
          modelExists: null,
          modelPath: null
        }, false);
      }
    });
  }

  reloadAiSearchService(): void {
    this.aiSearchReloadRunning = true;
    this.appSettingsService.reloadAiSearchService().subscribe({
      next: result => {
        this.aiSearchReloadRunning = false;
        if (result.triggered) {
          this.showMessage('success', 'AI Search reload triggered', 'Model load has started. Status will update shortly.');
          setTimeout(() => this.refreshAiSearchStatus(), 1500);
        } else {
          this.showMessage('info', 'AI Search reload not started', result.reason);
        }
      },
      error: () => {
        this.aiSearchReloadRunning = false;
        this.showMessage('error', 'AI Search reload failed', 'Could not contact the AI Search service.');
      }
    });
  }

  get aiSearchStatusEndpointLabel(): string {
    const baseUrl = this.aiSearchStatus?.baseUrl?.trim();
    if (!baseUrl) {
      return '';
    }

    try {
      const {host} = new URL(baseUrl);
      if (host.startsWith('fable-ai-search') || host.startsWith('ai-search')) {
        return 'Docker AI Search service';
      }
      return baseUrl;
    } catch {
      return baseUrl;
    }
  }

  get showAiSearchDockerHint(): boolean {
    const baseUrl = this.aiSearchStatus?.baseUrl?.trim();
    if (!baseUrl || this.aiSearchStatus?.serviceReachable) {
      return false;
    }

    try {
      const {host} = new URL(baseUrl);
      return host.startsWith('fable-ai-search') || host.startsWith('ai-search');
    } catch {
      return false;
    }
  }

  get aiSearchStatusTone(): 'ok' | 'warning' | 'error' {
    switch (this.aiSearchStatus?.status) {
      case 'READY':
        return 'ok';
      case 'STARTING':
        return 'warning';
      default:
        return 'error';
    }
  }

  get showAiSearchStartupActivity(): boolean {
    return this.isAiSearchDockerEndpoint && this.aiSearchEnabled;
  }

  get isAiSearchDockerEndpoint(): boolean {
    const baseUrl = this.aiSearchStatus?.baseUrl?.trim();
    if (!baseUrl) {
      return false;
    }

    try {
      const {host} = new URL(baseUrl);
      return host.startsWith('fable-ai-search') || host.startsWith('ai-search');
    } catch {
      return false;
    }
  }

  get aiSearchStartupPanelTone(): 'ok' | 'warning' | 'error' {
    if (this.aiSearchStatus?.status === 'READY') {
      return 'ok';
    }
    if (this.aiSearchStatus?.status === 'STARTING') {
      return 'warning';
    }
    return 'error';
  }

  private applyAiSearchStatus(status: AiServiceStatus, fromPolling: boolean): void {
    this.aiSearchStatus = status;
    this.aiSearchLastStatusCheckedAt = this.formatTimestamp(new Date());
    this.recordAiSearchStartupEvent(status, fromPolling);

    if (status.status === 'STARTING') {
      this.scheduleAiSearchStartupPolling();
      return;
    }

    this.clearAiSearchStartupPolling();
  }

  private scheduleAiSearchStartupPolling(): void {
    if (this.aiSearchStartupPollHandle) {
      return;
    }

    this.aiSearchStartupPollHandle = setTimeout(() => {
      this.aiSearchStartupPollHandle = null;
      this.appSettingsService.getAiSearchServiceStatus().subscribe({
        next: status => this.applyAiSearchStatus(status, true),
        error: err => {
          this.applyAiSearchStatus({
            enabled: this.aiSearchEnabled,
            serviceReachable: false,
            status: 'ERROR',
            message: 'Failed to refresh AI Search startup status.',
            error: err?.message ?? 'Unknown error',
            baseUrl: this.aiSearchStatus?.baseUrl ?? '',
            modelExists: null,
            modelPath: null
          }, true);
        }
      });
    }, 5000);
  }

  private clearAiSearchStartupPolling(): void {
    if (!this.aiSearchStartupPollHandle) {
      return;
    }

    clearTimeout(this.aiSearchStartupPollHandle);
    this.aiSearchStartupPollHandle = null;
  }

  private recordAiSearchStartupEvent(status: AiServiceStatus, fromPolling: boolean): void {
    if (!this.isAiSearchDockerEndpoint && !status.baseUrl) {
      return;
    }

    const detailParts = [
      `state=${status.status}`,
      `reachable=${status.serviceReachable}`,
      `modelExists=${status.modelExists ?? 'unknown'}`,
      `modelPath=${status.modelPath ?? 'n/a'}`,
      `message=${status.message}`,
      `error=${status.error ?? 'none'}`
    ];
    const fingerprint = detailParts.join('|');

    if (fromPolling && fingerprint === this.lastAiSearchStartupFingerprint) {
      return;
    }

    this.lastAiSearchStartupFingerprint = fingerprint;
    const prefix = fromPolling ? 'Auto-check' : 'Manual check';
    const textParts = [`${prefix}: ${status.message}`];

    if (status.modelPath) {
      textParts.push(`model path ${status.modelPath}`);
    }

    if (status.modelExists === false) {
      textParts.push('local model file not present yet');
    } else if (status.modelExists === true) {
      textParts.push('local model file detected');
    }

    if (status.error) {
      textParts.push(`error ${status.error}`);
    }

    const level: AiStartupEvent['level'] = status.status === 'READY'
      ? 'success'
      : status.status === 'STARTING'
        ? 'warning'
        : status.status === 'ERROR' || status.status === 'UNAVAILABLE'
          ? 'error'
          : 'info';

    this.aiSearchStartupEvents = [
      {
        timestamp: this.formatTimestamp(new Date()),
        level,
        text: textParts.join(' · ')
      },
      ...this.aiSearchStartupEvents
    ].slice(0, 12);
  }

  private formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
    return `${value.toFixed(digits)} ${units[unitIndex]}`;
  }

  private showMessage(severity: 'success' | 'error' | 'info', summary: string, detail: string): void {
    this.messageService.add({severity, summary, detail});
  }
}
