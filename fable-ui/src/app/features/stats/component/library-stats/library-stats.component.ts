import {Component, inject, OnDestroy, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {Observable, of, Subject} from 'rxjs';
import {catchError, map, shareReplay, startWith, switchMap, takeUntil} from 'rxjs/operators';
import {CdkDragDrop, DragDropModule, moveItemInArray} from '@angular/cdk/drag-drop';
import {RouterLink, RouterLinkActive} from '@angular/router';
import {Select} from 'primeng/select';
import {Button} from 'primeng/button';
import {LanguageChartComponent} from './charts/language-chart/language-chart.component';
import {BookFormatsChartComponent} from './charts/book-formats-chart/book-formats-chart.component';
import {MetadataScoreChartComponent} from './charts/metadata-score-chart/metadata-score-chart.component';
import {PageCountChartComponent} from './charts/page-count-chart/page-count-chart.component';
import {TopItemsChartComponent} from './charts/top-items-chart/top-items-chart.component';
import {AuthorUniverseChartComponent} from './charts/author-universe-chart/author-universe-chart.component';
import {PublicationTimelineChartComponent} from './charts/publication-timeline-chart/publication-timeline-chart.component';
import {PublicationTrendChartComponent} from './charts/publication-trend-chart/publication-trend-chart.component';
import {ReadingJourneyChartComponent} from './charts/reading-journey-chart/reading-journey-chart.component';
import {LibrariesSummaryService} from './service/libraries-summary.service';
import {LibraryFilterService, LibraryOption} from './service/library-filter.service';
import {TranslocoDirective, TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {AiPanelFlowBookHighlight, AiPanelFlowStats, AiSearchStatsSummary} from '../../../../shared/model/app-settings.model';
import {AppSettingsService} from '../../../../shared/service/app-settings.service';
import {StoryArcService} from '../../../story-arc/service/story-arc.service';
import {StoryArcSummary} from '../../../story-arc/model/story-arc.model';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';

interface ChartConfig {
  id: string;
  name: string;
  enabled: boolean;
  category: string;
}

@Component({
  selector: 'app-library-stats',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    Select,
    DragDropModule,
    RouterLink,
    RouterLinkActive,
    Button,
    BookFormatsChartComponent,
    LanguageChartComponent,
    MetadataScoreChartComponent,
    PageCountChartComponent,
    TopItemsChartComponent,
    AuthorUniverseChartComponent,
    PublicationTimelineChartComponent,
    PublicationTrendChartComponent,
    ReadingJourneyChartComponent,
    TranslocoDirective,
    TranslocoPipe
  ],
  templateUrl: './library-stats.component.html',
  styleUrls: ['./library-stats.component.scss']
})
export class LibraryStatsComponent implements OnInit, OnDestroy {
  private readonly libraryFilterService = inject(LibraryFilterService);
  private readonly librariesSummaryService = inject(LibrariesSummaryService);
  private readonly appSettingsService = inject(AppSettingsService);
  private readonly storyArcService = inject(StoryArcService);
  private readonly urlHelper = inject(UrlHelperService);

  storyArcs$: Observable<StoryArcSummary[]> = this.storyArcService.getStoryArcStats();
  public readonly totalArcs$ = this.storyArcs$.pipe(map(arcs => arcs.length));
  public readonly completedArcsCount$ = this.storyArcs$.pipe(map(arcs => arcs.filter(a => a.bookCount > 0 && a.readBookCount === a.bookCount).length));
  public readonly totalArcBooks$ = this.storyArcs$.pipe(map(arcs => arcs.reduce((acc, a) => acc + a.bookCount, 0)));
  public readonly overallArcProgress$ = this.storyArcs$.pipe(
    map(arcs => {
      const total = arcs.reduce((acc, a) => acc + a.bookCount, 0);
      const read = arcs.reduce((acc, a) => acc + a.readBookCount, 0);
      return total > 0 ? Math.round((read * 100) / total) : 0;
    })
  );
  private readonly t = inject(TranslocoService);
  private readonly destroy$ = new Subject<void>();

  public isLoading = true;
  public hasData = false;
  public hasError = false;
  public libraryOptions: LibraryOption[] = [];
  public selectedLibrary: LibraryOption | null = null;
  public showConfigPanel = false;

  public chartsConfig: ChartConfig[] = this.buildChartsConfig();

  booksSummary$ = this.librariesSummaryService.getBooksSummary().pipe(
    catchError(error => {
      console.error('Error loading books summary:', error);
      this.hasError = true;
      return of({totalBooks: 0, totalSizeKb: 0, totalAuthors: 0, totalSeries: 0, totalPublishers: 0});
    })
  );

  public readonly totalBooks$ = this.booksSummary$.pipe(map(summary => summary.totalBooks));
  public readonly totalAuthors$ = this.booksSummary$.pipe(map(summary => summary.totalAuthors));
  public readonly totalSeries$ = this.booksSummary$.pipe(map(summary => summary.totalSeries));
  public readonly totalPublishers$ = this.booksSummary$.pipe(map(summary => summary.totalPublishers));
  public readonly totalSize$ = this.librariesSummaryService.getFormattedSize().pipe(catchError(() => of('0 KB')));
  public readonly aiPanelFlowStats$ = this.librariesSummaryService.getAiPanelFlowStats().pipe(
    catchError(() => of(this.createEmptyAiPanelFlowStats())),
    shareReplay(1)
  );
  public readonly aiSearchStatsSummary$ = this.librariesSummaryService.getAiSearchStatsSummary().pipe(
    catchError(() => of(this.createEmptyAiSearchStatsSummary())),
    shareReplay(1)
  );

  public readonly aiPanelFlowStatsState$ = this.libraryFilterService.selectedLibrary$.pipe(
    switchMap(selectedLibraryId =>
      this.appSettingsService.getAiPanelFlowStats(selectedLibraryId).pipe(
        map(data => ({ loading: false, data })),
        catchError(() => of({ loading: false, data: this.createEmptyAiPanelFlowStats() })),
        startWith({ loading: true, data: null })
      )
    ),
    shareReplay(1)
  );

  public readonly aiSearchStatsState$ = this.libraryFilterService.selectedLibrary$.pipe(
    switchMap(selectedLibraryId => {
      this.storyArcService.loadStoryArcs();
      return this.appSettingsService.getAiSearchStatsSummary(selectedLibraryId).pipe(
        map(data => ({ loading: false, data })),
        catchError(() => of({ loading: false, data: this.createEmptyAiSearchStatsSummary() })),
        startWith({ loading: true, data: null })
      );
    }),
    shareReplay(1)
  );
  public readonly totalAiScannedComics$ = this.aiPanelFlowStats$.pipe(map(stats => stats.scannedComicCount));
  public readonly totalAiStorage$ = this.librariesSummaryService.getFormattedAiStorage().pipe(catchError(() => of('0 B')));

  public readonly llmProfiles$ = this.appSettingsService.getAiLlmProfiles().pipe(
    catchError(() => of([]))
  );

  public readonly embeddingModels$ = this.appSettingsService.getAiEmbeddingModels().pipe(
    map(res => res.models || []),
    catchError(() => of([]))
  );

  public readonly llmModels$ = this.appSettingsService.getAiLlmModels().pipe(
    map(res => res.models || []),
    catchError(() => of([]))
  );

  public readonly totalEmbeddingModelStorage$ = this.embeddingModels$.pipe(
    map(models => this.formatBytes(models.reduce((sum, m) => sum + (m.sizeBytes || 0), 0)))
  );

  public readonly totalLlmModelStorage$ = this.llmModels$.pipe(
    map(models => this.formatBytes(models.reduce((sum, m) => sum + (m.sizeBytes || 0), 0)))
  );

  public readonly totalAiSearchStorage$ = this.librariesSummaryService.getFormattedAiSearchStorage().pipe(catchError(() => of('0 B')));

  public formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    const digits = value >= 10 || unitIndex === 0 ? 0 : 1;
    return `${value.toFixed(digits)} ${units[unitIndex]}`;
  }

  public hasAiPanelFlowData(stats: AiPanelFlowStats | null | undefined): boolean {
    return !!stats && stats.scannedComicCount > 0;
  }

  public getBookReturnQueryParams(): {tab: string; returnTo: string} {
    return {tab: 'view', returnTo: '/library-stats'};
  }

  public getAiLeaderSubtitleKey(kind: 'pages' | 'panels' | 'density'): string {
    switch (kind) {
      case 'pages':
        return 'aiPanelStats.leaderPagesSubtitle';
      case 'panels':
        return 'aiPanelStats.leaderPanelsSubtitle';
      default:
        return 'aiPanelStats.leaderDensitySubtitle';
    }
  }

  public getAiLeaderSubtitleParams(leader: AiPanelFlowBookHighlight): Record<string, number> {
    return {
      pages: leader.pageCount,
      panels: leader.panelCount,
      ratio: leader.panelsPerPage
    };
  }

  ngOnInit(): void {
    this.loadLibraryOptions();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onLibraryChange(): void {
    if (!this.selectedLibrary) {
      return;
    }
    const libraryId = this.selectedLibrary.id;
    this.libraryFilterService.setSelectedLibrary(libraryId);
  }

  private loadLibraryOptions(): void {
    this.libraryFilterService.getLibraryOptions()
      .pipe(
        takeUntil(this.destroy$),
        startWith([]),
        catchError(error => {
          console.error('Error loading library options:', error);
          this.hasError = true;
          this.isLoading = false;
          return of([]);
        })
      )
      .subscribe({
        next: (options) => {
          this.libraryOptions = options;
          this.initializeSelectedLibrary(options);
        },
        error: (error) => {
          console.error('Subscription error:', error);
          this.hasError = true;
          this.isLoading = false;
        }
      });
  }

  private initializeSelectedLibrary(options: LibraryOption[]): void {
    if (options.length === 0) {
      this.hasData = false;
      this.isLoading = false;
      return;
    }

    if (!this.selectedLibrary) {
      this.hasData = true;
      this.isLoading = false;
      this.selectedLibrary = options[0];
      this.libraryFilterService.setSelectedLibrary(this.selectedLibrary.id);
    }
  }

  public toggleConfigPanel(): void {
    this.showConfigPanel = !this.showConfigPanel;
  }

  public closeConfigPanel(): void {
    this.showConfigPanel = false;
  }

  public toggleChart(chartId: string): void {
    const chart = this.chartsConfig.find(c => c.id === chartId);
    if (chart) {
      chart.enabled = !chart.enabled;
    }
  }

  public isChartEnabled(chartId: string): boolean {
    return this.chartsConfig.find(c => c.id === chartId)?.enabled ?? false;
  }

  public enableAllCharts(): void {
    this.chartsConfig.forEach(chart => chart.enabled = true);
  }

  public disableAllCharts(): void {
    this.chartsConfig.forEach(chart => chart.enabled = false);
  }

  public getChartsByCategory(category: string): ChartConfig[] {
    return this.chartsConfig.filter(chart => chart.category === category);
  }

  public getEnabledChartsSorted(): ChartConfig[] {
    return this.chartsConfig.filter(chart => chart.enabled);
  }

  public onChartReorder(event: CdkDragDrop<ChartConfig[]>): void {
    if (event.previousIndex !== event.currentIndex) {
      moveItemInArray(this.chartsConfig, event.previousIndex, event.currentIndex);
    }
  }

  public resetChartOrder(): void {
    this.chartsConfig = this.buildChartsConfig();
  }

  private buildChartsConfig(): ChartConfig[] {
    return [
      {id: 'bookFormats', name: this.t.translate('statsLibrary.chartNames.bookFormats'), enabled: true, category: 'small'},
      {id: 'languageDistribution', name: this.t.translate('statsLibrary.chartNames.languages'), enabled: true, category: 'small'},
      {id: 'metadataScore', name: this.t.translate('statsLibrary.chartNames.metadataScore'), enabled: true, category: 'small'},
      {id: 'pageCountDistribution', name: this.t.translate('statsLibrary.chartNames.pageCount'), enabled: true, category: 'small'},
      {id: 'publicationTimeline', name: this.t.translate('statsLibrary.chartNames.publicationTimeline'), enabled: true, category: 'large'},
      {id: 'readingJourney', name: this.t.translate('statsLibrary.chartNames.readingJourney'), enabled: true, category: 'large'},
      {id: 'topItems', name: this.t.translate('statsLibrary.chartNames.topItems'), enabled: true, category: 'large'},
      {id: 'authorUniverse', name: this.t.translate('statsLibrary.chartNames.authorUniverse'), enabled: true, category: 'large'},
      {id: 'publicationTrend', name: this.t.translate('statsLibrary.chartNames.publicationTrend'), enabled: true, category: 'xlarge'}
    ];
  }

  private createEmptyAiPanelFlowStats(): AiPanelFlowStats {
    return {
      scannedComicCount: 0,
      totalPagesScanned: 0,
      totalPanelsMapped: 0,
      storedBytes: 0,
      comicWithMostPagesScanned: null,
      comicWithMostPanelsMapped: null,
      comicWithHighestPanelsPerPage: null
    };
  }

  private createEmptyAiSearchStatsSummary(): AiSearchStatsSummary {
    return {
      totalEmbeddedBooks: 0,
      totalChunks: 0,
      markedCount: 0,
      modelStats: []
    };
  }

  getThumbnail(coverBookId?: number): string {
    if (!coverBookId) {
      return 'assets/images/default-cover.png';
    }
    return this.urlHelper.getDirectThumbnailUrl(coverBookId);
  }
}
