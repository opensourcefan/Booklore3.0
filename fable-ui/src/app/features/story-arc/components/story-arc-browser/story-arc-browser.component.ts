import {ChangeDetectionStrategy, Component, inject, OnInit} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Router} from '@angular/router';
import {BehaviorSubject, combineLatest, Observable} from 'rxjs';
import {map} from 'rxjs/operators';

import {StoryArcService} from '../../service/story-arc.service';
import {StoryArcSummary} from '../../model/story-arc.model';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {PageTitleService} from '../../../../shared/service/page-title.service';
import {InputText} from 'primeng/inputtext';

@Component({
  selector: 'app-story-arc-browser',
  standalone: true,
  templateUrl: './story-arc-browser.component.html',
  styleUrls: ['./story-arc-browser.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe,
    FormsModule,
    InputText
  ]
})
export class StoryArcBrowserComponent implements OnInit {
  private storyArcService = inject(StoryArcService);
  private urlHelper = inject(UrlHelperService);
  private pageTitle = inject(PageTitleService);
  private router = inject(Router);

  searchTerm$ = new BehaviorSubject<string>('');
  filteredArcs$!: Observable<StoryArcSummary[]>;

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
}
