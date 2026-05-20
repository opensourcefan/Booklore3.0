import {Component, inject, OnInit, OnDestroy} from '@angular/core';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {Checkbox} from 'primeng/checkbox';
import {MultiSelect} from 'primeng/multiselect';
import {Tooltip} from 'primeng/tooltip';
import {TranslocoDirective} from '@jsverse/transloco';
import {Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';

import {Library} from '../../../book/model/library.model';
import {LibraryService} from '../../../book/service/library.service';
import {AppSettingsService} from '../../../../shared/service/app-settings.service';
import {AiPanelFlowDirectoryScanStatus} from '../../../../shared/model/app-settings.model';

interface DirectoryEntry {
  libraryId: number;
  libraryName: string;
  pathId: number;
  path: string;
  scanning: boolean;
  scanned: boolean;
}

@Component({
  selector: 'app-ai-scan-directory-dialog',
  standalone: true,
  imports: [
    Button,
    Checkbox,
    FormsModule,
    MultiSelect,
    Tooltip,
    TranslocoDirective
  ],
  templateUrl: './ai-scan-directory-dialog.component.html',
  styleUrl: './ai-scan-directory-dialog.component.scss'
})
export class AiScanDirectoryDialogComponent implements OnInit, OnDestroy {
  private libraryService = inject(LibraryService);
  private appSettingsService = inject(AppSettingsService);
  private dynamicDialogRef = inject(DynamicDialogRef);
  private dynamicDialogConfig = inject(DynamicDialogConfig);
  private destroy$ = new Subject<void>();

  allDirectories: DirectoryEntry[] = [];
  filteredDirectories: DirectoryEntry[] = [];
  libraryOptions: { label: string; value: number }[] = [];
  selectedLibraryIds: number[] = [];
  selectedPathIds = new Set<number>();
  rescanningPathId: number | null = null;

  private incomingPathIds: number[] = [];
  private incomingLibraryFilterIds: number[] = [];
  private liveSelection$: Subject<number[]> | null = null;
  private liveLibraryFilter$: Subject<number[]> | null = null;

  ngOnInit(): void {
    this.incomingPathIds = this.dynamicDialogConfig.data?.selectedLibraryPathIds ?? [];
    this.incomingLibraryFilterIds = this.dynamicDialogConfig.data?.selectedLibraryFilterIds ?? [];
    this.liveSelection$ = this.dynamicDialogConfig.data?.liveSelection$ ?? null;
    this.liveLibraryFilter$ = this.dynamicDialogConfig.data?.liveLibraryFilter$ ?? null;

    this.libraryService.libraryState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        const libraries = state.libraries ?? [];
        this.buildDirectoryList(libraries);
        this.buildLibraryOptions(libraries);
        this.applyIncomingSelection();
        this.applyIncomingLibraryFilter();
        this.applyFilter();
        this.fetchScanStatusForSelectedLibraries();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onLibraryFilterChange(): void {
    this.applyFilter();
    this.fetchScanStatusForSelectedLibraries();
    this.emitLiveLibraryFilter();
  }

  toggleAllLibraries(): void {
    if (this.allLibrariesSelected) {
      this.selectedLibraryIds = [];
    } else {
      this.selectedLibraryIds = this.libraryOptions.map(o => o.value);
    }
    this.applyFilter();
    this.fetchScanStatusForSelectedLibraries();
    this.emitLiveLibraryFilter();
  }

  toggleAllDirectories(): void {
    if (this.allDirectoriesSelected) {
      this.selectedPathIds.clear();
    } else {
      for (const entry of this.allDirectories) {
        this.selectedPathIds.add(entry.pathId);
      }
    }
    this.emitLiveSelection();
  }

  onClose(): void {
    this.dynamicDialogRef.close(null);
  }

  onRescan(entry: DirectoryEntry): void {
    if (this.rescanningPathId !== null) return;

    this.rescanningPathId = entry.pathId;
    entry.scanning = true;

    this.appSettingsService.scanMissingAiPanelData([entry.pathId]).subscribe({
      next: () => {
        entry.scanning = false;
        entry.scanned = true;
        this.rescanningPathId = null;
      },
      error: () => {
        entry.scanning = false;
        this.rescanningPathId = null;
      }
    });
  }

  toggleDirectory(pathId: number): void {
    if (this.selectedPathIds.has(pathId)) {
      this.selectedPathIds.delete(pathId);
    } else {
      this.selectedPathIds.add(pathId);
    }
    this.emitLiveSelection();
  }

  get selectedCount(): number {
    return this.selectedPathIds.size;
  }

  get selectedLibraryCount(): number {
    return this.selectedLibraryIds.length;
  }

  get allLibrariesSelected(): boolean {
    return this.libraryOptions.length > 0 && this.selectedLibraryIds.length === this.libraryOptions.length;
  }

  get allDirectoriesSelected(): boolean {
    return this.allDirectories.length > 0 && this.allDirectories.every(d => this.selectedPathIds.has(d.pathId));
  }

  private buildDirectoryList(libraries: Library[]): void {
    const entries: DirectoryEntry[] = [];

    for (const library of libraries) {
      if (!library.id) continue;
      for (const path of library.paths ?? []) {
        if (typeof path.id !== 'number') continue;
        entries.push({
          libraryId: library.id,
          libraryName: library.name,
          pathId: path.id,
          path: path.path,
          scanning: false,
          scanned: false
        });
      }
    }

    entries.sort((a, b) => a.path.localeCompare(b.path));
    this.allDirectories = entries;
  }

  private buildLibraryOptions(libraries: Library[]): void {
    this.libraryOptions = libraries
      .filter(l => typeof l.id === 'number')
      .map(l => ({
        label: l.name,
        value: l.id!
      }));

    const validIds = new Set(this.libraryOptions.map(o => o.value));
    this.selectedLibraryIds = this.selectedLibraryIds.filter(id => validIds.has(id));
  }

  private applyIncomingSelection(): void {
    if (this.incomingPathIds.length === 0) return;
    if (this.allDirectories.length === 0) return;

    for (const pathId of this.incomingPathIds) {
      this.selectedPathIds.add(pathId);
    }

    const libraryIdsForIncomingPaths = new Set<number>();
    for (const entry of this.allDirectories) {
      if (this.selectedPathIds.has(entry.pathId)) {
        libraryIdsForIncomingPaths.add(entry.libraryId);
      }
    }
    if (libraryIdsForIncomingPaths.size > 0) {
      this.selectedLibraryIds = Array.from(libraryIdsForIncomingPaths);
    }

    this.incomingPathIds = [];
  }

  private applyIncomingLibraryFilter(): void {
    if (this.incomingLibraryFilterIds.length === 0) return;
    const validIds = new Set(this.libraryOptions.map(o => o.value));
    this.selectedLibraryIds = this.incomingLibraryFilterIds.filter(id => validIds.has(id));
    this.incomingLibraryFilterIds = [];
  }

  private applyFilter(): void {
    if (this.selectedLibraryIds.length === 0) {
      this.filteredDirectories = [];
    } else {
      const selectedIds = new Set(this.selectedLibraryIds);
      this.filteredDirectories = this.allDirectories.filter(
        d => selectedIds.has(d.libraryId)
      );
    }
  }

  private emitLiveSelection(): void {
    if (this.liveSelection$) {
      this.liveSelection$.next(Array.from(this.selectedPathIds));
    }
  }

  private emitLiveLibraryFilter(): void {
    if (this.liveLibraryFilter$) {
      this.liveLibraryFilter$.next([...this.selectedLibraryIds]);
    }
  }

  private fetchScanStatusForSelectedLibraries(): void {
    if (this.selectedLibraryIds.length === 0) return;

    for (const libraryId of this.selectedLibraryIds) {
      this.appSettingsService.getAiPanelFlowDirectoryScanStatus(libraryId).subscribe({
        next: (statuses: AiPanelFlowDirectoryScanStatus[]) => {
          const scannedPathIds = new Set<number>();
          for (const status of statuses) {
            if (status.scannedComicCount > 0) {
              scannedPathIds.add(status.libraryPathId);
            }
          }

          for (const entry of this.allDirectories) {
            if (entry.libraryId === libraryId) {
              entry.scanned = scannedPathIds.has(entry.pathId);
            }
          }
        },
        error: () => {
          // If the endpoint fails, leave scanned status as false
        }
      });
    }
  }
}
