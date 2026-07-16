import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {BehaviorSubject} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {MobileUxService} from '../../core/services/mobile-ux.service';
import {LayoutMode, UiPreferencesService} from './ui-preferences.service';
import {MobileBackNavigationService} from './mobile-back-navigation.service';

describe('MobileBackNavigationService layout-aware registration', () => {
  let service: MobileBackNavigationService;
  let layoutMode$: BehaviorSubject<LayoutMode>;
  let pushStateSpy: ReturnType<typeof vi.spyOn>;
  let backSpy: ReturnType<typeof vi.spyOn>;

  function configure(layoutMode: LayoutMode, width: number, height: number): void {
    TestBed.resetTestingModule();
    Object.defineProperty(window, 'innerWidth', {configurable: true, value: width});
    Object.defineProperty(window, 'innerHeight', {configurable: true, value: height});
    layoutMode$ = new BehaviorSubject<LayoutMode>(layoutMode);

    TestBed.configureTestingModule({
      providers: [
        MobileBackNavigationService,
        MobileUxService,
        {provide: Router, useValue: {url: '/test-route'}},
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
            headerPosition$: new BehaviorSubject<'top' | 'bottom'>('top')
          }
        }
      ]
    });

    service = TestBed.inject(MobileBackNavigationService);
  }

  beforeEach(() => {
    pushStateSpy = vi.spyOn(window.history, 'pushState');
    backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
  });

  afterEach(() => {
    service?.ngOnDestroy();
    pushStateSpy.mockRestore();
    backSpy.mockRestore();
    TestBed.resetTestingModule();
  });

  it('keeps forced phone mode registered even on a wide viewport', () => {
    configure('phone', 1400, 900);
    const close = vi.fn();

    service.register(close);

    expect(pushStateSpy).toHaveBeenCalledOnce();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not register when desktop layout is forced on a phone-sized viewport', () => {
    configure('desktop', 375, 667);
    const close = vi.fn();

    const handle = service.register(close);

    expect(pushStateSpy).not.toHaveBeenCalled();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(close).not.toHaveBeenCalled();
    handle.release();
    expect(backSpy).not.toHaveBeenCalled();
  });

  it('does not register when tablet layout is forced on a phone-sized viewport', () => {
    configure('tablet', 375, 667);
    const close = vi.fn();

    service.register(close);

    expect(pushStateSpy).not.toHaveBeenCalled();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(close).not.toHaveBeenCalled();
  });

  it('keeps auto-shape phone-width viewports registered', () => {
    configure('auto-shape', 700, 1200);
    const close = vi.fn();

    service.register(close);

    expect(pushStateSpy).toHaveBeenCalledOnce();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not register for auto-shape non-phone tablet viewports', () => {
    configure('auto-shape', 1200, 2000);
    const close = vi.fn();

    service.register(close);

    expect(pushStateSpy).not.toHaveBeenCalled();
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(close).not.toHaveBeenCalled();
  });

  it('requestBack always invokes history.back', () => {
    configure('phone', 390, 844);
    expect(service.requestBack()).toBe(true);
    expect(backSpy).toHaveBeenCalledOnce();
  });
});
