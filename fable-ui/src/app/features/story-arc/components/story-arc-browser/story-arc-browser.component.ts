import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Router} from '@angular/router';
import {BehaviorSubject, combineLatest, Observable, take} from 'rxjs';
import {map} from 'rxjs/operators';
import {MessageService} from 'primeng/api';
import {Button} from 'primeng/button';
import {Dialog} from 'primeng/dialog';
import {InputText} from 'primeng/inputtext';

import {StoryArcService} from '../../service/story-arc.service';
import {StoryArcSummary} from '../../model/story-arc.model';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {PageTitleService} from '../../../../shared/service/page-title.service';

@Component({
  selector: 'app-story-arc-browser',
  standalone: true,
  templateUrl: './story-arc-browser.component.html',
  styleUrls: ['./story-arc-browser.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe,
    FormsModule,
    InputText,
    Button,
    Dialog
  ]
})
export class StoryArcBrowserComponent implements OnInit {
  private storyArcService = inject(StoryArcService);
  private urlHelper = inject(UrlHelperService);
  private pageTitle = inject(PageTitleService);
  private router = inject(Router);
  private messageService = inject(MessageService);

  searchTerm$ = new BehaviorSubject<string>('');
  filteredArcs$!: Observable<StoryArcSummary[]>;

  createDialogVisible = false;
  newArcName = '';

  ngOnInit(): void {
    this.pageTitle.setPageTitle('Story Arcs');
    this.storyArcService.loadStoryArcs();

    this.filteredArcs$ = combineLatest([
      this.storyArcService.storyArcs$,
      this.searchTerm$
    ]).pipe(
      map(([arcs, search]) => {
        if (!search.trim()) {
          return arcs;
        }
        const term = search.trim().toLowerCase();
        return arcs.filter(arc => arc.storyArcName.toLowerCase().includes(term));
      })
    );
  }

  getThumbnail(coverBookId?: number): string {
    if (!coverBookId) {
      return 'assets/images/missing-cover.jpg';
    }
    return this.urlHelper.getDirectThumbnailUrl(coverBookId);
  }

  onSearchChange(value: string): void {
    this.searchTerm$.next(value);
  }

  navigateToArc(arc: StoryArcSummary): void {
    this.router.navigate(['/story-arc', arc.storyArcName]);
  }

  openCreateDialog(): void {
    this.newArcName = '';
    this.createDialogVisible = true;
  }

  closeCreateDialog(): void {
    this.createDialogVisible = false;
    this.newArcName = '';
  }

  confirmCreateArc(): void {
    const name = this.newArcName.trim();
    if (!name) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Name required',
        detail: 'Enter a name for the new story arc.'
      });
      return;
    }

    this.storyArcService.storyArcs$.pipe(take(1)).subscribe(arcs => {
      const duplicate = arcs.some(arc => arc.storyArcName.toLowerCase() === name.toLowerCase());
      if (duplicate) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Already exists',
          detail: `A story arc named "${name}" already exists.`
        });
        return;
      }

      this.createDialogVisible = false;
      this.newArcName = '';
      void this.router.navigate(['/story-arc', name], {
        state: {startInEditMode: true}
      });
    });
  }
}
