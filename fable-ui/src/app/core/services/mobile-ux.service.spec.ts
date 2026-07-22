import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {firstValueFrom} from 'rxjs';
import {MobileUxService} from './mobile-ux.service';
import {LayoutMode, UiPreferencesService} from '../../shared/service/ui-preferences.service';
import {BehaviorSubject} from 'rxjs';

describe('MobileUxService hasTouchInput', () => {
  let service: MobileUxService;
  let layoutMode$: BehaviorSubject<LayoutMode>;
  let headerPosition$: BehaviorSubject<'top' | 'bottom'>;
  let tabletHeaderPosition$: BehaviorSubject<'top' | 'bottom'>;

  async function waitForResizeDebounce(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 175));
  }

  function configurePrefs(options?: {
    layoutMode?: LayoutMode;
    headerPosition?: 'top' | 'bottom';
    tabletHeaderPosition?: 'top' | 'bottom';
  }): void {
    layoutMode$ = new BehaviorSubject<LayoutMode>(options?.layoutMode ?? 'auto');
    headerPosition$ = new BehaviorSubject<'top' | 'bottom'>(options?.headerPosition ?? 'top');
    tabletHeaderPosition$ = new BehaviorSubject<'top' | 'bottom'>(options?.tabletHeaderPosition ?? 'top');
    TestBed.configureTestingModule({
      providers: [
        MobileUxService,
        {
          provide: UiPreferencesService,
          useValue: {
            get layoutMode() {
              return layoutMode$.value;
            },
            layoutMode$,
            phoneBreakpoint: 767,
            phoneBreakpoint$: new BehaviorSubject(767),
            tabletBreakpoint: 1024,
            tabletBreakpoint$: new BehaviorSubject(1024),
            get headerPosition() {
              return headerPosition$.value;
            },
            headerPosition$,
            get tabletHeaderPosition() {
              return tabletHeaderPosition$.value;
            },
            tabletHeaderPosition$,
            setLayoutMode: vi.fn((value: LayoutMode) => layoutMode$.next(value)),
            setHeaderPosition: vi.fn((value: 'top' | 'bottom') => headerPosition$.next(value)),
            setTabletHeaderPosition: vi.fn((value: 'top' | 'bottom') => tabletHeaderPosition$.next(value))
          }
        }
      ]
    });
    service = TestBed.inject(MobileUxService);
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    document.body.classList.remove(
      'header-bottom',
      'layout-phone',
      'layout-tablet',
      'layout-desktop',
      'touch-digitizer'
    );
    configurePrefs();
  });

  it('exposes hasTouchInput without changing isDesktop for wide viewports', () => {
    Object.defineProperty(window, 'innerWidth', {configurable: true, value: 1400});
    Object.defineProperty(window, 'innerHeight', {configurable: true, value: 900});
    window.dispatchEvent(new Event('resize'));

    expect(service.isDesktop).toBe(true);
    expect(typeof service.hasTouchInput).toBe('boolean');
  });

  it('keeps layout-phone independent of touch capability', () => {
    layoutMode$.next('phone');
    expect(service.isPhone).toBe(true);
    // Touch flag must remain a separate signal from layout mode.
    expect(service.hasTouchInput === true || service.hasTouchInput === false).toBe(true);
  });

  it('forces desktop breakpoint and getters when layoutMode is desktop', async () => {
    Object.defineProperty(window, 'innerWidth', {configurable: true, value: 375});
    Object.defineProperty(window, 'innerHeight', {configurable: true, value: 667});
    window.dispatchEvent(new Event('resize'));

    layoutMode$.next('desktop');
    service.setLayoutMode('desktop');
    await waitForResizeDebounce();

    expect(service.layoutMode).toBe('desktop');
    expect(service.isPhone).toBe(false);
    expect(service.isTablet).toBe(false);
    expect(service.isDesktop).toBe(true);
    expect(service.isMobileInteractionMode).toBe(false);
    expect(await firstValueFrom(service.breakpoint$)).toBe('desktop');
  });

  it('uses tablet in portrait and desktop in landscape for auto-shape on non-phone viewports', async () => {
    Object.defineProperty(window, 'innerWidth', {configurable: true, value: 1200});
    Object.defineProperty(window, 'innerHeight', {configurable: true, value: 2000});
    window.dispatchEvent(new Event('resize'));

    layoutMode$.next('auto-shape');
    service.setLayoutMode('auto-shape');
    await waitForResizeDebounce();

    expect(await firstValueFrom(service.breakpoint$)).toBe('mobile-tablet');
    expect(service.isTablet).toBe(true);
    expect(service.isDesktop).toBe(false);

    Object.defineProperty(window, 'innerWidth', {configurable: true, value: 2000});
    Object.defineProperty(window, 'innerHeight', {configurable: true, value: 1200});
    window.dispatchEvent(new Event('resize'));
    await waitForResizeDebounce();

    expect(await firstValueFrom(service.breakpoint$)).toBe('desktop');
    expect(service.isTablet).toBe(false);
    expect(service.isDesktop).toBe(true);
  });

  it('keeps phone viewport in phone mode even when auto-shape is enabled', async () => {
    Object.defineProperty(window, 'innerWidth', {configurable: true, value: 700});
    Object.defineProperty(window, 'innerHeight', {configurable: true, value: 1200});
    window.dispatchEvent(new Event('resize'));

    layoutMode$.next('auto-shape');
    service.setLayoutMode('auto-shape');
    await waitForResizeDebounce();

    expect(await firstValueFrom(service.breakpoint$)).toBe('mobile');
    expect(service.isPhone).toBe(true);
    expect(service.isTablet).toBe(false);
  });
});

describe('MobileUxService header-bottom class gating', () => {
  let service: MobileUxService;
  let layoutMode$: BehaviorSubject<LayoutMode>;
  let headerPosition$: BehaviorSubject<'top' | 'bottom'>;
  let tabletHeaderPosition$: BehaviorSubject<'top' | 'bottom'>;

  async function waitForResizeDebounce(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 175));
  }

  function configure(options: {
    layoutMode: LayoutMode;
    headerPosition: 'top' | 'bottom';
    tabletHeaderPosition: 'top' | 'bottom';
    width: number;
    height: number;
  }): void {
    TestBed.resetTestingModule();
    document.body.classList.remove(
      'header-bottom',
      'layout-phone',
      'layout-tablet',
      'layout-desktop',
      'touch-digitizer'
    );
    Object.defineProperty(window, 'innerWidth', {configurable: true, value: options.width});
    Object.defineProperty(window, 'innerHeight', {configurable: true, value: options.height});
    layoutMode$ = new BehaviorSubject<LayoutMode>(options.layoutMode);
    headerPosition$ = new BehaviorSubject<'top' | 'bottom'>(options.headerPosition);
    tabletHeaderPosition$ = new BehaviorSubject<'top' | 'bottom'>(options.tabletHeaderPosition);

    TestBed.configureTestingModule({
      providers: [
        MobileUxService,
        {
          provide: UiPreferencesService,
          useValue: {
            get layoutMode() {
              return layoutMode$.value;
            },
            layoutMode$,
            phoneBreakpoint: 767,
            phoneBreakpoint$: new BehaviorSubject(767),
            tabletBreakpoint: 1024,
            tabletBreakpoint$: new BehaviorSubject(1024),
            get headerPosition() {
              return headerPosition$.value;
            },
            headerPosition$,
            get tabletHeaderPosition() {
              return tabletHeaderPosition$.value;
            },
            tabletHeaderPosition$,
            setLayoutMode: vi.fn((value: LayoutMode) => layoutMode$.next(value))
          }
        }
      ]
    });
    service = TestBed.inject(MobileUxService);
  }

  afterEach(() => {
    service?.ngOnDestroy();
    TestBed.resetTestingModule();
    document.body.classList.remove(
      'header-bottom',
      'layout-phone',
      'layout-tablet',
      'layout-desktop',
      'touch-digitizer'
    );
  });

  it('applies header-bottom in forced phone mode when phone pref is bottom', async () => {
    configure({
      layoutMode: 'phone',
      headerPosition: 'bottom',
      tabletHeaderPosition: 'top',
      width: 1400,
      height: 900
    });
    await waitForResizeDebounce();
    expect(document.body.classList.contains('header-bottom')).toBe(true);
  });

  it('does not apply header-bottom in phone mode when only tablet pref is bottom', async () => {
    configure({
      layoutMode: 'phone',
      headerPosition: 'top',
      tabletHeaderPosition: 'bottom',
      width: 375,
      height: 667
    });
    await waitForResizeDebounce();
    expect(document.body.classList.contains('header-bottom')).toBe(false);
  });

  it('applies header-bottom in forced tablet mode when tablet pref is bottom', async () => {
    configure({
      layoutMode: 'tablet',
      headerPosition: 'top',
      tabletHeaderPosition: 'bottom',
      width: 1400,
      height: 900
    });
    await waitForResizeDebounce();
    expect(document.body.classList.contains('header-bottom')).toBe(true);
  });

  it('does not apply header-bottom in tablet mode when only phone pref is bottom', async () => {
    configure({
      layoutMode: 'tablet',
      headerPosition: 'bottom',
      tabletHeaderPosition: 'top',
      width: 900,
      height: 1200
    });
    await waitForResizeDebounce();
    expect(document.body.classList.contains('header-bottom')).toBe(false);
  });

  it('applies header-bottom under auto-shape portrait when tablet pref is bottom', async () => {
    configure({
      layoutMode: 'auto-shape',
      headerPosition: 'top',
      tabletHeaderPosition: 'bottom',
      width: 1200,
      height: 2000
    });
    await waitForResizeDebounce();
    expect(service.isTablet).toBe(true);
    expect(document.body.classList.contains('header-bottom')).toBe(true);
  });

  it('removes header-bottom under auto-shape landscape even when tablet pref is bottom', async () => {
    configure({
      layoutMode: 'auto-shape',
      headerPosition: 'top',
      tabletHeaderPosition: 'bottom',
      width: 1200,
      height: 2000
    });
    await waitForResizeDebounce();
    expect(document.body.classList.contains('header-bottom')).toBe(true);

    Object.defineProperty(window, 'innerWidth', {configurable: true, value: 2000});
    Object.defineProperty(window, 'innerHeight', {configurable: true, value: 1200});
    window.dispatchEvent(new Event('resize'));
    await waitForResizeDebounce();

    expect(service.isDesktop).toBe(true);
    expect(document.body.classList.contains('header-bottom')).toBe(false);
  });

  it('never applies header-bottom in forced desktop even when both prefs are bottom', async () => {
    configure({
      layoutMode: 'desktop',
      headerPosition: 'bottom',
      tabletHeaderPosition: 'bottom',
      width: 375,
      height: 667
    });
    await waitForResizeDebounce();
    expect(document.body.classList.contains('header-bottom')).toBe(false);
  });

  it('reacts when tablet pref flips while already in tablet layout', async () => {
    configure({
      layoutMode: 'tablet',
      headerPosition: 'top',
      tabletHeaderPosition: 'top',
      width: 900,
      height: 1200
    });
    await waitForResizeDebounce();
    expect(document.body.classList.contains('header-bottom')).toBe(false);

    tabletHeaderPosition$.next('bottom');
    expect(document.body.classList.contains('header-bottom')).toBe(true);

    tabletHeaderPosition$.next('top');
    expect(document.body.classList.contains('header-bottom')).toBe(false);
  });
});

describe('MobileUxService touch-digitizer class', () => {
  let service: MobileUxService;
  let layoutMode$: BehaviorSubject<LayoutMode>;
  let originalMaxTouchPoints: number;

  async function waitForResizeDebounce(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 175));
  }

  function configure(options: {
    layoutMode: LayoutMode;
    width: number;
    height: number;
    maxTouchPoints: number;
  }): void {
    TestBed.resetTestingModule();
    document.body.classList.remove(
      'header-bottom',
      'layout-phone',
      'layout-tablet',
      'layout-desktop',
      'touch-digitizer'
    );
    Object.defineProperty(window, 'innerWidth', {configurable: true, value: options.width});
    Object.defineProperty(window, 'innerHeight', {configurable: true, value: options.height});
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: options.maxTouchPoints
    });
    layoutMode$ = new BehaviorSubject<LayoutMode>(options.layoutMode);

    TestBed.configureTestingModule({
      providers: [
        MobileUxService,
        {
          provide: UiPreferencesService,
          useValue: {
            get layoutMode() {
              return layoutMode$.value;
            },
            layoutMode$,
            phoneBreakpoint: 767,
            phoneBreakpoint$: new BehaviorSubject(767),
            tabletBreakpoint: 1024,
            tabletBreakpoint$: new BehaviorSubject(1024),
            get headerPosition() {
              return 'top';
            },
            headerPosition$: new BehaviorSubject<'top' | 'bottom'>('top'),
            get tabletHeaderPosition() {
              return 'top';
            },
            tabletHeaderPosition$: new BehaviorSubject<'top' | 'bottom'>('top'),
            setLayoutMode: vi.fn((value: LayoutMode) => layoutMode$.next(value))
          }
        }
      ]
    });
    service = TestBed.inject(MobileUxService);
  }

  beforeEach(() => {
    originalMaxTouchPoints = navigator.maxTouchPoints;
  });

  afterEach(() => {
    service?.ngOnDestroy();
    TestBed.resetTestingModule();
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value: originalMaxTouchPoints
    });
    document.body.classList.remove(
      'header-bottom',
      'layout-phone',
      'layout-tablet',
      'layout-desktop',
      'touch-digitizer'
    );
  });

  it('applies touch-digitizer in forced tablet mode when a digitizer is present', async () => {
    configure({
      layoutMode: 'tablet',
      width: 900,
      height: 1200,
      maxTouchPoints: 10
    });
    await waitForResizeDebounce();
    expect(service.hasTouchInput).toBe(true);
    expect(service.isPhone).toBe(false);
    expect(document.body.classList.contains('touch-digitizer')).toBe(true);
  });

  it('applies touch-digitizer in forced desktop mode when a digitizer is present', async () => {
    configure({
      layoutMode: 'desktop',
      width: 1400,
      height: 900,
      maxTouchPoints: 5
    });
    await waitForResizeDebounce();
    expect(service.hasTouchInput).toBe(true);
    expect(service.isPhone).toBe(false);
    expect(document.body.classList.contains('touch-digitizer')).toBe(true);
  });

  it('never applies touch-digitizer under Phone Mode even with a digitizer', async () => {
    configure({
      layoutMode: 'phone',
      width: 375,
      height: 667,
      maxTouchPoints: 10
    });
    await waitForResizeDebounce();
    expect(service.hasTouchInput).toBe(true);
    expect(service.isPhone).toBe(true);
    expect(document.body.classList.contains('touch-digitizer')).toBe(false);
    expect(document.body.classList.contains('layout-phone')).toBe(true);
  });

  it('removes touch-digitizer when auto-shape enters phone viewport', async () => {
    configure({
      layoutMode: 'auto-shape',
      width: 1200,
      height: 2000,
      maxTouchPoints: 10
    });
    await waitForResizeDebounce();
    expect(service.isTablet).toBe(true);
    expect(document.body.classList.contains('touch-digitizer')).toBe(true);

    Object.defineProperty(window, 'innerWidth', {configurable: true, value: 700});
    Object.defineProperty(window, 'innerHeight', {configurable: true, value: 1200});
    window.dispatchEvent(new Event('resize'));
    await waitForResizeDebounce();

    expect(service.isPhone).toBe(true);
    expect(document.body.classList.contains('touch-digitizer')).toBe(false);
  });

  it('does not apply touch-digitizer without a digitizer on tablet', async () => {
    const hadOntouchstart = Object.prototype.hasOwnProperty.call(window, 'ontouchstart');
    const previousOntouchstart = (window as Window & {ontouchstart?: unknown}).ontouchstart;
    try {
      Reflect.deleteProperty(window, 'ontouchstart');
      configure({
        layoutMode: 'tablet',
        width: 900,
        height: 1200,
        maxTouchPoints: 0
      });
      await waitForResizeDebounce();
      expect(service.hasTouchInput).toBe(false);
      expect(document.body.classList.contains('touch-digitizer')).toBe(false);
    } finally {
      if (hadOntouchstart) {
        (window as Window & {ontouchstart?: unknown}).ontouchstart = previousOntouchstart;
      }
    }
  });
});
