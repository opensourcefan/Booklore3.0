import {Component, inject, OnDestroy, OnInit} from '@angular/core';
import {NgClass} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {Dialog} from 'primeng/dialog';
import {ToggleSwitch} from 'primeng/toggleswitch';
import {MessageService} from 'primeng/api';
import {TranslocoDirective} from '@jsverse/transloco';
import {Select} from 'primeng/select';
import {MultiSelect} from 'primeng/multiselect';
import {TooltipModule} from 'primeng/tooltip';
import {Subject, Subscription, timer} from 'rxjs';
import {filter, take, takeUntil} from 'rxjs/operators';

import {AiModel, AiPanelFlowStats, AiServiceStatus, AppSettingKey, AppSettings, AiSearchSettings} from '../../../shared/model/app-settings.model';
import {AiPanelScanProgressPayload} from '../../../shared/model/ai-panel-scan-progress.model';
import {AppSettingsService} from '../../../shared/service/app-settings.service';
import {AiPanelScanProgressService} from '../../../shared/service/ai-panel-scan-progress.service';
import {AiSearchProgressPayload, AiSearchScanProgressService} from '../../../shared/service/ai-search-scan-progress.service';
import {LibraryService} from '../../book/service/library.service';
import {BookService} from '../../book/service/book.service';
import {DialogLauncherService} from '../../../shared/services/dialog-launcher.service';

const LS_KEY_AI_SCAN_PATH_IDS = 'fable.aiScanSelectedPathIds';
const LS_KEY_AI_SCAN_LIBRARY_FILTER_IDS = 'fable.aiScanLibraryFilterIds';

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
    TranslocoDirective,
    Select,
    MultiSelect,
    TooltipModule
  ],
  templateUrl: './ai-settings.component.html',
  styleUrl: './ai-settings.component.scss'
})
export class AiSettingsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private startupPollSubscription?: Subscription;
  private lastStartupFingerprint: string | null = null;
  private aiSearchStartupPollSubscription?: Subscription;
  private lastAiSearchStartupFingerprint: string | null = null;

  private appSettingsService = inject(AppSettingsService);
  private messageService = inject(MessageService);
  private libraryService = inject(LibraryService);
  private bookService = inject(BookService);
  private aiPanelScanProgressService = inject(AiPanelScanProgressService);
  private aiSearchScanProgressService = inject(AiSearchScanProgressService);
  private dialogLauncherService = inject(DialogLauncherService);

  providerOptions = [
    { label: 'Local (In-container Ollama)', value: 'local' },
    { label: 'External Ollama', value: 'ollama' },
    { label: 'OpenAI Compatible (OpenAI, Groq, Together)', value: 'openai' }
  ];

  embeddingModelOptions = [
    { label: 'Minimal (all-MiniLM-L6-v2) - ~1.2GB RAM', value: 'all-MiniLM-L6-v2', isDefault: false },
    { label: 'Standard (BAAI/bge-small-en-v1.5) - ~3.5GB RAM', value: 'BAAI/bge-small-en-v1.5', isDefault: false },
    { label: 'Enhanced (BAAI/bge-base-en-v1.5) - ~5.5GB RAM (System Default)', value: 'BAAI/bge-base-en-v1.5', isDefault: true },
    { label: 'Premium (BAAI/bge-large-en-v1.5) - ~7.0GB RAM', value: 'BAAI/bge-large-en-v1.5', isDefault: false },
    { label: 'Custom (type your own model ID)', value: '__custom__', isDefault: false }
  ];

  llmModelOptions = [
    { label: 'Minimal (smollm2:360m) - Lightweight quick answers (System Default)', value: 'smollm2:360m', isDefault: true },
    { label: 'Standard (qwen2.5:1.5b) - Smart conversational answers', value: 'qwen2.5:1.5b', isDefault: false },
    { label: 'Enhanced (llama3.2) - Detailed and smart', value: 'llama3.2', isDefault: false },
    { label: 'Premium (phi3:mini) - Deep expert-level answers', value: 'phi3:mini', isDefault: false },
    { label: 'Custom (type your own model name)', value: '__custom__', isDefault: false }
  ];

  matryoshkaOptions = [
    { label: 'Disabled (Keep Original Model Dimension)', value: 0 },
    { label: '128 Dimensions (Fastest inference, lowest memory)', value: 128 },
    { label: '256 Dimensions (Recommended for nomic-embed-text)', value: 256 },
    { label: '512 Dimensions (Balanced accuracy and memory)', value: 512 }
  ];

  rerankerModelOptions = [
    { label: 'Standard (BAAI/bge-reranker-base) - Accurate cross-encoder', value: 'BAAI/bge-reranker-base' },
    { label: 'Minimal (cross-encoder/ms-marco-MiniLM-L-6-v2) - Lightweight and fast', value: 'cross-encoder/ms-marco-MiniLM-L-6-v2' }
  ];

  appSettings$ = this.appSettingsService.appSettings$;

  aiEnabled = false;
  aiSearchEnabled = false;
  aiSearchSettings: AiSearchSettings = {
    embeddingProvider: 'local',
    embeddingApiKey: '',
    externalEmbeddingUrl: '',
    embeddingModel: '',
    llmProvider: 'local',
    llmApiKey: '',
    externalLlmUrl: '',
    llmModel: '',
    topK: 5,
    similarityThreshold: 0.3,
    maxTokens: 768,
    temperature: 0.1,
    autoEmbedLibraryIds: [],
    chunkSize: 1500,
    chunkOverlap: 100,
    matryoshkaDimensions: 0,
    hybridSearchEnabled: false,
    rrfK: 60,
    rerankingEnabled: false,
    rerankerModel: 'BAAI/bge-reranker-base',
    ocrEnabled: true,
    ocrFallbackOnly: true,
    ocrLanguage: 'eng'
  };
  originalAiSearchSettings: string = '';
  originalEmbeddingSettings: string = '';
  originalLlmSettings: string = '';

  advancedChunkSize = 1500;
  advancedChunkOverlap = 100;
  advancedMatryoshkaDimensions = 0;
  advancedHybridSearchEnabled = false;
  advancedRrfK = 60;
  advancedRerankingEnabled = false;
  advancedRerankerModel = 'BAAI/bge-reranker-base';

  originalAdvancedSettings: string = '';
  advancedEmbeddingExpanded = false;
  showAdvancedConfirm = false;
  aiPanelSettings = {
    modelId: ''
  };
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
  embeddingStats: {model: string, count: number}[] = [];
  embeddingStatsLoading = false;
  libraryOptions: {label: string, value: number}[] = [];

  embeddingModels: AiModel[] = [];
  llmModels: AiModel[] = [];
  loadingEmbeddingModels = false;
  loadingLlmModels = false;

  ngOnInit(): void {
    this.appSettings$.pipe(
      filter((settings): settings is AppSettings => !!settings),
      take(1)
    ).subscribe(settings => {
      this.aiEnabled = settings.aiPanelDetectionEnabled ?? false;
      this.aiSearchEnabled = settings.aiSearchEnabled ?? false;
      if (settings.aiSearchSettings) {
        this.aiSearchSettings = {
          ...settings.aiSearchSettings,
          embeddingProvider: settings.aiSearchSettings.embeddingProvider || 'local',
          embeddingModel: settings.aiSearchSettings.embeddingModel || 'BAAI/bge-base-en-v1.5',
          llmProvider: settings.aiSearchSettings.llmProvider || 'local',
          llmModel: settings.aiSearchSettings.llmModel || 'smollm2:360m',
          topK: settings.aiSearchSettings.topK || 5,
          similarityThreshold: settings.aiSearchSettings.similarityThreshold !== undefined && settings.aiSearchSettings.similarityThreshold !== null ? settings.aiSearchSettings.similarityThreshold : 0.3,
          maxTokens: settings.aiSearchSettings.maxTokens || 768,
          temperature: settings.aiSearchSettings.temperature !== undefined && settings.aiSearchSettings.temperature !== null ? settings.aiSearchSettings.temperature : 0.1,
          autoEmbedLibraryIds: settings.aiSearchSettings.autoEmbedLibraryIds || [],
          chunkSize: settings.aiSearchSettings.chunkSize || 1500,
          chunkOverlap: settings.aiSearchSettings.chunkOverlap !== undefined && settings.aiSearchSettings.chunkOverlap !== null ? settings.aiSearchSettings.chunkOverlap : 100,
          matryoshkaDimensions: settings.aiSearchSettings.matryoshkaDimensions ?? 0,
          hybridSearchEnabled: settings.aiSearchSettings.hybridSearchEnabled ?? false,
          rrfK: settings.aiSearchSettings.rrfK || 60,
          rerankingEnabled: settings.aiSearchSettings.rerankingEnabled ?? false,
          rerankerModel: settings.aiSearchSettings.rerankerModel || 'BAAI/bge-reranker-base',
          ocrEnabled: settings.aiSearchSettings.ocrEnabled ?? true,
          ocrFallbackOnly: settings.aiSearchSettings.ocrFallbackOnly ?? true,
          ocrLanguage: settings.aiSearchSettings.ocrLanguage || 'eng'
        };
        this.originalAiSearchSettings = JSON.stringify(this.aiSearchSettings);
        this.snapshotEmbeddingSettings();
        this.snapshotLlmSettings();
        this.initializeAdvancedSettingsFromSaved();
      }
      if (settings.aiPanelSettings) {
        this.aiPanelSettings = { ...this.aiPanelSettings, ...settings.aiPanelSettings };
      }
      this.refreshStatus();
      this.refreshPanelFlowStats();
      if (this.aiSearchEnabled) {
        this.refreshAiSearchStatus();
        this.fetchEmbeddingStats();
        this.loadAiModels();
      }
    });

    this.libraryService.libraryState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        const validPathIds = new Set<number>();
        const validLibraryIds = new Set<number>();
        const libs: {label: string, value: number}[] = [];
        for (const library of state.libraries ?? []) {
          if (typeof library.id === 'number') {
            validLibraryIds.add(library.id);
            libs.push({label: library.name, value: library.id});
          }
          for (const path of library.paths ?? []) {
            if (typeof path.id === 'number') {
              validPathIds.add(path.id);
            }
          }
        }
        this.libraryOptions = libs;

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

  saveAiPanelSettings(): void {
    this.saveRunning = true;
    this.appSettingsService
      .saveSettings([{key: AppSettingKey.AI_PANEL_SETTINGS, newValue: this.aiPanelSettings}])
      .subscribe({
        next: () => {
          this.saveRunning = false;
          this.showMessage('success', 'AI Panel settings updated', 'Model ID has been saved.');
          this.refreshStatus();
        },
        error: () => {
          this.saveRunning = false;
          this.showMessage('error', 'Save failed', 'Could not update AI panel settings.');
        }
      });
  }

  selectEmbeddingModel(model: AiModel): void {
    this.aiSearchSettings.embeddingProvider = 'local';
    this.aiSearchSettings.embeddingModel = model.id;
  }

  selectLlmModel(model: AiModel): void {
    this.aiSearchSettings.llmProvider = 'local';
    this.aiSearchSettings.llmModel = model.id;
  }

  loadAiModels(): void {
    if (this.aiSearchEnabled) {
      this.loadingEmbeddingModels = true;
      this.appSettingsService.getAiEmbeddingModels().pipe(take(1)).subscribe({
        next: (res) => {
          this.embeddingModels = res.models || [];
          this.loadingEmbeddingModels = false;
        },
        error: () => {
          this.loadingEmbeddingModels = false;
        }
      });

      this.loadingLlmModels = true;
      this.appSettingsService.getAiLlmModels().pipe(take(1)).subscribe({
        next: (res) => {
          this.llmModels = res.models || [];
          this.loadingLlmModels = false;
        },
        error: () => {
          this.loadingLlmModels = false;
        }
      });
    }
  }

  deleteEmbeddingModel(model: AiModel): void {
    const parts = model.id.split('/');
    if (parts.length < 2) return;
    const namespace = parts[0];
    const name = parts.slice(1).join('/');
    this.appSettingsService.deleteAiEmbeddingModel(namespace, name).pipe(take(1)).subscribe({
      next: () => {
        this.messageService.add({severity: 'success', summary: 'Deleted', detail: `Deleted ${model.name}`});
        this.loadAiModels();
      },
      error: () => this.messageService.add({severity: 'error', summary: 'Error', detail: `Failed to delete ${model.name}`})
    });
  }

  deleteLlmModel(model: AiModel): void {
    this.appSettingsService.deleteAiLlmModel(model.id).pipe(take(1)).subscribe({
      next: () => {
        this.messageService.add({severity: 'success', summary: 'Deleted', detail: `Deleted ${model.name}`});
        this.loadAiModels();
      },
      error: () => this.messageService.add({severity: 'error', summary: 'Error', detail: `Failed to delete ${model.name}`})
    });
  }

  fetchEmbeddingStats(): void {
    this.embeddingStatsLoading = true;
    this.appSettingsService.getAiSearchEmbeddingStats().subscribe({
      next: (stats) => {
        this.embeddingStats = stats;
        this.embeddingStatsLoading = false;
      },
      error: () => {
        this.embeddingStatsLoading = false;
        this.showMessage('error', 'Failed to load', 'Could not load embedding statistics.');
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

  scanMissingAiSearch(): void {
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
      if (host.startsWith('app-ai-panel') || host.startsWith('fable-ai-panel') || host.startsWith('ai-panel')) {
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
      return host.startsWith('app-ai-panel') || host.startsWith('fable-ai-panel') || host.startsWith('ai-panel');
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
      return host.startsWith('app-ai-panel') || host.startsWith('fable-ai-panel') || host.startsWith('ai-panel');
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
    if (this.startupPollSubscription && !this.startupPollSubscription.closed) {
      return;
    }

    this.startupPollSubscription = timer(5000).subscribe(() => {
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
    });
  }

  private clearStartupPolling(): void {
    if (this.startupPollSubscription) {
      this.startupPollSubscription.unsubscribe();
      this.startupPollSubscription = undefined;
    }
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

  private snapshotEmbeddingSettings(): void {
    this.originalEmbeddingSettings = JSON.stringify({
      embeddingProvider: this.aiSearchSettings.embeddingProvider,
      embeddingModel: this.aiSearchSettings.embeddingModel,
      embeddingApiKey: this.aiSearchSettings.embeddingApiKey,
      externalEmbeddingUrl: this.aiSearchSettings.externalEmbeddingUrl
    });
  }

  private snapshotLlmSettings(): void {
    this.originalLlmSettings = JSON.stringify({
      llmProvider: this.aiSearchSettings.llmProvider,
      llmModel: this.aiSearchSettings.llmModel,
      llmApiKey: this.aiSearchSettings.llmApiKey,
      externalLlmUrl: this.aiSearchSettings.externalLlmUrl
    });
  }

  get isEmbeddingSettingsDirty(): boolean {
    const current = JSON.stringify({
      embeddingProvider: this.aiSearchSettings.embeddingProvider,
      embeddingModel: this.aiSearchSettings.embeddingModel,
      embeddingApiKey: this.aiSearchSettings.embeddingApiKey,
      externalEmbeddingUrl: this.aiSearchSettings.externalEmbeddingUrl
    });
    return current !== this.originalEmbeddingSettings;
  }

  get isLlmSettingsDirty(): boolean {
    const current = JSON.stringify({
      llmProvider: this.aiSearchSettings.llmProvider,
      llmModel: this.aiSearchSettings.llmModel,
      llmApiKey: this.aiSearchSettings.llmApiKey,
      externalLlmUrl: this.aiSearchSettings.externalLlmUrl
    });
    return current !== this.originalLlmSettings;
  }

  saveEmbeddingSettings(): void {
    this.saveRunning = true;
    this.appSettingsService
      .saveSettings([{key: AppSettingKey.AI_SEARCH_SETTINGS, newValue: this.aiSearchSettings}])
      .subscribe({
        next: () => {
          this.saveRunning = false;
          this.snapshotEmbeddingSettings();
          this.originalAiSearchSettings = JSON.stringify(this.aiSearchSettings);
          this.showMessage('success', 'Embedding settings saved', 'Embedding configuration has been updated.');
        },
        error: () => {
          this.saveRunning = false;
          this.showMessage('error', 'Save failed', 'Could not update embedding settings.');
        }
      });
  }

  saveLlmSettings(): void {
    this.saveRunning = true;
    this.appSettingsService
      .saveSettings([{key: AppSettingKey.AI_SEARCH_SETTINGS, newValue: this.aiSearchSettings}])
      .subscribe({
        next: () => {
          this.saveRunning = false;
          this.snapshotLlmSettings();
          this.originalAiSearchSettings = JSON.stringify(this.aiSearchSettings);
          this.showMessage('success', 'LLM settings saved', 'LLM configuration has been updated.');
        },
        error: () => {
          this.saveRunning = false;
          this.showMessage('error', 'Save failed', 'Could not update LLM settings.');
        }
      });
  }

  isAiSearchConfigValid(): boolean {
    if (this.aiSearchSettings.embeddingProvider !== 'local' && !this.aiSearchSettings.externalEmbeddingUrl?.trim()) {
      return false;
    }
    if (this.aiSearchSettings.llmProvider !== 'local' && !this.aiSearchSettings.externalLlmUrl?.trim()) {
      return false;
    }
    return true;
  }

  isAiSearchSettingsDirty(): boolean {
    return JSON.stringify(this.aiSearchSettings) !== this.originalAiSearchSettings;
  }

  saveAiSearchSettings(): void {
    // Normalize: '__custom__' means user hasn't typed a custom model yet
    if (this.aiSearchSettings.embeddingModel === '__custom__') {
      this.aiSearchSettings.embeddingModel = '';
    }
    if (this.aiSearchSettings.llmModel === '__custom__') {
      this.aiSearchSettings.llmModel = '';
    }
    this.saveRunning = true;
    this.appSettingsService
      .saveSettings([{key: AppSettingKey.AI_SEARCH_SETTINGS, newValue: this.aiSearchSettings}])
      .subscribe({
        next: () => {
          this.saveRunning = false;
          this.originalAiSearchSettings = JSON.stringify(this.aiSearchSettings);
          this.snapshotEmbeddingSettings();
          this.snapshotLlmSettings();
          this.showMessage('success', 'AI Search settings updated', 'Tuning parameters have been saved.');
        },
        error: () => {
          this.saveRunning = false;
          this.showMessage('error', 'Save failed', 'Could not update AI search tuning settings.');
        }
      });
  }

  initializeAdvancedSettingsFromSaved(): void {
    const rawSaved = this.aiSearchSettings;
    const isUninitialized = !rawSaved.chunkSize || rawSaved.chunkSize === 0;

    this.advancedChunkSize = rawSaved.chunkSize || 1500;
    this.advancedChunkOverlap = rawSaved.chunkOverlap !== undefined && rawSaved.chunkOverlap !== null && !isUninitialized ? rawSaved.chunkOverlap : 100;
    this.advancedMatryoshkaDimensions = rawSaved.matryoshkaDimensions ?? 0;
    this.advancedHybridSearchEnabled = rawSaved.hybridSearchEnabled ?? false;
    this.advancedRrfK = rawSaved.rrfK || 60;
    this.advancedRerankingEnabled = rawSaved.rerankingEnabled ?? false;
    this.advancedRerankerModel = rawSaved.rerankerModel || 'BAAI/bge-reranker-base';

    if (isUninitialized) {
      this.originalAdvancedSettings = '';
    } else {
      this.snapshotAdvancedEmbeddingSettings();
    }
  }

  private snapshotAdvancedEmbeddingSettings(): void {
    this.originalAdvancedSettings = JSON.stringify({
      chunkSize: this.advancedChunkSize,
      chunkOverlap: this.advancedChunkOverlap,
      matryoshkaDimensions: this.advancedMatryoshkaDimensions,
      hybridSearchEnabled: this.advancedHybridSearchEnabled,
      rrfK: this.advancedRrfK,
      rerankingEnabled: this.advancedRerankingEnabled,
      rerankerModel: this.advancedRerankerModel
    });
  }

  get isAdvancedEmbeddingSettingsDirty(): boolean {
    const current = JSON.stringify({
      chunkSize: this.advancedChunkSize,
      chunkOverlap: this.advancedChunkOverlap,
      matryoshkaDimensions: this.advancedMatryoshkaDimensions,
      hybridSearchEnabled: this.advancedHybridSearchEnabled,
      rrfK: this.advancedRrfK,
      rerankingEnabled: this.advancedRerankingEnabled,
      rerankerModel: this.advancedRerankerModel
    });
    return current !== this.originalAdvancedSettings;
  }

  resetAdvancedEmbeddingSettings(): void {
    this.initializeAdvancedSettingsFromSaved();
    this.showMessage('info', 'Settings Reset', 'Restored previously saved advanced tuning parameters.');
  }

  loadModelPresets(): void {
    const currentModel = (this.aiSearchSettings.embeddingModel || '').toLowerCase();
    if (currentModel.includes('nomic')) {
      this.advancedChunkSize = 3000;
      this.advancedChunkOverlap = 200;
      this.advancedMatryoshkaDimensions = 256;
      this.advancedHybridSearchEnabled = false;
      this.advancedRrfK = 60;
      this.advancedRerankingEnabled = false;
      this.advancedRerankerModel = 'BAAI/bge-reranker-base';
      this.showMessage('info', 'Nomic Presets Loaded', 'Applied recommended chunking and Matryoshka parameters for nomic-embed-text.');
    } else if (currentModel.includes('minilm') || currentModel.includes('all-minilm')) {
      this.advancedChunkSize = 1000;
      this.advancedChunkOverlap = 100;
      this.advancedMatryoshkaDimensions = 0;
      this.advancedHybridSearchEnabled = true;
      this.advancedRrfK = 60;
      this.advancedRerankingEnabled = true;
      this.advancedRerankerModel = 'BAAI/bge-reranker-base';
      this.showMessage('info', 'MiniLM Presets Loaded', 'Applied recommended chunking, hybrid search, and reranker settings for all-MiniLM-L6-v2.');
    } else if (currentModel.includes('bge-base')) {
      this.advancedChunkSize = 1000;
      this.advancedChunkOverlap = 100;
      this.advancedMatryoshkaDimensions = 0;
      this.advancedHybridSearchEnabled = true;
      this.advancedRrfK = 60;
      this.advancedRerankingEnabled = false;
      this.advancedRerankerModel = 'BAAI/bge-reranker-base';
      this.showMessage('info', 'BGE Presets Loaded', 'Applied recommended chunking and hybrid search settings for bge-base-en-v1.5.');
    } else {
      this.advancedChunkSize = 1500;
      this.advancedChunkOverlap = 100;
      this.advancedMatryoshkaDimensions = 0;
      this.advancedHybridSearchEnabled = false;
      this.advancedRrfK = 60;
      this.advancedRerankingEnabled = false;
      this.advancedRerankerModel = 'BAAI/bge-reranker-base';
      this.showMessage('info', 'Default Presets Loaded', 'Applied standard advanced settings defaults.');
    }
  }

  applyAdvancedEmbeddingSettings(): void {
    // Check if the change requires database invalidation/auto-heal (chunk size, overlap, or matryoshka dimensions changed)
    const requiresReindex = 
      this.advancedChunkSize !== (this.aiSearchSettings.chunkSize ?? 1500) ||
      this.advancedChunkOverlap !== (this.aiSearchSettings.chunkOverlap ?? 100) ||
      this.advancedMatryoshkaDimensions !== (this.aiSearchSettings.matryoshkaDimensions ?? 0);

    if (requiresReindex) {
      // Show confirmation dialog warning user of data invalidation
      this.showAdvancedConfirm = true;
    } else {
      // Just save directly as they only changed search-only settings (hybrid, reranking)
      this.confirmSaveAdvancedEmbeddingSettings();
    }
  }

  confirmSaveAdvancedEmbeddingSettings(): void {
    this.showAdvancedConfirm = false;
    this.saveRunning = true;

    // Apply values to aiSearchSettings DTO
    this.aiSearchSettings.chunkSize = this.advancedChunkSize;
    this.aiSearchSettings.chunkOverlap = this.advancedChunkOverlap;
    this.aiSearchSettings.matryoshkaDimensions = this.advancedMatryoshkaDimensions;
    this.aiSearchSettings.hybridSearchEnabled = this.advancedHybridSearchEnabled;
    this.aiSearchSettings.rrfK = this.advancedRrfK;
    this.aiSearchSettings.rerankingEnabled = this.advancedRerankingEnabled;
    this.aiSearchSettings.rerankerModel = this.advancedRerankerModel;

    this.appSettingsService
      .saveSettings([{key: AppSettingKey.AI_SEARCH_SETTINGS, newValue: this.aiSearchSettings}])
      .subscribe({
        next: () => {
          this.saveRunning = false;
          this.snapshotAdvancedEmbeddingSettings();
          this.originalAiSearchSettings = JSON.stringify(this.aiSearchSettings);
          this.showMessage('success', 'Advanced settings saved', 'Advanced tuning configuration has been updated.');
          this.fetchEmbeddingStats();
        },
        error: () => {
          this.saveRunning = false;
          this.showMessage('error', 'Save failed', 'Could not update advanced tuning settings.');
        }
      });
  }

  resetEmbeddingSettings(): void {
    this.appSettings$.pipe(take(1)).subscribe(settings => {
      if (settings && settings.aiSearchSettings) {
        this.aiSearchSettings.embeddingProvider = settings.aiSearchSettings.embeddingProvider ?? 'local';
        this.aiSearchSettings.embeddingModel = settings.aiSearchSettings.embeddingModel ?? '';
        this.aiSearchSettings.embeddingApiKey = settings.aiSearchSettings.embeddingApiKey ?? '';
        this.aiSearchSettings.externalEmbeddingUrl = settings.aiSearchSettings.externalEmbeddingUrl ?? '';
        this.showMessage('info', 'Settings Reset', 'Restored previously saved embedding configuration.');
      }
    });
  }

  resetLlmSettings(): void {
    this.appSettings$.pipe(take(1)).subscribe(settings => {
      if (settings && settings.aiSearchSettings) {
        this.aiSearchSettings.llmProvider = settings.aiSearchSettings.llmProvider ?? 'local';
        this.aiSearchSettings.llmModel = settings.aiSearchSettings.llmModel ?? '';
        this.aiSearchSettings.llmApiKey = settings.aiSearchSettings.llmApiKey ?? '';
        this.aiSearchSettings.externalLlmUrl = settings.aiSearchSettings.externalLlmUrl ?? '';
        this.showMessage('info', 'Settings Reset', 'Restored previously saved LLM configuration.');
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
    if (this.aiSearchStartupPollSubscription && !this.aiSearchStartupPollSubscription.closed) {
      return;
    }

    this.aiSearchStartupPollSubscription = timer(5000).subscribe(() => {
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
    });
  }

  private clearAiSearchStartupPolling(): void {
    if (this.aiSearchStartupPollSubscription) {
      this.aiSearchStartupPollSubscription.unsubscribe();
      this.aiSearchStartupPollSubscription = undefined;
    }
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

  // Test connection state
  testEmbeddingRunning = false;
  testLlmRunning = false;

  testEmbeddingConnection(): void {
    this.testEmbeddingRunning = true;
    const config = {
      provider: this.aiSearchSettings.embeddingProvider,
      url: this.aiSearchSettings.externalEmbeddingUrl,
      apiKey: this.aiSearchSettings.embeddingApiKey,
      model: this.aiSearchSettings.embeddingModel
    };
    this.appSettingsService.testAiEmbeddingConnection(config).subscribe({
      next: result => {
        this.testEmbeddingRunning = false;
        this.showMessage(result.success ? 'success' : 'error', 'Embedding Test', result.message);
      },
      error: () => {
        this.testEmbeddingRunning = false;
        this.showMessage('error', 'Embedding Test', 'Could not reach the backend to test embedding connection.');
      }
    });
  }

  testLlmConnection(): void {
    this.testLlmRunning = true;
    const config = {
      provider: this.aiSearchSettings.llmProvider,
      url: this.aiSearchSettings.externalLlmUrl,
      apiKey: this.aiSearchSettings.llmApiKey,
      model: this.aiSearchSettings.llmModel
    };
    this.appSettingsService.testAiLlmConnection(config).subscribe({
      next: result => {
        this.testLlmRunning = false;
        this.showMessage(result.success ? 'success' : 'error', 'LLM Test', result.message);
      },
      error: () => {
        this.testLlmRunning = false;
        this.showMessage('error', 'LLM Test', 'Could not reach the backend to test LLM connection.');
      }
    });
  }

  formatBytes(bytes: number): string {
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
