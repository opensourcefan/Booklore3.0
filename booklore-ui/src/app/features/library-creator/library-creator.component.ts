import {Component, inject, OnInit} from '@angular/core';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {MessageService} from 'primeng/api';
import {Router} from '@angular/router';
import {LibraryService} from '../book/service/library.service';
import {FormsModule} from '@angular/forms';
import {InputText} from 'primeng/inputtext';
import {Library, MetadataSource, OrganizationMode, DirectoryTagDepth} from '../book/model/library.model';
import {BookType} from '../book/model/book.model';
import {ToggleSwitch} from 'primeng/toggleswitch';
import {Tooltip} from 'primeng/tooltip';
import {IconPickerService, IconSelection} from '../../shared/service/icon-picker.service';
import {Button} from 'primeng/button';
import {IconDisplayComponent} from '../../shared/components/icon-display/icon-display.component';
import {DialogLauncherService} from '../../shared/services/dialog-launcher.service';
import {switchMap} from 'rxjs/operators';
import {map, of} from 'rxjs';
import {CdkDragDrop, DragDropModule, moveItemInArray} from '@angular/cdk/drag-drop';
import {Checkbox} from 'primeng/checkbox';
import {Select} from 'primeng/select';
import {TranslocoDirective, TranslocoPipe, TranslocoService} from '@jsverse/transloco';

@Component({
  selector: 'app-library-creator',
  standalone: true,
  templateUrl: './library-creator.component.html',
  imports: [FormsModule, InputText, ToggleSwitch, Tooltip, Button, IconDisplayComponent, DragDropModule, Checkbox, Select, TranslocoDirective, TranslocoPipe],
  styleUrl: './library-creator.component.scss'
})
export class LibraryCreatorComponent implements OnInit {
  chosenLibraryName = '';
  folders: string[] = [];
  selectedIcon: IconSelection | null = null;

  mode!: string;
  library!: Library | undefined;
  editModeLibraryName = '';
  watch = false;
  tagByDirectory = false;
  directoryTagDepth: DirectoryTagDepth = 'LAST_ONLY';
  directoryTagDepthOptions: {label: string, value: string}[] = [];
  formatPriority: {type: BookType, label: string}[] = [];
  allowAllFormats = true;
  selectedAllowedFormats = new Set<BookType>();
  formatCounts: Record<string, number> = {};
  metadataSource: MetadataSource = 'EMBEDDED';
  organizationMode: OrganizationMode = 'BOOK_PER_FILE';

  metadataSourceOptions: {label: string, value: string}[] = [];
  organizationModeOptions: {label: string, value: string}[] = [];

  readonly allBookFormats: {type: BookType, label: string}[] = [
    {type: 'EPUB', label: 'EPUB'},
    {type: 'PDF', label: 'PDF'},
    {type: 'CBX', label: 'CBX (CBZ/CBR/CB7)'},
    {type: 'MOBI', label: 'MOBI'},
    {type: 'AZW3', label: 'AZW3'},
    {type: 'FB2', label: 'FB2'},
    {type: 'AUDIOBOOK', label: 'Audiobook'}
  ];

  private dialogLauncherService = inject(DialogLauncherService);
  private dynamicDialogRef = inject(DynamicDialogRef);
  private dynamicDialogConfig = inject(DynamicDialogConfig);
  private libraryService = inject(LibraryService);
  private messageService = inject(MessageService);
  private router = inject(Router);
  private iconPicker = inject(IconPickerService);
  private readonly t = inject(TranslocoService);

  ngOnInit(): void {
    this.metadataSourceOptions = [
      {label: this.t.translate('libraryCreator.creator.metadataSourceEmbedded'), value: 'EMBEDDED'},
      {label: this.t.translate('libraryCreator.creator.metadataSourceSidecar'), value: 'SIDECAR'},
      {label: this.t.translate('libraryCreator.creator.metadataSourcePreferSidecar'), value: 'PREFER_SIDECAR'},
      {label: this.t.translate('libraryCreator.creator.metadataSourcePreferEmbedded'), value: 'PREFER_EMBEDDED'},
      {label: this.t.translate('libraryCreator.creator.metadataSourceNone'), value: 'NONE'}
    ];
    this.directoryTagDepthOptions = [
      {label: this.t.translate('libraryCreator.creator.directoryTagDepthLastOnly'), value: 'LAST_ONLY'},
      {label: this.t.translate('libraryCreator.creator.directoryTagDepthAllSegments'), value: 'ALL_SEGMENTS'}
    ];
    this.initializeFormatPriority();
    this.initializeAllowedFormats();
    this.initializeOrganizationModeOptions();

    const data = this.dynamicDialogConfig?.data;
    if (data?.mode === 'edit') {
      this.mode = data.mode;
      this.library = this.libraryService.findLibraryById(data.libraryId);
      if (this.library) {
        const {name, icon, iconType, paths, watch, formatPriority, allowedFormats} = this.library;
        this.chosenLibraryName = name;
        this.editModeLibraryName = name;

        if (icon != null && iconType) {
          if (iconType === 'CUSTOM_SVG') {
            this.selectedIcon = {type: 'CUSTOM_SVG', value: icon};
          } else {
            const value = icon.slice(0, 6) === 'pi pi-' ? icon : `pi pi-${icon}`;
            this.selectedIcon = {type: 'PRIME_NG', value: value};
          }
        }

        this.watch = watch;
        this.tagByDirectory = this.library.tagByDirectory ?? false;
        this.directoryTagDepth = this.library.directoryTagDepth ?? 'LAST_ONLY';
        if (formatPriority && formatPriority.length > 0) {
          this.formatPriority = formatPriority.map(type =>
            this.allBookFormats.find(f => f.type === type)!
          ).filter(f => f !== undefined);
          const existingTypes = new Set(formatPriority);
          this.allBookFormats.forEach(f => {
            if (!existingTypes.has(f.type)) {
              this.formatPriority.push(f);
            }
          });
        }

        if (allowedFormats && allowedFormats.length > 0) {
          this.allowAllFormats = false;
          this.selectedAllowedFormats = new Set(allowedFormats);
        } else {
          this.allowAllFormats = true;
          this.selectedAllowedFormats = new Set(this.allBookFormats.map(f => f.type));
        }

        if (this.library.metadataSource) {
          this.metadataSource = this.library.metadataSource;
        }

        if (this.library.organizationMode) {
          this.organizationMode = this.library.organizationMode;
          if (this.library.organizationMode === 'AUTO_DETECT') {
            this.organizationModeOptions.push({
              label: this.t.translate('libraryCreator.creator.organizationModeAutoDetect'),
              value: 'AUTO_DETECT'
            });
          }
        }

        this.libraryService.getBookCountsByFormat(this.library.id!).subscribe(counts => {
          this.formatCounts = counts;
        });

        this.folders = paths.map(path => path.path);
      }
    }
  }

  private initializeFormatPriority(): void {
    this.formatPriority = [...this.allBookFormats];
  }

  private initializeOrganizationModeOptions(): void {
    this.organizationModeOptions = [
      {label: this.t.translate('libraryCreator.creator.organizationModeBookPerFile'), value: 'BOOK_PER_FILE'},
      {label: this.t.translate('libraryCreator.creator.organizationModeBookPerFolder'), value: 'BOOK_PER_FOLDER'}
    ];
  }

  private initializeAllowedFormats(): void {
    this.selectedAllowedFormats = new Set(this.allBookFormats.map(f => f.type));
  }

  onAllowAllFormatsChange(): void {
    if (this.allowAllFormats) {
      this.selectedAllowedFormats = new Set(this.allBookFormats.map(f => f.type));
    }
  }

  onFormatCheckboxChange(formatType: BookType, checked: boolean): void {
    if (checked) {
      this.selectedAllowedFormats.add(formatType);
    } else {
      this.selectedAllowedFormats.delete(formatType);
    }
    this.allowAllFormats = this.selectedAllowedFormats.size === this.allBookFormats.length;
  }

  isFormatSelected(formatType: BookType): boolean {
    return this.selectedAllowedFormats.has(formatType);
  }

  getFormatWarning(formatType: BookType): string | null {
    if (this.mode !== 'edit') return null;
    const count = this.formatCounts[formatType];
    if (count && count > 0 && !this.selectedAllowedFormats.has(formatType)) {
      return this.t.translate('libraryCreator.creator.formatWarning', {count});
    }
    return null;
  }

  hasAnyFormatWarning(): boolean {
    if (this.mode !== 'edit') return false;
    return this.allBookFormats.some(f => this.getFormatWarning(f.type) !== null);
  }

  closeDialog(): void {
    this.dynamicDialogRef.close();
  }

  openDirectoryPicker(): void {
    const ref = this.dialogLauncherService.openDirectoryPickerDialog();
    ref?.onClose.subscribe((selectedFolders: string[] | null) => {
      if (selectedFolders && selectedFolders.length > 0) {
        selectedFolders.forEach(folder => {
          if (!this.folders.includes(folder)) {
            this.addFolder(folder);
          }
        });
      }
    });
  }

  openIconPicker(): void {
    this.iconPicker.open().subscribe(icon => {
      if (icon) {
        this.selectedIcon = icon;
      }
    });
  }

  addFolder(folder: string): void {
    this.folders.push(folder);
  }

  removeFolder(index: number): void {
    this.folders.splice(index, 1);
  }

  clearSelectedIcon(): void {
    this.selectedIcon = null;
  }

  isLibraryDetailsValid(): boolean {
    return !!this.chosenLibraryName.trim();
  }

  isDirectorySelectionValid(): boolean {
    return this.folders.length > 0;
  }

  createOrUpdateLibrary(): void {
    const trimmedLibraryName = this.chosenLibraryName.trim();
    if (trimmedLibraryName && trimmedLibraryName !== this.editModeLibraryName) {
      const exists = this.libraryService.doesLibraryExistByName(trimmedLibraryName);
      if (exists) {
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('libraryCreator.creator.toast.nameExistsSummary'),
          detail: this.t.translate('libraryCreator.creator.toast.nameExistsDetail'),
        });
        return;
      }
    }

    const iconValue = this.selectedIcon?.value ?? null;
    const iconType = this.selectedIcon?.type ?? null;
    const selectedAllowedFormats = this.allowAllFormats ? [] : Array.from(this.selectedAllowedFormats);

    const library: Library = {
      name: this.chosenLibraryName,
      icon: iconValue,
      iconType: iconType,
      paths: this.folders.map(folder => ({path: folder})),
      watch: this.watch,
      formatPriority: this.formatPriority.map(f => f.type),
      allowedFormats: selectedAllowedFormats,
      metadataSource: this.metadataSource,
      organizationMode: this.organizationMode,
      tagByDirectory: this.tagByDirectory,
      directoryTagDepth: this.directoryTagDepth
    };

    if (this.mode === 'edit') {
      const requiresFullRefresh = this.requiresFullRefreshAfterEdit(selectedAllowedFormats);
      this.libraryService.updateLibrary(library, this.library?.id).pipe(
        switchMap(() => requiresFullRefresh ? this.libraryService.refreshLibrary(this.library!.id!) : of(void 0))
      ).subscribe({
        next: () => {
          this.messageService.add({severity: 'success', summary: this.t.translate('libraryCreator.creator.toast.updatedSummary'), detail: this.t.translate('libraryCreator.creator.toast.updatedDetail')});
          this.dynamicDialogRef.close();
        },
        error: (e) => {
          this.messageService.add({severity: 'error', summary: this.t.translate('libraryCreator.creator.toast.updateFailedSummary'), detail: this.t.translate('libraryCreator.creator.toast.updateFailedDetail')});
          console.error(e);
        }
      });
    } else {
      this.libraryService.scanLibraryPaths(library).pipe(
        switchMap(count => {
          if (count < 500) {
            return this.libraryService.createLibrary(library).pipe(
              map(createdLibrary => ({ createdLibrary, count }))
            );
          } else {
            console.warn(`Library has ${count} processable files (>500). Will use buffered loading.`);
            this.libraryService.setLargeLibraryLoading(true, count);
            return this.libraryService.createLibrary(library).pipe(
              map(createdLibrary => ({ createdLibrary, count }))
            );
          }
        })
      ).subscribe({
        next: ({ createdLibrary, count }) => {
          if (createdLibrary) {
            this.router.navigate(['/library', createdLibrary.id, 'books']);
            this.messageService.add({
              severity: 'success',
              summary: this.t.translate('libraryCreator.creator.toast.createdSummary'),
              detail: count >= 500
                ? this.t.translate('libraryCreator.creator.toast.createdLargeDetail', {count})
                : this.t.translate('libraryCreator.creator.toast.createdDetail')
            });
            this.dynamicDialogRef.close();
          }
        },
        error: (e) => {
          this.libraryService.setLargeLibraryLoading(false, 0);
          this.messageService.add({severity: 'error', summary: this.t.translate('libraryCreator.creator.toast.createFailedSummary'), detail: this.t.translate('libraryCreator.creator.toast.createFailedDetail')});
          console.error(e);
        }
      });
    }
  }

  onFormatPriorityDrop(event: CdkDragDrop<{type: BookType, label: string}[]>): void {
    moveItemInArray(this.formatPriority, event.previousIndex, event.currentIndex);
  }

  private requiresFullRefreshAfterEdit(nextAllowedFormats: BookType[]): boolean {
    if (!this.library) {
      return false;
    }

    const currentAllowedFormats = this.library.allowedFormats ?? [];
    const currentOrganizationMode = this.library.organizationMode ?? 'BOOK_PER_FILE';

    return this.normalizeFormats(currentAllowedFormats) !== this.normalizeFormats(nextAllowedFormats)
      || currentOrganizationMode !== this.organizationMode;
  }

  private normalizeFormats(formats: BookType[]): string {
    return [...formats].sort().join('|');
  }
}
