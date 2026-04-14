import {AsyncPipe} from '@angular/common';
import {Component, inject, OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {ConfirmationService, MessageService} from 'primeng/api';
import {Button} from 'primeng/button';
import {Select} from 'primeng/select';
import {Tab, TabList, TabPanel, TabPanels, Tabs} from 'primeng/tabs';
import {filter, finalize, take} from 'rxjs/operators';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {Library} from '../../book/model/library.model';
import {LibraryService} from '../../book/service/library.service';
import {SidecarService} from '../../metadata/service/sidecar.service';
import {AppSettingsService, AppSettingsTransferFile} from '../../../shared/service/app-settings.service';
import {SidecarBackupProgressService} from '../../../shared/service/sidecar-backup-progress.service';
import {UserService} from '../user-management/user.service';
import {
  AppSettingsBackupActivity,
  BackupsActivityService,
  DatabaseBackupActivity,
  SidecarBackupActivity
} from './backups-activity.service';

type BackupsTab = 'status' | 'app-settings' | 'sidecar' | 'database-export' | 'database-restore';

interface BackupAccessUser {
  permissions: {
    admin: boolean;
    canManageGlobalPreferences: boolean;
    canManageMetadataConfig: boolean;
  };
}

interface RestoreCheck {
  labelKey: string;
  detail: string;
  passed: boolean;
}

@Component({
  selector: 'app-backups',
  standalone: true,
  imports: [
    AsyncPipe,
    FormsModule,
    Tabs,
    TabList,
    Tab,
    TabPanels,
    TabPanel,
    Button,
    Select,
    TranslocoDirective
  ],
  templateUrl: './backups.component.html',
  styleUrl: './backups.component.scss'
})
export class BackupsComponent implements OnInit {
  protected readonly userService = inject(UserService);

  private readonly appSettingsService = inject(AppSettingsService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly translocoService = inject(TranslocoService);
  private readonly libraryService = inject(LibraryService);
  private readonly sidecarService = inject(SidecarService);
  private readonly sidecarBackupProgressService = inject(SidecarBackupProgressService);
  private readonly backupsActivityService = inject(BackupsActivityService);

  activeTab: BackupsTab = 'status';

  libraries: Library[] = [];
  selectedBackupLibraryId: number | null = null;
  isSidecarBackupRunning = false;

  appSettingsActivity: AppSettingsBackupActivity | null = null;
  sidecarActivity: SidecarBackupActivity | null = null;
  databaseActivity: DatabaseBackupActivity | null = null;

  backupDirectory = '$HOME/booklore-backups';
  backupFileName = '';

  restoreSqlPath = '$HOME/booklore-backups/booklore_backup_20260414_020000.sql';
  restoreAppDataPath = '/srv/booklore/data';
  restoreComposePath = '/opt/booklore/docker-compose.yml';
  availableSpaceGb = 0;
  packageFilesConfirmed = false;
  libraryMediaCopied = false;
  appDataConfirmed = false;
  deploymentConfigConfirmed = false;
  versionConfirmed = false;
  maintenanceReady = false;

  restoreChecks: RestoreCheck[] = [];
  restoreReady = false;

  ngOnInit(): void {
    this.backupFileName = this.buildDefaultBackupFileName();
    this.refreshActivitySnapshots();
    this.loadLibraries();
  }

  canManageAppSettings(user: BackupAccessUser | null | undefined): boolean {
    return !!user && (user.permissions.admin || user.permissions.canManageGlobalPreferences);
  }

  canManageSidecar(user: BackupAccessUser | null | undefined): boolean {
    return !!user && (user.permissions.admin || user.permissions.canManageMetadataConfig);
  }

  canManageDatabase(user: BackupAccessUser | null | undefined): boolean {
    return !!user?.permissions.admin;
  }

  formatDateTime(timestamp: string | null | undefined): string {
    if (!timestamp) {
      return this.translocoService.translate('settingsBackups.common.never');
    }

    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(timestamp));
  }

  getDatabaseOutputPath(): string {
    return `${this.backupDirectory.replace(/\/$/, '')}/${this.backupFileName}`;
  }

  getDatabaseExportCommand(): string {
    return `docker exec mariadb mariadb-dump --single-transaction --quick --no-tablespaces -u booklore -p booklore > "${this.getDatabaseOutputPath()}"`;
  }

  getDatabaseRestoreCommand(): string {
    return `docker exec -i mariadb mariadb -u booklore -p booklore < "${this.restoreSqlPath}"`;
  }

  regenerateBackupFileName(): void {
    this.backupFileName = this.buildDefaultBackupFileName();
  }

  exportSettings(): void {
    this.appSettingsService.exportSettings().subscribe({
      next: (fileName) => {
        this.backupsActivityService.setAppSettingsActivity({
          action: 'export',
          fileName,
          timestamp: new Date().toISOString()
        });
        this.refreshActivitySnapshots();
        this.showMessage('success', 'settingsBackups.messages.exportRecorded', 'settingsApp.transfer.exportSuccessDetail');
      },
      error: () => {
        this.showMessage('error', 'common.error', 'settingsApp.transfer.exportError');
      }
    });
  }

  async onImportFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const payload = JSON.parse(text) as AppSettingsTransferFile;

      if (!payload || typeof payload.version !== 'number' || !Array.isArray(payload.settings)) {
        this.showMessage('error', 'settingsApp.transfer.importInvalid', 'settingsApp.transfer.importInvalidDetail');
        return;
      }

      this.confirmationService.confirm({
        header: this.translocoService.translate('settingsApp.transfer.importConfirmHeader'),
        message: this.translocoService.translate('settingsApp.transfer.importConfirmMessage'),
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: this.translocoService.translate('common.yes'),
        rejectLabel: this.translocoService.translate('common.no'),
        rejectButtonStyleClass: 'p-button-text',
        accept: () => {
          this.appSettingsService.importSettings(payload).subscribe({
            next: () => {
              this.backupsActivityService.setAppSettingsActivity({
                action: 'import',
                fileName: file.name,
                timestamp: new Date().toISOString()
              });
              this.refreshActivitySnapshots();
              this.showMessage('success', 'settingsApp.transfer.importSuccess', 'settingsApp.transfer.importSuccessDetail');
            },
            error: () => {
              this.showMessage('error', 'common.error', 'settingsApp.transfer.importError');
            }
          });
        }
      });
    } catch {
      this.showMessage('error', 'settingsApp.transfer.importInvalid', 'settingsApp.transfer.importInvalidDetail');
    }
  }

  backupLibrarySidecars(): void {
    if (this.selectedBackupLibraryId === null || this.isSidecarBackupRunning) {
      return;
    }

    const selectedLibrary = this.libraries.find((library) => library.id === this.selectedBackupLibraryId);
    if (!selectedLibrary) {
      return;
    }

    this.isSidecarBackupRunning = true;
    this.sidecarBackupProgressService.start();

    this.sidecarService.backupLibrarySidecars(this.selectedBackupLibraryId).pipe(
      finalize(() => {
        this.isSidecarBackupRunning = false;
        this.sidecarBackupProgressService.clear();
      })
    ).subscribe({
      next: (response) => {
        if (response.exported > 0) {
          this.backupsActivityService.setSidecarActivity({
            libraryId: this.selectedBackupLibraryId ?? selectedLibrary.id ?? 0,
            libraryName: selectedLibrary.name,
            attempted: response.attempted,
            exported: response.exported,
            failed: response.failed,
            timestamp: new Date().toISOString()
          });
          this.refreshActivitySnapshots();
        }

        if (response.failed > 0) {
          this.messageService.add({
            severity: 'error',
            summary: this.translocoService.translate('common.error'),
            detail: this.translocoService.translate(
              response.exported > 0
                ? 'settingsMeta.persistence.sidecarBackupPartial'
                : 'settingsMeta.persistence.sidecarBackupFailureDetail',
              {
                count: response.exported,
                attempted: response.attempted,
                failed: response.failed,
                error: response.firstError || this.translocoService.translate('settingsMeta.persistence.sidecarBackupUnknownError')
              }
            )
          });
          return;
        }

        this.messageService.add({
          severity: 'success',
          summary: this.translocoService.translate('common.success'),
          detail: this.translocoService.translate('settingsMeta.persistence.sidecarBackupSuccess', {count: response.exported})
        });
      },
      error: () => {
        this.showMessage('error', 'common.error', 'settingsMeta.persistence.sidecarBackupError');
      }
    });
  }

  async copyDatabaseExportCommand(): Promise<void> {
    const copied = await this.copyText(this.getDatabaseExportCommand());

    if (!copied) {
      return;
    }

    this.backupsActivityService.setDatabaseActivity({
      action: 'export',
      outputPath: this.getDatabaseOutputPath(),
      timestamp: new Date().toISOString()
    });
    this.refreshActivitySnapshots();
    this.showMessage('success', 'settingsBackups.messages.exportCommandCopied', 'settingsBackups.messages.exportCommandCopiedDetail');
  }

  runRestorePreflight(): void {
    this.restoreChecks = [
      {
        labelKey: 'settingsBackups.databaseRestore.checks.sqlPath',
        detail: this.restoreSqlPath.trim()
          ? this.restoreSqlPath.trim()
          : this.translocoService.translate('settingsBackups.databaseRestore.missingSqlPath'),
        passed: !!this.restoreSqlPath.trim() && this.packageFilesConfirmed
      },
      {
        labelKey: 'settingsBackups.databaseRestore.checks.media',
        detail: this.translocoService.translate(
          this.libraryMediaCopied
            ? 'settingsBackups.databaseRestore.details.mediaReady'
            : 'settingsBackups.databaseRestore.details.mediaMissing'
        ),
        passed: this.libraryMediaCopied
      },
      {
        labelKey: 'settingsBackups.databaseRestore.checks.appData',
        detail: this.restoreAppDataPath.trim()
          ? this.restoreAppDataPath.trim()
          : this.translocoService.translate('settingsBackups.databaseRestore.missingAppDataPath'),
        passed: !!this.restoreAppDataPath.trim() && this.appDataConfirmed
      },
      {
        labelKey: 'settingsBackups.databaseRestore.checks.compose',
        detail: this.restoreComposePath.trim()
          ? this.restoreComposePath.trim()
          : this.translocoService.translate('settingsBackups.databaseRestore.missingComposePath'),
        passed: !!this.restoreComposePath.trim() && this.deploymentConfigConfirmed
      },
      {
        labelKey: 'settingsBackups.databaseRestore.checks.version',
        detail: this.translocoService.translate(
          this.versionConfirmed
            ? 'settingsBackups.databaseRestore.details.versionReady'
            : 'settingsBackups.databaseRestore.details.versionBlocked'
        ),
        passed: this.versionConfirmed
      },
      {
        labelKey: 'settingsBackups.databaseRestore.checks.maintenance',
        detail: this.translocoService.translate(
          this.maintenanceReady
            ? 'settingsBackups.databaseRestore.details.maintenanceReady'
            : 'settingsBackups.databaseRestore.details.maintenanceBlocked'
        ),
        passed: this.maintenanceReady
      },
      {
        labelKey: 'settingsBackups.databaseRestore.checks.freeSpace',
        detail: this.translocoService.translate('settingsBackups.databaseRestore.details.freeSpace', {
          value: this.availableSpaceGb
        }),
        passed: this.availableSpaceGb >= 15
      }
    ];

    this.restoreReady = this.restoreChecks.every((check) => check.passed);

    this.messageService.add({
      severity: this.restoreReady ? 'success' : 'warn',
      summary: this.translocoService.translate(this.restoreReady ? 'common.success' : 'settingsBackups.databaseRestore.preflightBlocked'),
      detail: this.translocoService.translate(
        this.restoreReady
          ? 'settingsBackups.databaseRestore.preflightPassedDetail'
          : 'settingsBackups.databaseRestore.preflightBlockedDetail'
      )
    });
  }

  resetRestorePreflight(): void {
    this.packageFilesConfirmed = false;
    this.libraryMediaCopied = false;
    this.appDataConfirmed = false;
    this.deploymentConfigConfirmed = false;
    this.versionConfirmed = false;
    this.maintenanceReady = false;
    this.restoreChecks = [];
    this.restoreReady = false;
  }

  async copyDatabaseRestoreCommand(): Promise<void> {
    if (!this.restoreReady) {
      return;
    }

    const copied = await this.copyText(this.getDatabaseRestoreCommand());

    if (!copied) {
      return;
    }

    this.backupsActivityService.setDatabaseActivity({
      action: 'restore-command',
      outputPath: this.restoreSqlPath,
      timestamp: new Date().toISOString()
    });
    this.refreshActivitySnapshots();
    this.showMessage('success', 'settingsBackups.messages.restoreCommandCopied', 'settingsBackups.messages.restoreCommandCopiedDetail');
  }

  private refreshActivitySnapshots(): void {
    this.appSettingsActivity = this.backupsActivityService.getAppSettingsActivity();
    this.sidecarActivity = this.backupsActivityService.getSidecarActivity();
    this.databaseActivity = this.backupsActivityService.getDatabaseActivity();
  }

  private loadLibraries(): void {
    this.libraryService.libraryState$.pipe(
      filter((state) => state.loaded),
      take(1)
    ).subscribe({
      next: (state) => {
        this.libraries = state.libraries ?? [];
        if (this.selectedBackupLibraryId === null && this.libraries.length > 0) {
          this.selectedBackupLibraryId = this.libraries[0].id ?? null;
        }
      }
    });
  }

  private buildDefaultBackupFileName(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `booklore_backup_${year}${month}${day}_${hours}${minutes}${seconds}.sql`;
  }

  private showMessage(severity: 'success' | 'error', summaryKey: string, detailKey: string): void {
    this.messageService.add({
      severity,
      summary: this.translocoService.translate(summaryKey),
      detail: this.translocoService.translate(detailKey)
    });
  }

  private async copyText(text: string): Promise<boolean> {
    if (!navigator.clipboard?.writeText) {
      this.showMessage('error', 'common.error', 'settingsBackups.messages.clipboardUnavailable');
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      this.showMessage('error', 'common.error', 'settingsBackups.messages.clipboardUnavailable');
      return false;
    }
  }
}