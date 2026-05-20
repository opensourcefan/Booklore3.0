import {Component, inject, OnInit, OnDestroy} from '@angular/core';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {FormsModule} from '@angular/forms';
import {NgClass} from '@angular/common';
import {Button} from 'primeng/button';
import {Checkbox} from 'primeng/checkbox';
import {Select} from 'primeng/select';
import {Tooltip} from 'primeng/tooltip';
import {TranslocoDirective} from '@jsverse/transloco';
import {Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';

import {Library} from '../../../book/model/library.model';
import {LibraryService} from '../../../book/service/library.service';
import {AppSettingsService} from '../../../../shared/service/app-settings.service';
import {AiPanelFlowStats} from '../../../../shared/model/app-settings.model';

interface DirectoryEntry {
  libraryId: number;
  libraryName: string;
  pathId: number;
  path: string;
  scanned: boolean;
  scanning: boolean;
}

interface LibraryOption {
  label: string;
  value: number | 'all';
}

@Component({
  selector: 'app-ai-scan-directory-dialog',
  standalone: true,
  imports: [
    Button,
    Checkbox,
    FormsModule,
    NgClass,
    Select,
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
  libraryOptions: LibraryOption[] = [];
  selectedLibraryId: number | 'all' = 'all';
  selectedPathIds = new Set<number>();
  rescanningPathId: number | null = null;

  ngOnInit(): void {
    const preselectedIds: number[] = this.dynamicDialogConfig.data?.selectedLibraryPathIds ?? [];
    preselectedIds.forEach(id => this.selectedPathIds.add(id));

    this.libraryService.libraryState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        const libraries = state.libraries ?? [];
        this.buildDirectoryList(libraries);
        this.buildLibraryOptions(libraries);

        if (this.selectedLibraryId === undefined) {
          this.selectedLibraryId = libraries.length > 0 ? libraries[0].id! : 'all';
        }

        this.applyFilter();
        this.fetchScanStatuses(libraries);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onLibraryChange(): void {
    this.applyFilter();
  }

  onConfirm(): void {
    this.dynamicDialogRef.close(Array.from(this.selectedPathIds));
  }

  onCancel(): void {
    this.dynamicDialogRef.close(null);
  }

  onRescan(entry: DirectoryEntry): void {
    if (this.rescanningPathId !== null) return;

    this.rescanningPathId = entry.pathId;
    entry.scanning = true;

    this.appSettingsService.scanMissingAiPanelData([entry.pathId]).subscribe({
      next: () => {
        entry.scanning = false;
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
  }

  get selectedCount(): number {
    return this.selectedPathIds.size;
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
          scanned: false,
          scanning: false
        });
      }
    }

    entries.sort((a, b) => a.path.localeCompare(b.path));
    this.allDirectories = entries;
  }

  private buildLibraryOptions(libraries: Library[]): void {
    const options: LibraryOption[] = [
      {label: 'All Libraries', value: 'all'}
    ];

    for (const library of libraries) {
      if (!library.id) continue;
      options.push({
        label: library.name,
        value: library.id
      });
    }

    this.libraryOptions = options;
  }

  private applyFilter(): void {
    if (this.selectedLibraryId === 'all') {
      this.filteredDirectories = [...this.allDirectories];
    } else {
      this.filteredDirectories = this.allDirectories.filter(
        d => d.libraryId === this.selectedLibraryId
      );
    }
  }

  private fetchScanStatuses(libraries: Library[]): void {
    for (const library of libraries) {
      if (!library.id) continue;
      this.appSettingsService.getAiPanelFlowStats(library.id).subscribe({
        next: (stats: AiPanelFlowStats) => {
          const hasScanned = stats.scannedComicCount > 0;
          for (const entry of this.allDirectories) {
            if (entry.libraryId === library.id) {
              entry.scanned = hasScanned;
            }
          }
        },
        error: () => {
          // If stats fail, leave scanned as false
        }
      });
    }
  }
}
