import {inject, Injectable, Type} from '@angular/core';
import {Subject} from 'rxjs';
import {DialogService, DynamicDialogRef} from 'primeng/dynamicdialog';
import {GithubSupportDialog} from '../components/github-support-dialog/github-support-dialog';
import {LibraryCreatorComponent} from '../../features/library-creator/library-creator.component';
import {BookUploaderComponent} from '../components/book-uploader/book-uploader.component';
import {UserProfileDialogComponent} from '../../features/settings/user-profile-dialog/user-profile-dialog.component';
import {MagicShelfComponent} from '../../features/magic-shelf/component/magic-shelf-component';
import {DashboardSettingsComponent} from '../../features/dashboard/components/dashboard-settings/dashboard-settings.component';
import {VersionChangelogDialogComponent} from '../layout/component/layout-menu/version-changelog-dialog/version-changelog-dialog.component';
import {CreateUserDialogComponent} from '../../features/settings/user-management/create-user-dialog/create-user-dialog.component';
import {CreateEmailRecipientDialogComponent} from '../../features/settings/email-v2/create-email-recipient-dialog/create-email-recipient-dialog.component';
import {CreateEmailProviderDialogComponent} from '../../features/settings/email-v2/create-email-provider-dialog/create-email-provider-dialog.component';
import {DirectoryPickerComponent} from '../components/directory-picker/directory-picker.component';
import {AiScanDirectoryDialogComponent} from '../../features/settings/ai-settings/ai-scan-directory-dialog/ai-scan-directory-dialog.component';
import {BookdropFinalizeResultDialogComponent} from '../../features/bookdrop/component/bookdrop-finalize-result-dialog/bookdrop-finalize-result-dialog.component';
import {BookdropFinalizeResult} from '../../features/bookdrop/service/bookdrop.service';
import {MetadataReviewDialogComponent} from '../../features/metadata/component/metadata-review-dialog/metadata-review-dialog-component';
import {MetadataRefreshType} from '../../features/metadata/model/request/metadata-refresh-type.enum';
import {MetadataFetchOptionsComponent} from '../../features/metadata/component/metadata-options-dialog/metadata-fetch-options/metadata-fetch-options.component';
import {ShelfEditDialogComponent} from '../../features/book/components/shelf-edit-dialog/shelf-edit-dialog.component';
import {IconPickerComponent} from '../components/icon-picker/icon-picker-component';
import {AcknowledgementsDialogComponent} from '../layout/component/layout-menu/acknowledgements-dialog/acknowledgements-dialog.component';
import {LibraryMaintenanceDialogComponent} from '../../features/book/components/library-maintenance-dialog/library-maintenance-dialog.component';

/**
 * Dialog size classes - use these to control dialog dimensions
 */
export const DialogSize = {
  XS: 'dialog-xs',   // ~400px - confirmations, simple alerts
  SM: 'dialog-sm',   // ~550px - simple forms, pickers
  MD: 'dialog-md',   // ~700px - standard dialogs
  LG: 'dialog-lg',   // ~900px - complex forms, lists
  XL: 'dialog-xl',   // ~1200px - data-heavy views
  FULL: 'dialog-full', // viewport - fullscreen editors
} as const;

/**
 * Dialog style modifiers - composable with size classes
 */
export const DialogStyle = {
  MINIMAL: 'dialog-minimal', // removes padding for custom headers
} as const;

@Injectable({
  providedIn: 'root',
})
export class DialogLauncherService {

  dialogService = inject(DialogService);

  private defaultDialogOptions = {
    baseZIndex: 10,
    closable: true,
    dismissableMask: true,
    closeOnEscape: true,
    draggable: false,
    modal: true,
    resizable: false,
    showHeader: true,
    maximizable: false,
  }

  private isCompactViewport(maxWidth: number): boolean {
    return typeof window !== 'undefined' && window.matchMedia(`(max-width: ${maxWidth}px)`).matches;
  }

  private getLibraryWorkflowDialogStyle(): string {
    const size = this.isCompactViewport(768) ? DialogSize.FULL : DialogSize.MD;
    return `${size} ${DialogStyle.MINIMAL}`;
  }

  private getDirectoryPickerDialogStyle(): string {
    const size = this.isCompactViewport(991) ? DialogSize.FULL : DialogSize.MD;
    return `${size} ${DialogStyle.MINIMAL}`;
  }

  openDialog(component: unknown, options: object): DynamicDialogRef | null {
    return this.dialogService.open(component as Type<object>, {
      ...this.defaultDialogOptions,
      ...options,
    });
  }

  openDashboardSettingsDialog(): DynamicDialogRef | null {
    return this.openDialog(DashboardSettingsComponent, {
      showHeader: false,
      styleClass: `${DialogSize.XL} ${DialogStyle.MINIMAL}`,
    });
  }

  openGithubSupportDialog(): DynamicDialogRef | null {
    return this.openDialog(GithubSupportDialog, {
      showHeader: false,
      styleClass: `${DialogSize.MD} ${DialogStyle.MINIMAL}`,
    });
  }

  openLibraryCreateDialog(): DynamicDialogRef | null {
    return this.openDialog(LibraryCreatorComponent, {
      showHeader: false,
      styleClass: this.getLibraryWorkflowDialogStyle(),
    });
  }

  openDirectoryPickerDialog(data?: { existingFolders?: string[] }): DynamicDialogRef | null {
    return this.openDialog(DirectoryPickerComponent, {
      showHeader: false,
      styleClass: this.getDirectoryPickerDialogStyle(),
      data,
    });
  }

  openLibraryEditDialog(libraryId: number): DynamicDialogRef | null {
    return this.openLibrarySettingsDialog(libraryId);
  }

  openLibrarySettingsDialog(libraryId: number): DynamicDialogRef | null {
    return this.openDialog(LibraryCreatorComponent, {
      showHeader: false,
      styleClass: this.getLibraryWorkflowDialogStyle(),
      data: {
        mode: 'edit-settings',
        libraryId: libraryId
      }
    });
  }

  openLibraryDirectoriesDialog(libraryId: number): DynamicDialogRef | null {
    return this.openDialog(LibraryCreatorComponent, {
      showHeader: false,
      styleClass: this.getLibraryWorkflowDialogStyle(),
      data: {
        mode: 'edit-directories',
        libraryId: libraryId
      }
    });
  }

  openLibraryMetadataFetchDialog(libraryId: number): DynamicDialogRef | null {
    return this.openDialog(MetadataFetchOptionsComponent, {
      showHeader: false,
      styleClass: `${DialogSize.SM} ${DialogStyle.MINIMAL}`,
      data: {
        libraryId: libraryId,
        metadataRefreshType: MetadataRefreshType.LIBRARY,
      },
    });
  }

  openLibraryMaintenanceDialog(libraryId: number): DynamicDialogRef | null {
    return this.openDialog(LibraryMaintenanceDialogComponent, {
      showHeader: false,
      styleClass: this.getLibraryWorkflowDialogStyle(),
      data: {
        libraryId,
      },
    });
  }

  openShelfEditDialog(shelfId: number): DynamicDialogRef | null {
    return this.openDialog(ShelfEditDialogComponent, {
      showHeader: false,
      styleClass: `${DialogSize.SM} ${DialogStyle.MINIMAL}`,
      data: {
        shelfId: shelfId
      },
    })
  }

  openFileUploadDialog(): DynamicDialogRef | null {
    return this.openDialog(BookUploaderComponent, {
      showHeader: false,
      styleClass: `${DialogSize.MD} ${DialogStyle.MINIMAL}`,
    });
  }

  openCreateUserDialog(): DynamicDialogRef | null {
    return this.openDialog(CreateUserDialogComponent, {
      showHeader: false,
      styleClass: `${DialogSize.LG} ${DialogStyle.MINIMAL}`,
    });
  }

  openUserProfileDialog(): DynamicDialogRef | null {
    return this.openDialog(UserProfileDialogComponent, {
      showHeader: false,
      styleClass: `${DialogSize.SM} ${DialogStyle.MINIMAL}`,
    });
  }

  openMagicShelfCreateDialog(): DynamicDialogRef | null {
    return this.openDialog(MagicShelfComponent, {
      showHeader: false,
      styleClass: `${DialogSize.XL} ${DialogStyle.MINIMAL}`,
    });
  }

  openMagicShelfEditDialog(shelfId: number): DynamicDialogRef | null {
    return this.openDialog(MagicShelfComponent, {
      showHeader: false,
      styleClass: `${DialogSize.XL} ${DialogStyle.MINIMAL}`,
      data: {
        id: shelfId,
        editMode: true,
      }
    })
  }

  openVersionChangelogDialog(): DynamicDialogRef | null {
    return this.openDialog(VersionChangelogDialogComponent, {
      showHeader: false,
      styleClass: `${DialogSize.LG} ${DialogStyle.MINIMAL}`,
    });
  }

  openEmailRecipientDialog(): DynamicDialogRef | null {
    return this.openDialog(CreateEmailRecipientDialogComponent, {
      showHeader: false,
      styleClass: `${DialogSize.MD} ${DialogStyle.MINIMAL}`,
    });
  }

  openEmailProviderDialog(): DynamicDialogRef | null {
    return this.openDialog(CreateEmailProviderDialogComponent, {
      showHeader: false,
      styleClass: `${DialogSize.MD} ${DialogStyle.MINIMAL}`,
    });
  }

  openBookdropFinalizeResultDialog(result: BookdropFinalizeResult): DynamicDialogRef | null {
    return this.openDialog(BookdropFinalizeResultDialogComponent, {
      showHeader: false,
      styleClass: `${DialogSize.MD} ${DialogStyle.MINIMAL}`,
      data: {
        result: result,
      },
    });
  }

  openMetadataReviewDialog(taskId: string): DynamicDialogRef | null {
    return this.openDialog(MetadataReviewDialogComponent, {
      showHeader: false,
      styleClass: `${DialogSize.FULL} ${DialogStyle.MINIMAL}`,
      data: {
        taskId,
      },
    });
  }

  openIconPickerDialog(): DynamicDialogRef | null {
    return this.openDialog(IconPickerComponent, {
      showHeader: false,
      styleClass: `${DialogSize.LG} ${DialogStyle.MINIMAL}`,
    });
  }

  openAcknowledgementsDialog(): DynamicDialogRef | null {
    return this.openDialog(AcknowledgementsDialogComponent, {
      showHeader: false,
      styleClass: `${DialogSize.SM} ${DialogStyle.MINIMAL}`,
    });
  }

  openAiScanDirectoryDialog(selectedLibraryPathIds: number[] = [], selectedLibraryFilterIds: number[] = [], liveSelection$?: Subject<number[]>): DynamicDialogRef | null {
    const size = this.isCompactViewport(991) ? DialogSize.FULL : DialogSize.MD;
    return this.openDialog(AiScanDirectoryDialogComponent, {
      showHeader: false,
      styleClass: `${size} ${DialogStyle.MINIMAL}`,
      data: {
        selectedLibraryPathIds,
        selectedLibraryFilterIds,
        liveSelection$
      },
    });
  }
}
