import {Component, inject, OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {Checkbox} from 'primeng/checkbox';
import {ConfirmationService, MessageService} from 'primeng/api';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {Library} from '../../model/library.model';
import {LibraryService} from '../../service/library.service';
import {SidecarService} from '../../../metadata/service/sidecar.service';
import {TranslocoDirective, TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {DialogLauncherService} from '../../../../shared/services/dialog-launcher.service';

type MaintenanceAction = 'scanNewFiles' | 'reconcile' | 'sidecarExport' | 'sidecarBackup' | 'sidecarImport';

@Component({
  selector: 'app-library-maintenance-dialog',
  standalone: true,
  templateUrl: './library-maintenance-dialog.component.html',
  styleUrl: './library-maintenance-dialog.component.scss',
  imports: [FormsModule, Button, Checkbox, TranslocoDirective, TranslocoPipe]
})
export class LibraryMaintenanceDialogComponent implements OnInit {
  private readonly dialogRef = inject(DynamicDialogRef);
  private readonly dialogConfig = inject(DynamicDialogConfig);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly libraryService = inject(LibraryService);
  private readonly sidecarService = inject(SidecarService);
  private readonly dialogLauncherService = inject(DialogLauncherService);
  private readonly t = inject(TranslocoService);

  library: Library | undefined;
  runningAction: MaintenanceAction | null = null;
  reconcileAcknowledged = false;

  ngOnInit(): void {
    const libraryId = this.dialogConfig.data?.libraryId as number | undefined;
    if (libraryId != null) {
      this.library = this.libraryService.findLibraryById(libraryId);
    }
  }

  closeDialog(): void {
    this.dialogRef.close();
  }

  private switchWorkflowDialog(openNext: () => void): void {
    this.closeDialog();
    window.setTimeout(() => openNext(), 0);
  }

  confirmScanNewFiles(): void {
    if (!this.library) {
      return;
    }

    const libraryId = this.library.id as number;
    const libraryName = this.library.name;

    this.confirmationService.confirm({
      message: this.t.translate('book.shelfMenuService.confirm.scanNewFilesMessage', {name: libraryName}),
      header: this.t.translate('book.libraryMaintenanceDialog.confirm.header'),
      acceptLabel: this.t.translate('book.shelfMenuService.confirm.scanNewFilesLabel'),
      rejectLabel: this.t.translate('common.cancel'),
      rejectButtonProps: {
        label: this.t.translate('common.cancel'),
        severity: 'secondary'
      },
      acceptButtonProps: {
        label: this.t.translate('book.shelfMenuService.confirm.scanNewFilesLabel'),
        severity: 'success'
      },
      accept: () => {
        this.runningAction = 'scanNewFiles';
        this.libraryService.scanLibraryForNewFiles(libraryId).subscribe({
          complete: () => {
            this.runningAction = null;
            this.messageService.add({
              severity: 'success',
              summary: this.t.translate('common.success'),
              detail: this.t.translate('book.shelfMenuService.toast.scanNewFilesSuccessDetail')
            });
          },
          error: () => {
            this.runningAction = null;
            this.messageService.add({
              severity: 'error',
              summary: this.t.translate('book.shelfMenuService.toast.failedSummary'),
              detail: this.t.translate('book.shelfMenuService.toast.scanNewFilesFailedDetail')
            });
          }
        });
      }
    });
  }

  confirmReconcile(): void {
    if (!this.library || !this.reconcileAcknowledged) {
      return;
    }

    const libraryId = this.library.id as number;
    const libraryName = this.library.name;

    this.confirmationService.confirm({
      message: this.t.translate('book.shelfMenuService.confirm.reconcileLibraryMessage', {name: libraryName}),
      header: this.t.translate('book.libraryMaintenanceDialog.confirm.header'),
      acceptLabel: this.t.translate('book.shelfMenuService.confirm.reconcileLabel'),
      rejectLabel: this.t.translate('common.cancel'),
      rejectButtonProps: {
        label: this.t.translate('common.cancel'),
        severity: 'secondary'
      },
      acceptButtonProps: {
        label: this.t.translate('book.shelfMenuService.confirm.reconcileLabel'),
        severity: 'warn'
      },
      accept: () => {
        this.runningAction = 'reconcile';
        this.libraryService.refreshLibrary(libraryId).subscribe({
          complete: () => {
            this.runningAction = null;
            this.messageService.add({
              severity: 'success',
              summary: this.t.translate('common.success'),
              detail: this.t.translate('book.shelfMenuService.toast.reconcileLibrarySuccessDetail')
            });
          },
          error: () => {
            this.runningAction = null;
            this.messageService.add({
              severity: 'error',
              summary: this.t.translate('book.shelfMenuService.toast.failedSummary'),
              detail: this.t.translate('book.shelfMenuService.toast.reconcileLibraryFailedDetail')
            });
          }
        });
      }
    });
  }

  openLibrarySettings(): void {
    if (!this.library || this.runningAction) {
      return;
    }

    this.switchWorkflowDialog(() => this.dialogLauncherService.openLibrarySettingsDialog(this.library!.id as number));
  }

  openManageDirectories(): void {
    if (!this.library || this.runningAction) {
      return;
    }

    this.switchWorkflowDialog(() => this.dialogLauncherService.openLibraryDirectoriesDialog(this.library!.id as number));
  }

  confirmSidecarExport(): void {
    this.confirmationService.confirm({
      message: this.t.translate('book.libraryMaintenanceDialog.confirm.sidecarExportMessage', {name: this.library?.name}),
      header: this.t.translate('book.libraryMaintenanceDialog.confirm.header'),
      acceptLabel: this.t.translate('book.libraryMaintenanceDialog.actions.sidecarExport.button'),
      rejectLabel: this.t.translate('common.cancel'),
      rejectButtonProps: {
        label: this.t.translate('common.cancel'),
        severity: 'secondary'
      },
      acceptButtonProps: {
        label: this.t.translate('book.libraryMaintenanceDialog.actions.sidecarExport.button'),
        severity: 'warn'
      },
      accept: () => {
        this.runningAction = 'sidecarExport';
        this.sidecarService.bulkExport(this.library!.id as number).subscribe({
          next: (response) => {
            this.runningAction = null;
            this.messageService.add({
              severity: 'success',
              summary: this.t.translate('common.success'),
              detail: this.t.translate('book.libraryMaintenanceDialog.toast.sidecarExportSuccessDetail', {count: response.exported})
            });
          },
          error: () => {
            this.runningAction = null;
            this.messageService.add({
              severity: 'error',
              summary: this.t.translate('book.shelfMenuService.toast.failedSummary'),
              detail: this.t.translate('book.libraryMaintenanceDialog.toast.sidecarExportFailedDetail')
            });
          }
        });
      }
    });
  }

  confirmSidecarBackup(): void {
    this.confirmationService.confirm({
      message: this.t.translate('book.libraryMaintenanceDialog.confirm.sidecarBackupMessage', {name: this.library?.name}),
      header: this.t.translate('book.libraryMaintenanceDialog.confirm.header'),
      acceptLabel: this.t.translate('book.libraryMaintenanceDialog.actions.sidecarBackup.button'),
      rejectLabel: this.t.translate('common.cancel'),
      rejectButtonProps: {
        label: this.t.translate('common.cancel'),
        severity: 'secondary'
      },
      acceptButtonProps: {
        label: this.t.translate('book.libraryMaintenanceDialog.actions.sidecarBackup.button'),
        severity: 'warn'
      },
      accept: () => {
        this.runningAction = 'sidecarBackup';
        this.sidecarService.backupLibrarySidecars(this.library!.id as number).subscribe({
          next: (response) => {
            this.runningAction = null;
            const detailKey = response.failed > 0
              ? 'book.libraryMaintenanceDialog.toast.sidecarBackupPartialDetail'
              : 'book.libraryMaintenanceDialog.toast.sidecarBackupSuccessDetail';
            this.messageService.add({
              severity: response.failed > 0 ? 'warn' : 'success',
              summary: this.t.translate(response.failed > 0 ? 'book.libraryMaintenanceDialog.toast.sidecarBackupPartialSummary' : 'common.success'),
              detail: this.t.translate(detailKey, {
                count: response.exported,
                failed: response.failed,
                attempted: response.attempted,
                error: response.firstError || this.t.translate('book.libraryMaintenanceDialog.toast.sidecarBackupUnknownError')
              })
            });
          },
          error: () => {
            this.runningAction = null;
            this.messageService.add({
              severity: 'error',
              summary: this.t.translate('book.shelfMenuService.toast.failedSummary'),
              detail: this.t.translate('book.libraryMaintenanceDialog.toast.sidecarBackupFailedDetail')
            });
          }
        });
      }
    });
  }

  confirmSidecarImport(): void {
    this.confirmationService.confirm({
      message: this.t.translate('book.libraryMaintenanceDialog.confirm.sidecarImportMessage', {name: this.library?.name}),
      header: this.t.translate('book.libraryMaintenanceDialog.confirm.header'),
      acceptLabel: this.t.translate('book.libraryMaintenanceDialog.actions.sidecarImport.button'),
      rejectLabel: this.t.translate('common.cancel'),
      rejectButtonProps: {
        label: this.t.translate('common.cancel'),
        severity: 'secondary'
      },
      acceptButtonProps: {
        label: this.t.translate('book.libraryMaintenanceDialog.actions.sidecarImport.button'),
        severity: 'warn'
      },
      accept: () => {
        this.runningAction = 'sidecarImport';
        this.sidecarService.bulkImport(this.library!.id as number).subscribe({
          next: (response) => {
            this.runningAction = null;
            this.messageService.add({
              severity: 'success',
              summary: this.t.translate('common.success'),
              detail: this.t.translate('book.libraryMaintenanceDialog.toast.sidecarImportSuccessDetail', {count: response.imported})
            });
          },
          error: () => {
            this.runningAction = null;
            this.messageService.add({
              severity: 'error',
              summary: this.t.translate('book.shelfMenuService.toast.failedSummary'),
              detail: this.t.translate('book.libraryMaintenanceDialog.toast.sidecarImportFailedDetail')
            });
          }
        });
      }
    });
  }
}