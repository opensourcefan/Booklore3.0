import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BehaviorSubject, of} from 'rxjs';
import {convertToParamMap} from '@angular/router';
import {TestBed} from '@angular/core/testing';

import {CbxReaderComponent} from './cbx-reader.component';
import {ActivatedRoute, Router} from '@angular/router';
import {PageTitleService} from '../../../shared/service/page-title.service';
import {CbxReaderService} from '../../book/service/cbx-reader.service';
import {BookService} from '../../book/service/book.service';
import {UserService} from '../../settings/user-management/user.service';
import {MessageService} from 'primeng/api';
import {TranslocoService} from '@jsverse/transloco';
import {ReadingSessionService} from '../../../shared/service/reading-session.service';
import {CbxHeaderService} from './layout/header/cbx-header.service';
import {CbxSidebarService} from './layout/sidebar/cbx-sidebar.service';
import {CbxFooterService} from './layout/footer/cbx-footer.service';
import {CbxQuickSettingsService} from './layout/quick-settings/cbx-quick-settings.service';
import {AppSettingsService} from '../../../shared/service/app-settings.service';
import {ComicPanelFlowService} from '../../../shared/service/comic-panel-flow.service';
import {AiPanelScanProgressService} from '../../../shared/service/ai-panel-scan-progress.service';
import {CbxPageViewMode, CbxScrollMode} from '../../settings/user-management/user.service';

describe('CbxReaderComponent mobile panel interactions', () => {
  let component: CbxReaderComponent;

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'innerWidth', {configurable: true, writable: true, value: 390});
    Object.defineProperty(window, 'innerHeight', {configurable: true, writable: true, value: 844});

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({bookId: '1'})),
            snapshot: {queryParamMap: {get: vi.fn(() => null)}}
          }
        },
        {provide: Router, useValue: {navigate: vi.fn()}},
        {provide: PageTitleService, useValue: {setBookPageTitle: vi.fn()}},
        {provide: CbxReaderService, useValue: {getAvailablePages: vi.fn(), getPageImageUrl: vi.fn(() => 'page.png')}},
        {
          provide: BookService,
          useValue: {
            getBookByIdFromAPI: vi.fn(),
            getBookSetting: vi.fn(),
            updateViewerSetting: vi.fn(() => of({})),
            saveCbxProgress: vi.fn(() => of({})),
            bookState$: of({loaded: true}),
            getBooksInSeries: vi.fn(() => of([]))
          }
        },
        {provide: UserService, useValue: {getMyself: vi.fn()}},
        {provide: MessageService, useValue: {add: vi.fn(), clear: vi.fn()}},
        {provide: TranslocoService, useValue: {translate: vi.fn((key: string) => key)}},
        {
          provide: ReadingSessionService,
          useValue: {
            startSession: vi.fn(),
            updateProgress: vi.fn(),
            endSession: vi.fn(),
            isSessionActive: vi.fn(() => false)
          }
        },
        {
          provide: CbxHeaderService,
          useValue: {
            forceVisible$: new BehaviorSubject(false),
            state$: new BehaviorSubject({isFullscreen: false, isSlideshowActive: false, isMagnifierActive: false, isPanelModeEnabled: false}),
            updateState: vi.fn(),
            setForceVisible: vi.fn()
          }
        },
        {
          provide: CbxSidebarService,
          useValue: {
            navigateToPage$: of(),
            bookmarksChanged$: of(),
            bookmarks$: of(),
            notes$: of(),
            editNote$: of(),
            initialize: vi.fn(),
            setCurrentPage: vi.fn(),
            isPageBookmarked: vi.fn(() => false),
            pageHasNotes: vi.fn(() => false),
            toggleBookmark: vi.fn(),
            updateNote: vi.fn(),
            createNote: vi.fn()
          }
        },
        {
          provide: CbxFooterService,
          useValue: {
            forceVisible$: new BehaviorSubject(false),
            previousPage$: of(),
            nextPage$: of(),
            goToPage$: of(),
            firstPage$: of(),
            lastPage$: of(),
            previousBook$: of(),
            nextBook$: of(),
            sliderChange$: of(),
            updateState: vi.fn(),
            setCurrentPage: vi.fn(),
            setForceVisible: vi.fn(),
            setTwoPageView: vi.fn(),
            setSeriesBooks: vi.fn(),
            setHasSeries: vi.fn()
          }
        },
        {
          provide: CbxQuickSettingsService,
          useValue: {
            fitModeChange$: of(),
            scrollModeChange$: of(),
            pageViewModeChange$: of(),
            pageSpreadChange$: of(),
            backgroundColorChange$: of(),
            readingDirectionChange$: of(),
            slideshowIntervalChange$: of(),
            magnifierZoomChange$: of(),
            magnifierLensSizeChange$: of(),
            updateState: vi.fn(),
            setFitMode: vi.fn(),
            setScrollMode: vi.fn(),
            setPageViewMode: vi.fn(),
            setPageSpread: vi.fn(),
            setBackgroundColor: vi.fn(),
            setReadingDirection: vi.fn(),
            setSlideshowInterval: vi.fn(),
            setMagnifierZoom: vi.fn(),
            setMagnifierLensSize: vi.fn(),
            close: vi.fn(),
            show: vi.fn(),
            isVisible: false
          }
        },
        {provide: AppSettingsService, useValue: {appSettings$: of(null), getAiServiceStatus: vi.fn(), cleanupAiPanelData: vi.fn()}},
        {provide: ComicPanelFlowService, useValue: {scanPanelFlow: vi.fn(), getPanelFlow: vi.fn(), deletePanelFlow: vi.fn()}},
        {
          provide: AiPanelScanProgressService,
          useValue: {
            progress$: of(null),
            updateReaderToast: vi.fn(),
            buildStatusText: vi.fn(() => 'running')
          }
        }
      ]
    });

    component = TestBed.runInInjectionContext(() => new CbxReaderComponent());
    component.currentImageUrls = ['page.png'];
    component.scrollMode = CbxScrollMode.PAGINATED;
    component.pageViewMode = CbxPageViewMode.SINGLE_PAGE;
    component.pages = [1, 2, 3];
    component.panelModeEnabled = true;

    const panels = [
      {x: 0.1, y: 0.1, width: 0.3, height: 0.3},
      {x: 0.55, y: 0.1, width: 0.25, height: 0.3}
    ];
    (component as any).detectedPanelsByPage.set(0, panels);
  });

  it('activates the first panel when zoom-in is requested before panel navigation starts', () => {
    component.activePanelIndex = -1;

    component.onPanelZoomInRequested();

    expect(component.activePanelIndex).toBe(0);
    expect(component.panelManualZoom).toBeGreaterThan(1);
  });

  it('shows the mobile panel preview only after panel navigation is invoked', () => {
    component.activePanelIndex = -1;

    component.onImageClick();
    expect(component.showMobilePanelOverview).toBe(false);

    component.nextPage();

    expect(component.activePanelIndex).toBe(0);
    expect(component.showMobilePanelOverview).toBe(true);

    vi.advanceTimersByTime(500);
    expect(component.showMobilePanelOverview).toBe(false);
  });

  it('keeps manual zoom when moving between panels and pages', () => {
    (component as any).detectedPanelsByPage.set(1, [
      {x: 0.12, y: 0.14, width: 0.3, height: 0.3}
    ]);
    component.activePanelIndex = 0;
    component.panelManualZoom = 1.8;
    component.panelPanX = 28;
    component.panelPanY = -16;

    component.nextPage();

    expect(component.activePanelIndex).toBe(1);
    expect(component.panelManualZoom).toBe(1.8);
    expect(component.panelPanX).toBe(0);
    expect(component.panelPanY).toBe(0);

    component.goToPage(2);

    expect(component.currentPage).toBe(1);
    expect(component.activePanelIndex).toBe(-1);
    expect(component.panelManualZoom).toBe(1.8);
  });

  it('uses two-finger movement to zoom and pan the active panel', () => {
    component.activePanelIndex = -1;

    component.onTouchStart({
      target: {closest: () => true},
      touches: [
        {screenX: 100, screenY: 120, clientX: 100, clientY: 120},
        {screenX: 180, screenY: 120, clientX: 180, clientY: 120}
      ]
    } as unknown as TouchEvent);

    const preventDefault = vi.fn();
    component.onTouchMove({
      touches: [
        {screenX: 90, screenY: 105, clientX: 90, clientY: 105},
        {screenX: 210, screenY: 145, clientX: 210, clientY: 145}
      ],
      preventDefault
    } as unknown as TouchEvent);

    expect(component.activePanelIndex).toBe(0);
    expect(component.panelManualZoom).toBeGreaterThan(1);
    expect(component.panelPanX).not.toBe(0);
    expect(component.panelPanY).not.toBe(0);
    expect(preventDefault).toHaveBeenCalled();
  });
});