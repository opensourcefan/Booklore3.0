import {beforeEach, describe, expect, it, vi} from 'vitest';
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
    document.body.classList.remove('header-bottom', 'layout-phone', 'layout-tablet', 'layout-desktop');
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
    document.body.classList.remove('header-bottom', 'layout-phone', 'layout-tablet', 'layout-desktop');
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
    document.body.classList.remove('header-bottom', 'layout-phone', 'layout-tablet', 'layout-desktop');
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
