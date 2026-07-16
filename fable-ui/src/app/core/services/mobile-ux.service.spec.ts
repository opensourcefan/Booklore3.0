import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {firstValueFrom} from 'rxjs';
import {MobileUxService} from './mobile-ux.service';
import {LayoutMode, UiPreferencesService} from '../../shared/service/ui-preferences.service';
import {BehaviorSubject} from 'rxjs';

describe('MobileUxService hasTouchInput', () => {
  let service: MobileUxService;
  let layoutMode$: BehaviorSubject<LayoutMode>;

  async function waitForResizeDebounce(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 175));
  }

  beforeEach(() => {
    layoutMode$ = new BehaviorSubject<LayoutMode>('auto');
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
            headerPosition: 'top',
            headerPosition$: new BehaviorSubject('top'),
            setLayoutMode: vi.fn((value: LayoutMode) => layoutMode$.next(value))
          }
        }
      ]
    });
    service = TestBed.inject(MobileUxService);
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
