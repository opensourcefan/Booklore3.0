import {Component, inject, OnInit} from '@angular/core';
import {Button} from 'primeng/button';
import {ConfirmationService, MessageService} from 'primeng/api';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {Library} from '../../model/library.model';
import {LibraryService} from '../../service/library.service';
import {SidecarService} from '../../../metadata/service/sidecar.service';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';

type MaintenanceAction = 'reconcile' | 'sidecarExport' | 'sidecarBackup' | 'sidecarImport';

@Component({
  selector: 'app-library-maintenance-dialog',
  standalone: true,
  templateUrl: './library-maintenance-dialog.component.html',
  styleUrl: './library-maintenance-dialog.component.scss',
  imports: [Button, TranslocoDirective]
})
export class LibraryMaintenanceDialogComponent implements OnInit {
  private readonly dialogRef = inject(DynamicDialogRef);
  private readonly dialogConfig = inject(DynamicDialogConfig);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly libraryService = inject(LibraryService);
  private readonly sidecarService = inject(SidecarService);
  private readonly t = inject(TranslocoService);

  library: Library | undefined;
  runningAction: MaintenanceAction | null = null;

  ngOnInit(): void {
    const libraryId = this.dialogConfig.data?.libraryId as number | undefined;
    if (libraryId != null) {
      this.library = this.libraryService.findLibraryById(libraryId);
    }
  }

  closeDialog(): void {
    this.dialogRef.close();
  }

  confirmReconcile(): void {
    this.confirmationService.confirm({
      message: this.t.translate('book.shelfMenuService.confirm.reconcileLibraryMessage', {name: this.library?.name}),
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
        this.libraryService.refreshLibrary(this.library!.id as number).subscribe({
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