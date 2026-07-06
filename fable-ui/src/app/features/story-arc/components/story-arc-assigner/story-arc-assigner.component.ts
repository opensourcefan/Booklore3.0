import {Component, inject, OnInit} from '@angular/core';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {MessageService} from 'primeng/api';
import {StoryArcService} from '../../service/story-arc.service';
import {AsyncPipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {InputText} from 'primeng/inputtext';
import {Select} from 'primeng/select';
import {CheckboxModule} from 'primeng/checkbox';
import {map, Observable, of} from 'rxjs';

@Component({
  selector: 'app-story-arc-assigner',
  standalone: true,
  templateUrl: './story-arc-assigner.component.html',
  styleUrls: ['./story-arc-assigner.component.scss'],
  imports: [
    AsyncPipe,
    FormsModule,
    Button,
    InputText,
    Select,
    CheckboxModule
  ]
})
export class StoryArcAssignerComponent implements OnInit {
  private storyArcService = inject(StoryArcService);
  private dynamicDialogConfig = inject(DynamicDialogConfig);
  private dynamicDialogRef = inject(DynamicDialogRef);
  private messageService = inject(MessageService);

  bookIds: Set<number> = this.dynamicDialogConfig.data.bookIds;
  storyArcs$ = this.storyArcService.storyArcs$;

  selectedArcName = '';
  customArcName = '';
  isNewArc = false;
  // Chapter targeting
  targetChapterIndex: number | null = null;
  newChapterName = '';
  isNewChapter = false;
  // Position for new chapter: "above" or "below" the target
  newChapterPosition: 'above' | 'below' = 'below';
  // Auto-group by series
  groupBySeries = false;

  // Chapter options for the selected arc
  chapterOptions$: Observable<{ label: string; value: number }[]> = of([]);

  ngOnInit(): void {
    this.storyArcService.loadStoryArcs();
  }

  toggleArcMode(isNew: boolean): void {
    this.isNewArc = isNew;
    if (isNew) {
      this.selectedArcName = '';
      this.targetChapterIndex = null;
      this.chapterOptions$ = of([]);
    }
  }

  onArcSelected(arcName: string): void {
    this.selectedArcName = arcName;
    this.targetChapterIndex = null;
    this.isNewChapter = false;
    this.newChapterName = '';
    // Load chapter options for the selected arc
    this.chapterOptions$ = this.storyArcService.getStoryArc(arcName).pipe(
      map(mappings => {
        // Collect all row indices and titles from both real mappings and empty row sentinels
        const rowMap = new Map<number, string>();
        mappings.forEach(m => {
          const rIdx = m.rowIndex ?? 0;
          if (!rowMap.has(rIdx)) {
            rowMap.set(rIdx, m.rowTitle || `Chapter ${rIdx + 1}`);
          }
        });
        const options = Array.from(rowMap.entries())
          .sort(([a], [b]) => a - b)
          .map(([idx, title]) => ({ label: title, value: idx }));
        // Add "New Chapter" option
        options.push({ label: '+ New Chapter', value: -1 });
        return options;
      })
    );
  }

  onChapterSelected(value: number): void {
    if (value === -1) {
      this.isNewChapter = true;
      this.targetChapterIndex = null;
    } else {
      this.isNewChapter = false;
      this.targetChapterIndex = value;
      this.newChapterName = '';
    }
  }

  applyAssignment(): void {
    const name = this.isNewArc ? this.customArcName.trim() : this.selectedArcName;
    if (!name) {
      this.messageService.add({severity: 'warn', summary: 'Warning', detail: 'Please specify a Story Arc name'});
      return;
    }

    const bookIdList = Array.from(this.bookIds);

    // Build request with optional chapter targeting and auto-grouping
    const request: {
      storyArcName: string;
      bookIds: number[];
      targetRowIndex?: number;
      rowTitle?: string;
      groupBySeries?: boolean;
      position?: string;
    } = {
      storyArcName: name,
      bookIds: bookIdList
    };

    if (this.groupBySeries) {
      request.groupBySeries = true;
    } else if (this.isNewChapter && this.newChapterName.trim()) {
      // Create a new chapter above or below the selected target
      request.targetRowIndex = this.targetChapterIndex ?? -1;
      request.rowTitle = this.newChapterName.trim();
      request.position = this.newChapterPosition;
    } else if (this.targetChapterIndex != null && this.targetChapterIndex >= 0) {
      request.targetRowIndex = this.targetChapterIndex;
    }

    this.storyArcService.bulkAdd(request).subscribe({
      next: () => {
        this.messageService.add({severity: 'success', summary: 'Success', detail: `Added ${bookIdList.length} books to "${name}"`});
        this.dynamicDialogRef.close({assigned: true});
      },
      error: () => {
        this.messageService.add({severity: 'error', summary: 'Error', detail: 'Failed to assign books to Story Arc'});
      }
    });
  }

  closeDialog(): void {
    this.dynamicDialogRef.close({assigned: false});
  }
}
