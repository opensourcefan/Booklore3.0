import {Component, inject, OnInit, OnDestroy} from '@angular/core';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {Checkbox} from 'primeng/checkbox';
import {Tooltip} from 'primeng/tooltip';
import {TranslocoDirective} from '@jsverse/transloco';
import {Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';

import {Library} from '../../../book/model/library.model';
import {LibraryService} from '../../../book/service/library.service';
import {AppSettingsService} from '../../../../shared/service/app-settings.service';

interface DirectoryEntry {
  libraryId: number;
  libraryName: string;
  pathId: number;
  path: string;
  scanning: boolean;
}

interface LibraryToggle {
  libraryId: number;
  libraryName: string;
  selected: boolean;
}

@Component({
  selector: 'app-ai-scan-directory-dialog',
  standalone: true,
  imports: [
    Button,
    Checkbox,
    FormsModule,
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
  libraryToggles: LibraryToggle[] = [];
  selectedPathIds = new Set<number>();
  rescanningPathId: number | null = null;

  ngOnInit(): void {
    this.libraryService.libraryState$
      .pipe(takeUntil(this.destroy$))
      .subscribe(state => {
        const libraries = state.libraries ?? [];
        this.buildDirectoryList(libraries);
        this.buildLibraryToggles(libraries);
        this.applyFilter();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleLibrary(libraryId: number): void {
    const toggle = this.libraryToggles.find(t => t.libraryId === libraryId);
    if (toggle) {
      toggle.selected = !toggle.selected;
    }
    this.applyFilter();
  }

  selectAllLibraries(): void {
    for (const toggle of this.libraryToggles) {
      toggle.selected = true;
    }
    this.applyFilter();
  }

  deselectAllLibraries(): void {
    for (const toggle of this.libraryToggles) {
      toggle.selected = false;
    }
    this.applyFilter();
  }

  selectAllDirectories(): void {
    for (const entry of this.filteredDirectories) {
      this.selectedPathIds.add(entry.pathId);
    }
  }

  deselectAllDirectories(): void {
    for (const entry of this.filteredDirectories) {
      this.selectedPathIds.delete(entry.pathId);
    }
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

  get selectedLibraryCount(): number {
    return this.libraryToggles.filter(t => t.selected).length;
  }

  get allLibrariesSelected(): boolean {
    return this.libraryToggles.length > 0 && this.libraryToggles.every(t => t.selected);
  }

  get allFilteredSelected(): boolean {
    return this.filteredDirectories.length > 0 && this.filteredDirectories.every(d => this.selectedPathIds.has(d.pathId));
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
          scanning: false
        });
      }
    }

    entries.sort((a, b) => a.path.localeCompare(b.path));
    this.allDirectories = entries;
  }

  private buildLibraryToggles(libraries: Library[]): void {
    const existingSelection = new Map<number, boolean>();
    for (const t of this.libraryToggles) {
      existingSelection.set(t.libraryId, t.selected);
    }

    this.libraryToggles = libraries
      .filter(l => typeof l.id === 'number')
      .map(l => ({
        libraryId: l.id!,
        libraryName: l.name,
        selected: existingSelection.has(l.id!) ? existingSelection.get(l.id!)! : false
      }));
  }

  private applyFilter(): void {
    const selectedIds = new Set(
      this.libraryToggles.filter(t => t.selected).map(t => t.libraryId)
    );

    if (selectedIds.size === 0) {
      this.filteredDirectories = [];
    } else {
      this.filteredDirectories = this.allDirectories.filter(
        d => selectedIds.has(d.libraryId)
      );
    }
  }
}
