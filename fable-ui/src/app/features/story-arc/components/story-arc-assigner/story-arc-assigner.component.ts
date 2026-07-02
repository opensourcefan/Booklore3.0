import {Component, inject, OnInit} from '@angular/core';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {MessageService} from 'primeng/api';
import {StoryArcService} from '../../service/story-arc.service';
import {AsyncPipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {InputText} from 'primeng/inputtext';
import {Select} from 'primeng/select';

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
    Select
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

  ngOnInit(): void {
    this.storyArcService.loadStoryArcs();
  }

  toggleArcMode(isNew: boolean): void {
    this.isNewArc = isNew;
  }

  applyAssignment(): void {
    const name = this.isNewArc ? this.customArcName.trim() : this.selectedArcName;
    if (!name) {
      this.messageService.add({severity: 'warn', summary: 'Warning', detail: 'Please specify a Story Arc name'});
      return;
    }

    const bookIdList = Array.from(this.bookIds);
    this.storyArcService.bulkAdd({
      storyArcName: name,
      bookIds: bookIdList
    }).subscribe({
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
