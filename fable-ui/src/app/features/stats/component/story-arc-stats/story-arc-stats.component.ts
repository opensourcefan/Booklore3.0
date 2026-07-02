import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {combineLatest, Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import {RouterLink, RouterLinkActive} from '@angular/router';

import {StoryArcService} from '../../../story-arc/service/story-arc.service';
import {StoryArcSummary} from '../../../story-arc/model/story-arc.model';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {PageTitleService} from '../../../../shared/service/page-title.service';

@Component({
  selector: 'app-story-arc-stats',
  standalone: true,
  templateUrl: './story-arc-stats.component.html',
  styleUrls: ['./story-arc-stats.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe,
    RouterLink,
    RouterLinkActive
  ]
})
export class StoryArcStatsComponent implements OnInit {
  private storyArcService = inject(StoryArcService);
  private urlHelper = inject(UrlHelperService);
  private pageTitle = inject(PageTitleService);

  storyArcStats$: Observable<StoryArcSummary[]> = this.storyArcService.getStoryArcStats();

  totalArcs$: Observable<number> = this.storyArcStats$.pipe(map(arcs => arcs.length));
  
  totalBooks$: Observable<number> = this.storyArcStats$.pipe(
    map(arcs => arcs.reduce((sum, arc) => sum + arc.bookCount, 0))
  );

  totalReadBooks$: Observable<number> = this.storyArcStats$.pipe(
    map(arcs => arcs.reduce((sum, arc) => sum + arc.readBookCount, 0))
  );

  completedArcsCount$: Observable<number> = this.storyArcStats$.pipe(
    map(arcs => arcs.filter(a => a.bookCount > 0 && a.readBookCount === a.bookCount).length)
  );

  overallProgress$: Observable<number> = combineLatest([this.totalBooks$, this.totalReadBooks$]).pipe(
    map(([total, read]) => (total > 0 ? Math.round((read * 100) / total) : 0))
  );

  ngOnInit(): void {
    this.pageTitle.setPageTitle('Story Arc Stats');
    this.storyArcService.loadStoryArcs();
  }
}
