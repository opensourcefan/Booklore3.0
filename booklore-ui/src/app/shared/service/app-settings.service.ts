import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpParams} from '@angular/common/http';
import {BehaviorSubject, Observable, of} from 'rxjs';
import {catchError, finalize, map, shareReplay, switchMap, tap} from 'rxjs/operators';
import {API_CONFIG} from '../../core/config/api-config';
import {AiBulkScanResponse} from '../model/ai-panel-scan-progress.model';
import {AiPanelFlowStats, AiServiceStatus, AppSettings, OidcProviderDetails, OidcTestResult} from '../model/app-settings.model';

export interface SettingsTransferEntry {
  name: string;
  value: unknown;
}

export interface AppSettingsTransferFile {
  version: number;
  exportedAt: string;
  settings: SettingsTransferEntry[];
}

export interface PublicAppSettings {
  oidcEnabled: boolean;
  remoteAuthEnabled: boolean;
  aiPanelDetectionEnabled: boolean;
  oidcProviderDetails: OidcProviderDetails;
  oidcForceOnlyMode: boolean;
}

@Injectable({providedIn: 'root'})
export class AppSettingsService {
  private http = inject(HttpClient);

  private readonly apiUrl = `${API_CONFIG.BASE_URL}/api/v1/settings`;
  private readonly publicApiUrl = `${API_CONFIG.BASE_URL}/api/v1/public-settings`;

  private loading$: Observable<AppSettings> | null = null;
  private appSettingsSubject = new BehaviorSubject<AppSettings | null>(null);

  appSettings$ = this.appSettingsSubject.asObservable().pipe(
    tap(state => {
      if (!state && !this.loading$) {
        this.loading$ = this.fetchAppSettings().pipe(
          shareReplay(1),
          finalize(() => (this.loading$ = null))
        );
        this.loading$.subscribe();
      }
    })
  );

  private publicLoading$: Observable<PublicAppSettings> | null = null;
  private publicAppSettingsSubject = new BehaviorSubject<PublicAppSettings | null>(null);

  publicAppSettings$ = this.publicAppSettingsSubject.asObservable().pipe(
    tap(state => {
      if (!state && !this.publicLoading$) {
        this.publicLoading$ = this.fetchPublicSettings().pipe(
          shareReplay(1),
          finalize(() => (this.publicLoading$ = null))
        );
        this.publicLoading$.subscribe();
      }
    })
  );

  get currentPublicSettings(): PublicAppSettings | null {
    return this.publicAppSettingsSubject.value;
  }

  private fetchAppSettings(): Observable<AppSettings> {
    return this.http.get<AppSettings>(this.apiUrl).pipe(
      tap(settings => {
        this.appSettingsSubject.next(settings);
        this.syncPublicSettings(settings);
      }),
      catchError(err => {
        console.error('Error loading app settings:', err);
        this.appSettingsSubject.next(null);
        throw err;
      })
    );
  }

  private fetchPublicSettings(): Observable<PublicAppSettings> {
    return this.http.get<PublicAppSettings>(this.publicApiUrl).pipe(
      tap(settings => this.publicAppSettingsSubject.next(settings)),
      catchError(err => {
        console.error('Failed to fetch public settings', err);
        throw err;
      })
    );
  }

  testOidcConnection(providerDetails: OidcProviderDetails): Observable<OidcTestResult> {
    return this.http.post<OidcTestResult>(`${this.apiUrl}/oidc/test`, providerDetails);
  }

  getAiServiceStatus(): Observable<AiServiceStatus> {
    return this.http.get<AiServiceStatus>(`${API_CONFIG.BASE_URL}/api/v1/ai/status`);
  }

  getAiPanelFlowStats(libraryId?: number | null): Observable<AiPanelFlowStats> {
    const params = libraryId == null
      ? undefined
      : new HttpParams().set('libraryId', libraryId.toString());

    return this.http.get<AiPanelFlowStats>(`${API_CONFIG.BASE_URL}/api/v1/ai/panel-flow/stats`, {params});
  }

  cleanupAiPanelData(): Observable<{ deletedCount: number }> {
    return this.http.delete<{ deletedCount: number }>(`${API_CONFIG.BASE_URL}/api/v1/ai/panel-flow`);
  }

  scanMissingAiPanelData(libraryPathIds: number[]): Observable<AiBulkScanResponse> {
    return this.http.post<AiBulkScanResponse>(`${API_CONFIG.BASE_URL}/api/v1/ai/panel-flow/scan-missing`, {
      libraryPathIds
    });
  }

  stopAiScan(): Observable<void> {
    return this.http.post<void>(`${API_CONFIG.BASE_URL}/api/v1/ai/panel-flow/stop-scan`, {});
  }

  reloadAiService(): Observable<{triggered: boolean; reason: string}> {
    return this.http.post<{triggered: boolean; reason: string}>(`${API_CONFIG.BASE_URL}/api/v1/ai/reload`, {});
  }

  exportSettings(): Observable<string> {
    return this.http.get<AppSettingsTransferFile>(`${this.apiUrl}/export`).pipe(
      map(payload => {
        const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const safeTime = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `booklore-settings-${safeTime}.json`;

        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        return fileName;
      }),
      catchError(err => {
        console.error('Error exporting settings:', err);
        throw err;
      })
    );
  }

  importSettings(payload: AppSettingsTransferFile): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/import`, payload).pipe(
      switchMap(() => this.fetchAppSettings()),
      map(() => void 0),
      catchError(err => {
        console.error('Error importing settings:', err);
        throw err;
      })
    );
  }

  private syncPublicSettings(appSettings: AppSettings): void {
    const updatedPublicSettings: PublicAppSettings = {
      oidcEnabled: appSettings.oidcEnabled,
      remoteAuthEnabled: appSettings.remoteAuthEnabled,
      aiPanelDetectionEnabled: appSettings.aiPanelDetectionEnabled,
      oidcProviderDetails: appSettings.oidcProviderDetails,
      oidcForceOnlyMode: appSettings.oidcForceOnlyMode
    };
    const current = this.publicAppSettingsSubject.value;

    if (
      !current ||
      current.oidcEnabled !== updatedPublicSettings.oidcEnabled ||
      current.remoteAuthEnabled !== updatedPublicSettings.remoteAuthEnabled ||
      current.aiPanelDetectionEnabled !== updatedPublicSettings.aiPanelDetectionEnabled ||
      current.oidcForceOnlyMode !== updatedPublicSettings.oidcForceOnlyMode ||
      JSON.stringify(current.oidcProviderDetails) !== JSON.stringify(updatedPublicSettings.oidcProviderDetails)
    ) {
      this.publicAppSettingsSubject.next(updatedPublicSettings);
    }
  }

  saveSettings(settings: { key: string; newValue: unknown }[]): Observable<void> {
    const payload = settings.map(setting => ({
      name: setting.key,
      value: setting.newValue
    }));

    return this.http.put<void>(this.apiUrl, payload).pipe(
      switchMap(() => this.fetchAppSettings()),
      map(() => void 0)
    );
  }

  toggleOidcEnabled(enabled: boolean): Observable<void> {
    const payload = [{name: 'OIDC_ENABLED', value: enabled}];
    return this.http.put<void>(this.apiUrl, payload).pipe(
      tap(() => {
        const current = this.appSettingsSubject.value;
        if (current) {
          current.oidcEnabled = enabled;
          this.appSettingsSubject.next({...current});
          this.syncPublicSettings(current);
        }
      }),
      catchError(err => {
        console.error('Error toggling OIDC:', err);
        return of();
      })
    );
  }
}
