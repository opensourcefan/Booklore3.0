import {inject, Injectable} from '@angular/core';
import {ConfirmationService, MenuItem, MessageService} from 'primeng/api';
import {Router} from '@angular/router';
import {LibraryService} from './library.service';
import {ShelfService} from './shelf.service';
import {Library} from '../model/library.model';
import {Shelf} from '../model/shelf.model';
import {MetadataRefreshType} from '../../metadata/model/request/metadata-refresh-type.enum';
import {MagicShelf, MagicShelfService} from '../../magic-shelf/service/magic-shelf.service';
import {TaskHelperService} from '../../settings/task-management/task-helper.service';
import {UserService} from "../../settings/user-management/user.service";
import {WriteProgressService} from '../../../shared/service/write-progress.service';
import {DialogLauncherService} from '../../../shared/services/dialog-launcher.service';
import {BookDialogHelperService} from '../components/book-browser/book-dialog-helper.service';
import {TranslocoService} from '@jsverse/transloco';

@Injectable({
  providedIn: 'root',
})
export class LibraryShelfMenuService {

  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);
  private libraryService = inject(LibraryService);
  private shelfService = inject(ShelfService);
  private taskHelperService = inject(TaskHelperService);
  private router = inject(Router);
  private dialogLauncherService = inject(DialogLauncherService);
  private magicShelfService = inject(MagicShelfService);
  private userService = inject(UserService);
  private writeProgressService = inject(WriteProgressService);
  private bookDialogHelperService = inject(BookDialogHelperService);
  private readonly t = inject(TranslocoService);

  initializeLibraryMenuItems(entity: Library | Shelf | MagicShelf | null): MenuItem[] {
    return [
      {
        label: this.t.translate('book.shelfMenuService.library.addPhysicalBook'),
        icon: 'pi pi-book',
        command: () => {
          this.bookDialogHelperService.openAddPhysicalBookDialog(entity?.id as number);
        }
      },
      {
        label: this.t.translate('book.shelfMenuService.library.bulkIsbnImport'),
        icon: 'pi pi-barcode',
        command: () => {
          this.bookDialogHelperService.openBulkIsbnImportDialog(entity?.id as number);
        }
      },
      {
        separator: true
      },
      {
        label: this.t.translate('book.shelfMenuService.library.editLibrary'),
        icon: 'pi pi-pen-to-square',
        command: () => {
          this.dialogLauncherService.openLibraryEditDialog((entity?.id as number));
        }
      },
      {
        label: this.t.translate('book.shelfMenuService.library.scanNewFiles'),
        icon: 'pi pi-search',
        command: () => {
          this.confirmationService.confirm({
            message: this.t.translate('book.shelfMenuService.confirm.scanNewFilesMessage', {name: entity?.name}),
            header: this.t.translate('book.shelfMenuService.confirm.header'),
            icon: undefined,
            acceptLabel: this.t.translate('book.shelfMenuService.confirm.scanNewFilesLabel'),
            rejectLabel: this.t.translate('common.cancel'),
            acceptIcon: undefined,
            rejectIcon: undefined,
            acceptButtonStyleClass: undefined,
            rejectButtonStyleClass: undefined,
            rejectButtonProps: {
              label: this.t.translate('common.cancel'),
              severity: 'secondary',
            },
            acceptButtonProps: {
              label: this.t.translate('book.shelfMenuService.confirm.scanNewFilesLabel'),
              severity: 'success',
            },
            accept: () => {
              this.libraryService.scanLibraryForNewFiles(entity!.id as number).subscribe({
                complete: () => {
                  this.messageService.add({severity: 'info', summary: this.t.translate('common.success'), detail: this.t.translate('book.shelfMenuService.toast.scanNewFilesSuccessDetail')});
                },
                error: () => {
                  this.messageService.add({
                    severity: 'error',
                    summary: this.t.translate('book.shelfMenuService.toast.failedSummary'),
                    detail: this.t.translate('book.shelfMenuService.toast.scanNewFilesFailedDetail'),
                  });
                }
              });
            }
          });
        }
      },
      {
        label: this.t.translate('book.shelfMenuService.library.libraryMaintenance'),
        icon: 'pi pi-wrench',
        command: () => {
          this.dialogLauncherService.openLibraryMaintenanceDialog(entity?.id as number);
        }
      },
      {
        label: this.t.translate('book.shelfMenuService.library.customFetchMetadata'),
        icon: 'pi pi-sync',
        command: () => {
          this.dialogLauncherService.openLibraryMetadataFetchDialog((entity?.id as number));
        }
      },
      {
        label: this.t.translate('book.shelfMenuService.library.autoFetchMetadata'),
        icon: 'pi pi-bolt',
        command: () => {
          this.taskHelperService.refreshMetadataTask({
            refreshType: MetadataRefreshType.LIBRARY,
            libraryId: entity?.id ?? undefined
          }).subscribe();
        }
      },
      {
        label: this.t.translate('book.shelfMenuService.library.findDuplicates'),
        icon: 'pi pi-copy',
        command: () => {
          this.bookDialogHelperService.openDuplicateMergerDialog({
            libraryId: entity?.id as number,
            libraryName: entity?.name,
          });
        }
      },
      {
        separator: true
      },
      {
        label: this.t.translate('book.shelfMenuService.library.deleteLibrary'),
        icon: 'pi pi-trash',
        command: () => {
          this.confirmationService.confirm({
            message: this.t.translate('book.shelfMenuService.confirm.deleteLibraryMessage', {name: entity?.name}),
            header: this.t.translate('book.shelfMenuService.confirm.header'),
            acceptLabel: this.t.translate('common.yes'),
            rejectLabel: this.t.translate('common.cancel'),
            rejectButtonProps: {
              label: this.t.translate('common.cancel'),
              severity: 'secondary',
            },
            acceptButtonProps: {
              label: this.t.translate('common.yes'),
              severity: 'danger',
            },
            accept: () => {
              this.writeProgressService.show(this.t.translate('book.shelfMenuService.loading.deletingLibrary', {name: entity?.name}));

              this.libraryService.deleteLibrary(entity!.id as number)
                .subscribe({
                  complete: () => {
                    this.writeProgressService.complete(this.t.translate('book.shelfMenuService.toast.libraryDeletedDetail'));
                    this.router.navigate(['/']);
                    this.messageService.add({severity: 'info', summary: this.t.translate('common.success'), detail: this.t.translate('book.shelfMenuService.toast.libraryDeletedDetail')});
                  },
                  error: () => {
                    this.writeProgressService.fail(this.t.translate('book.shelfMenuService.toast.libraryDeleteFailedDetail'));
                    this.messageService.add({
                      severity: 'error',
                      summary: this.t.translate('book.shelfMenuService.toast.failedSummary'),
                      detail: this.t.translate('book.shelfMenuService.toast.libraryDeleteFailedDetail'),
                    });
                  }
                });
            }
          });
        }
      }
    ];
  }

  initializeShelfMenuItems(entity: Shelf): MenuItem[] {
    const user = this.userService.getCurrentUser();
    const isOwner = entity?.userId === user?.id;
    const isPublicShelf = entity?.publicShelf ?? false;
    const disableOptions = !isOwner;

    return [
      {
        label: (isPublicShelf ? this.t.translate('book.shelfMenuService.shelf.publicShelfPrefix') : '') + (disableOptions ? this.t.translate('book.shelfMenuService.shelf.readOnly') : this.t.translate('book.shelfMenuService.shelf.optionsLabel')),
        items: [
          {
            label: this.t.translate('book.shelfMenuService.shelf.editShelf'),
            icon: 'pi pi-pen-to-square',
            disabled: disableOptions,
            command: () => {
              this.dialogLauncherService.openShelfEditDialog(entity.id!);
            }
          },
          {
            separator: true
          },
          {
            label: this.t.translate('book.shelfMenuService.shelf.deleteShelf'),
            icon: 'pi pi-trash',
            disabled: disableOptions,
            command: () => {
              this.confirmationService.confirm({
                message: this.t.translate('book.shelfMenuService.confirm.deleteShelfMessage', {name: entity?.name}),
                header: this.t.translate('book.shelfMenuService.confirm.header'),
                acceptLabel: this.t.translate('common.yes'),
                rejectLabel: this.t.translate('common.cancel'),
                acceptButtonProps: {
                  label: this.t.translate('common.yes'),
                  severity: 'danger'
                },
                rejectButtonProps: {
                  label: this.t.translate('common.cancel'),
                  severity: 'secondary'
                },
                accept: () => {
                  this.shelfService.deleteShelf(entity.id!).subscribe({
                    complete: () => {
                      this.router.navigate(['/']);
                      this.messageService.add({severity: 'info', summary: this.t.translate('common.success'), detail: this.t.translate('book.shelfMenuService.toast.shelfDeletedDetail')});
                    },
                    error: () => {
                      this.messageService.add({
                        severity: 'error',
                        summary: this.t.translate('book.shelfMenuService.toast.failedSummary'),
                        detail: this.t.translate('book.shelfMenuService.toast.shelfDeleteFailedDetail'),
                      });
                    }
                  });
                }
              });
            }
          }
        ]
      }
    ];
  }

  initializeMagicShelfMenuItems(entity: MagicShelf | null): MenuItem[] {
    const isAdmin = this.userService.getCurrentUser()?.permissions.admin ?? false;
    const isPublicShelf = entity?.isPublic ?? false;
    const disableOptions = isPublicShelf && !isAdmin;

    return [
      {
        label: this.t.translate('book.shelfMenuService.magicShelf.optionsLabel'),
        items: [
          {
            label: this.t.translate('book.shelfMenuService.magicShelf.editMagicShelf'),
            icon: 'pi pi-pen-to-square',
            disabled: disableOptions,
            command: () => {
              this.dialogLauncherService.openMagicShelfEditDialog((entity?.id as number));
            }
          },
          {
            label: this.t.translate('book.shelfMenuService.magicShelf.exportJson'),
            icon: 'pi pi-copy',
            command: () => {
              if (entity?.filterJson) {
                navigator.clipboard.writeText(entity.filterJson).then(() => {
                  this.messageService.add({severity: 'success', summary: this.t.translate('common.success'), detail: this.t.translate('book.shelfMenuService.toast.magicShelfJsonCopiedDetail')});
                });
              }
            }
          },
          {
            separator: true
          },
          {
            label: this.t.translate('book.shelfMenuService.magicShelf.deleteMagicShelf'),
            icon: 'pi pi-trash',
            disabled: disableOptions,
            command: () => {
              this.confirmationService.confirm({
                message: this.t.translate('book.shelfMenuService.confirm.deleteMagicShelfMessage', {name: entity?.name}),
                header: this.t.translate('book.shelfMenuService.confirm.header'),
                acceptLabel: this.t.translate('common.yes'),
                rejectLabel: this.t.translate('common.cancel'),
                acceptButtonProps: {
                  label: this.t.translate('common.yes'),
                  severity: 'danger'
                },
                rejectButtonProps: {
                  label: this.t.translate('common.cancel'),
                  severity: 'secondary'
                },
                accept: () => {
                  this.magicShelfService.deleteShelf(entity!.id as number).subscribe({
                    complete: () => {
                      this.router.navigate(['/']);
                      this.messageService.add({severity: 'info', summary: this.t.translate('common.success'), detail: this.t.translate('book.shelfMenuService.toast.magicShelfDeletedDetail')});
                    },
                    error: () => {
                      this.messageService.add({
                        severity: 'error',
                        summary: this.t.translate('book.shelfMenuService.toast.failedSummary'),
                        detail: this.t.translate('book.shelfMenuService.toast.magicShelfDeleteFailedDetail'),
                      });
                    }
                  });
                }
              });
            }
          }
        ]
      }
    ];
  }
}
