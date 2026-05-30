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
            toggleCurrentPageBookmark$: of(),
            openNewNoteDialog$: of(),
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
            zoomChange$: of(),
            updateState: vi.fn(),
            setCurrentPage: vi.fn(),
            setForceVisible: vi.fn(),
            setTwoPageView: vi.fn(),
            setSeriesBooks: vi.fn(),
            setHasSeries: vi.fn(),
            setManualPageZoom: vi.fn()
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
            joystickEnabledChange$: of(),
            joystickSensitivityChange$: of(),
            joystickPositionLockedChange$: of(),
            joystickRecenterOnTouchChange$: of(),
            joystickIndicatorVisibleChange$: of(),
            joystickIndicatorOpacityChange$: of(),
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
            setJoystickEnabled: vi.fn(),
            setJoystickSensitivity: vi.fn(),
            setJoystickPositionLocked: vi.fn(),
            setJoystickRecenterOnTouch: vi.fn(),
            setJoystickIndicatorVisible: vi.fn(),
            setJoystickIndicatorOpacity: vi.fn(),
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
    (component as unknown as { detectedPanelsByPage: Map<number, {x: number; y: number; width: number; height: number}[]> }).detectedPanelsByPage.set(0, panels);
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
    (component as unknown as { detectedPanelsByPage: Map<number, {x: number; y: number; width: number; height: number}[]> }).detectedPanelsByPage.set(1, [
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
    const containerElement = {
      getBoundingClientRect: () => ({left: 0, top: 0, width: 390, height: 700}),
      querySelector: () => ({
        getBoundingClientRect: () => ({left: 0, top: 0, width: 700, height: 1300})
      })
    };
    (component as unknown as { imageContainerRef: { nativeElement: unknown } }).imageContainerRef = {nativeElement: containerElement};

    component.activePanelIndex = -1;

    component.onTouchStart({
      target: {closest: (selector: string) => selector === '.image-container'},
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

  it('supports two-finger pinch zoom and pan outside panel mode', () => {
    const containerElement = {
      getBoundingClientRect: () => ({left: 0, top: 0, width: 390, height: 700}),
      querySelector: () => ({
        getBoundingClientRect: () => ({left: 0, top: 0, width: 700, height: 1300})
      })
    };
    (component as unknown as { imageContainerRef: { nativeElement: unknown } }).imageContainerRef = {nativeElement: containerElement};

    component.panelModeEnabled = false;
    component.activePanelIndex = -1;

    component.onTouchStart({
      target: {closest: (selector: string) => selector === '.image-container'},
      touches: [
        {screenX: 100, screenY: 160, clientX: 100, clientY: 160},
        {screenX: 200, screenY: 160, clientX: 200, clientY: 160}
      ]
    } as unknown as TouchEvent);

    const preventDefault = vi.fn();
    component.onTouchMove({
      touches: [
        {screenX: 90, screenY: 145, clientX: 90, clientY: 145},
        {screenX: 245, screenY: 210, clientX: 245, clientY: 210}
      ],
      preventDefault
    } as unknown as TouchEvent);

    expect(component.manualPageZoom).toBeGreaterThan(1);
    expect(component.manualPagePanX).not.toBe(0);
    expect(component.manualPagePanY).not.toBe(0);
    expect(preventDefault).toHaveBeenCalled();
  });

  it('keeps swipe navigation working in non-panel mode', () => {
    component.panelModeEnabled = false;
    component.activePanelIndex = -1;
    component.currentPage = 0;

    component.onTouchStart({
      target: {closest: (selector: string) => selector === '.image-container'},
      touches: [{screenX: 260, screenY: 220}]
    } as unknown as TouchEvent);

    component.onTouchMove({
      touches: [{screenX: 130, screenY: 225}]
    } as unknown as TouchEvent);

    component.onTouchEnd({
      changedTouches: [{screenX: 120, screenY: 225}]
    } as unknown as TouchEvent);

    expect(component.currentPage).toBe(1);
  });

  it('does not trigger swipe navigation at the end of a two-finger gesture', () => {
    component.panelModeEnabled = false;
    component.activePanelIndex = -1;
    component.currentPage = 0;

    component.onTouchStart({
      target: {closest: (selector: string) => selector === '.image-container'},
      touches: [
        {screenX: 120, screenY: 200, clientX: 120, clientY: 200},
        {screenX: 220, screenY: 200, clientX: 220, clientY: 200}
      ]
    } as unknown as TouchEvent);

    component.onTouchMove({
      touches: [
        {screenX: 105, screenY: 185, clientX: 105, clientY: 185},
        {screenX: 255, screenY: 230, clientX: 255, clientY: 230}
      ],
      preventDefault: vi.fn()
    } as unknown as TouchEvent);

    component.onTouchEnd({
      changedTouches: [{screenX: 80, screenY: 180}]
    } as unknown as TouchEvent);

    expect(component.currentPage).toBe(0);
  });

  it('does not force mobile chrome when header/footer are pinned', () => {
    const headerService = TestBed.inject(CbxHeaderService) as unknown as { setForceVisible: ReturnType<typeof vi.fn> };
    const footerService = TestBed.inject(CbxFooterService) as unknown as { setForceVisible: ReturnType<typeof vi.fn> };

    component.isHeaderFooterPinned = true;
    component.onImageClick();

    expect(headerService.setForceVisible).not.toHaveBeenCalled();
    expect(footerService.setForceVisible).not.toHaveBeenCalled();
  });

  it('persists joystick enabled state in device storage', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    component.toggleJoystickEnabled();

    expect(component.joystickEnabled).toBe(true);
    expect(setItemSpy).toHaveBeenCalled();

    setItemSpy.mockRestore();
  });

  it('repositions joystick when position lock is disabled', () => {
    component.joystickEnabled = true;
    component.joystickPositionLocked = false;

    const containerElement = {
      getBoundingClientRect: () => ({left: 0, top: 0, width: 400, height: 800}),
      querySelector: () => null
    };
    (component as unknown as { imageContainerRef: { nativeElement: unknown } }).imageContainerRef = {nativeElement: containerElement};

    const pointerTarget = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn()
    };

    component.onJoystickPointerDown({
      pointerId: 11,
      clientX: 380,
      clientY: 640,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: pointerTarget
    } as unknown as PointerEvent);

    component.onJoystickPointerMove({
      pointerId: 11,
      clientX: 300,
      clientY: 560,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as PointerEvent);

    expect(component.joystickAnchorX).toBeCloseTo(0.75, 2);
    expect(component.joystickAnchorY).toBeCloseTo(0.7, 2);

    component.onJoystickPointerUp({
      pointerId: 11,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: pointerTarget
    } as unknown as PointerEvent);
  });

  it('recenters joystick touch within the current quadrant when enabled', () => {
    component.joystickEnabled = true;
    component.joystickPositionLocked = true;
    component.joystickRecenterOnTouch = true;
    component.joystickAnchorX = 0.86;
    component.joystickAnchorY = 0.78;

    const containerElement = {
      getBoundingClientRect: () => ({left: 0, top: 0, width: 400, height: 800}),
      querySelector: () => null
    };
    (component as unknown as { imageContainerRef: { nativeElement: unknown } }).imageContainerRef = {nativeElement: containerElement};

    const pointerTarget = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn()
    };

    component.onJoystickPointerDown({
      pointerId: 22,
      clientX: 80,
      clientY: 720,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: pointerTarget
    } as unknown as PointerEvent);

    expect(component.joystickAnchorX).toBeGreaterThanOrEqual(0.5);
    expect(component.joystickAnchorY).toBeGreaterThanOrEqual(0.5);

    component.onJoystickPointerUp({
      pointerId: 22,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: pointerTarget
    } as unknown as PointerEvent);
  });

  it('dampens joystick movement immediately after touch down', () => {
    const containerElement = {
      getBoundingClientRect: () => ({left: 0, top: 0, width: 390, height: 700}),
      querySelector: () => ({
        getBoundingClientRect: () => ({left: 0, top: 0, width: 700, height: 1300})
      })
    };
    (component as unknown as { imageContainerRef: { nativeElement: unknown } }).imageContainerRef = {nativeElement: containerElement};

    component.panelModeEnabled = false;
    component.activePanelIndex = -1;
    component.scrollMode = CbxScrollMode.PAGINATED;

    component.joystickKnobX = 30;
    component.joystickKnobY = 0;

    const joystickInternals = component as unknown as {
      joystickVelocityX: number;
      joystickVelocityY: number;
      joystickInteractionStartMs: number;
      applyJoystickMotionStep: () => void;
    };

    joystickInternals.joystickVelocityX = 0;
    joystickInternals.joystickVelocityY = 0;
    joystickInternals.joystickInteractionStartMs = Date.now();
    joystickInternals.applyJoystickMotionStep();
    const firstTouchDelta = Math.abs(component.manualPagePanX);

    component.manualPagePanX = 0;
    component.manualPagePanY = 0;
    joystickInternals.joystickVelocityX = 0;
    joystickInternals.joystickVelocityY = 0;
    joystickInternals.joystickInteractionStartMs = Date.now() - 500;
    joystickInternals.applyJoystickMotionStep();
    const settledTouchDelta = Math.abs(component.manualPagePanX);

    expect(firstTouchDelta).toBeGreaterThan(0);
    expect(settledTouchDelta).toBeGreaterThan(firstTouchDelta * 1.5);
  });

  it('dampens cross-axis drift while preserving motion when horizontal intent is dominant', () => {
    const containerElement = {
      getBoundingClientRect: () => ({left: 0, top: 0, width: 390, height: 700}),
      querySelector: () => ({
        getBoundingClientRect: () => ({left: 0, top: 0, width: 700, height: 1300})
      })
    };
    (component as unknown as { imageContainerRef: { nativeElement: unknown } }).imageContainerRef = {nativeElement: containerElement};

    component.panelModeEnabled = false;
    component.activePanelIndex = -1;
    component.scrollMode = CbxScrollMode.PAGINATED;
    component.manualPagePanX = 0;
    component.manualPagePanY = 0;

    const joystickInternals = component as unknown as {
      joystickVelocityX: number;
      joystickVelocityY: number;
      joystickInteractionStartMs: number;
      joystickAxisIntent: 'none' | 'horizontal' | 'vertical';
      applyJoystickMotionStep: () => void;
    };

    component.joystickKnobX = 28;
    component.joystickKnobY = 7;
    joystickInternals.joystickVelocityX = 0;
    joystickInternals.joystickVelocityY = 0;
    joystickInternals.joystickInteractionStartMs = Date.now() - 600;
    joystickInternals.joystickAxisIntent = 'none';
    joystickInternals.applyJoystickMotionStep();

    expect(joystickInternals.joystickAxisIntent).toBe('horizontal');
    expect(Math.abs(component.manualPagePanX)).toBeGreaterThan(0);
    expect(Math.abs(component.manualPagePanY)).toBeGreaterThan(0);
    expect(Math.abs(component.manualPagePanY)).toBeLessThan(Math.abs(component.manualPagePanX) * 0.45);
  });

  it('keeps diagonal joystick movement available for intentional diagonal input', () => {
    const containerElement = {
      getBoundingClientRect: () => ({left: 0, top: 0, width: 390, height: 700}),
      querySelector: () => ({
        getBoundingClientRect: () => ({left: 0, top: 0, width: 700, height: 1300})
      })
    };
    (component as unknown as { imageContainerRef: { nativeElement: unknown } }).imageContainerRef = {nativeElement: containerElement};

    component.panelModeEnabled = false;
    component.activePanelIndex = -1;
    component.scrollMode = CbxScrollMode.PAGINATED;
    component.manualPagePanX = 0;
    component.manualPagePanY = 0;

    const joystickInternals = component as unknown as {
      joystickVelocityX: number;
      joystickVelocityY: number;
      joystickInteractionStartMs: number;
      joystickAxisIntent: 'none' | 'horizontal' | 'vertical';
      applyJoystickMotionStep: () => void;
    };

    component.joystickKnobX = 22;
    component.joystickKnobY = 18;
    joystickInternals.joystickVelocityX = 0;
    joystickInternals.joystickVelocityY = 0;
    joystickInternals.joystickInteractionStartMs = Date.now() - 600;
    joystickInternals.joystickAxisIntent = 'none';
    joystickInternals.applyJoystickMotionStep();

    expect(Math.abs(component.manualPagePanX)).toBeGreaterThan(0);
    expect(Math.abs(component.manualPagePanY)).toBeGreaterThan(0);
    expect(Math.abs(component.manualPagePanY)).toBeGreaterThan(Math.abs(component.manualPagePanX) * 0.55);
  });

  it('requires a deliberate directional change before switching joystick axis intent', () => {
    const containerElement = {
      getBoundingClientRect: () => ({left: 0, top: 0, width: 390, height: 700}),
      querySelector: () => ({
        getBoundingClientRect: () => ({left: 0, top: 0, width: 700, height: 1300})
      })
    };
    (component as unknown as { imageContainerRef: { nativeElement: unknown } }).imageContainerRef = {nativeElement: containerElement};

    component.panelModeEnabled = false;
    component.activePanelIndex = -1;
    component.scrollMode = CbxScrollMode.PAGINATED;

    const joystickInternals = component as unknown as {
      joystickVelocityX: number;
      joystickVelocityY: number;
      joystickInteractionStartMs: number;
      joystickAxisIntent: 'none' | 'horizontal' | 'vertical';
      applyJoystickMotionStep: () => void;
    };

    joystickInternals.joystickVelocityX = 0;
    joystickInternals.joystickVelocityY = 0;
    joystickInternals.joystickInteractionStartMs = Date.now() - 600;
    joystickInternals.joystickAxisIntent = 'none';

    component.joystickKnobX = 28;
    component.joystickKnobY = 6;
    joystickInternals.applyJoystickMotionStep();
    expect(joystickInternals.joystickAxisIntent).toBe('horizontal');

    component.joystickKnobX = 10;
    component.joystickKnobY = 14;
    joystickInternals.applyJoystickMotionStep();
    expect(joystickInternals.joystickAxisIntent).toBe('horizontal');

    component.joystickKnobX = 6;
    component.joystickKnobY = 20;
    joystickInternals.applyJoystickMotionStep();
    expect(joystickInternals.joystickAxisIntent).toBe('vertical');
  });

  it('persists joystick indicator visibility and opacity preferences', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

    component.onJoystickIndicatorVisibleChange(false);
    component.onJoystickIndicatorOpacityChange(0.35);

    expect(component.joystickIndicatorVisible).toBe(false);
    expect(component.joystickIndicatorOpacity).toBeCloseTo(0.35, 2);

    const latestPayload = JSON.parse(setItemSpy.mock.calls[setItemSpy.mock.calls.length - 1]?.[1] as string);
    expect(latestPayload.indicatorVisible).toBe(false);
    expect(latestPayload.indicatorOpacity).toBeCloseTo(0.35, 2);

    setItemSpy.mockRestore();
  });

  it('clamps panel pan when joystick movement exceeds viewport bounds', () => {
    const containerElement = {
      getBoundingClientRect: () => ({left: 0, top: 0, width: 390, height: 700}),
      querySelector: () => ({
        getBoundingClientRect: () => ({left: 0, top: 0, width: 700, height: 1300})
      })
    };
    (component as unknown as { imageContainerRef: { nativeElement: unknown } }).imageContainerRef = {nativeElement: containerElement};

    component.activePanelIndex = 0;
    component.panelModeEnabled = true;

    (component as unknown as { applyJoystickPanDelta: (x: number, y: number) => void }).applyJoystickPanDelta(1000, 1000);

    expect(Math.abs(component.panelPanX)).toBeLessThanOrEqual(260);
    expect(Math.abs(component.panelPanY)).toBeLessThanOrEqual(440);
  });

  it('moves scroll position with joystick when in infinite mode', () => {
    const containerElement = {
      scrollLeft: 0,
      scrollTop: 0,
      getBoundingClientRect: () => ({left: 0, top: 0, width: 390, height: 700}),
      querySelector: () => null
    };
    (component as unknown as { imageContainerRef: { nativeElement: typeof containerElement } }).imageContainerRef = {nativeElement: containerElement};

    component.scrollMode = CbxScrollMode.INFINITE;
    component.panelModeEnabled = false;
    component.activePanelIndex = -1;

    (component as unknown as { applyJoystickPanDelta: (x: number, y: number) => void }).applyJoystickPanDelta(14, -18);

    expect(containerElement.scrollLeft).toBe(14);
    expect(containerElement.scrollTop).toBe(-18);
  });

  it('ignores reader touch handling when joystick is touched', () => {
    component.onTouchStart({
      target: {
        closest: (selector: string) => selector === '.mobile-joystick'
      },
      touches: [{screenX: 100, screenY: 100}]
    } as unknown as TouchEvent);

    expect((component as unknown as { isReaderTouchActive: boolean }).isReaderTouchActive).toBe(false);
  });
});