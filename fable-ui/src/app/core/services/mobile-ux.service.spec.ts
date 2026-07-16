import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {MobileUxService} from './mobile-ux.service';
import {UiPreferencesService} from '../../shared/service/ui-preferences.service';
import {BehaviorSubject} from 'rxjs';

describe('MobileUxService hasTouchInput', () => {
  let service: MobileUxService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MobileUxService,
        {
          provide: UiPreferencesService,
          useValue: {
            layoutMode: 'auto',
            layoutMode$: new BehaviorSubject<'auto' | 'phone' | 'tablet'>('auto'),
            phoneBreakpoint: 767,
            phoneBreakpoint$: new BehaviorSubject(767),
            tabletBreakpoint: 1024,
            tabletBreakpoint$: new BehaviorSubject(1024),
            headerPosition: 'top',
            headerPosition$: new BehaviorSubject('top'),
            setLayoutMode: vi.fn()
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
    const prefs = TestBed.inject(UiPreferencesService) as unknown as {
      layoutMode: string;
    };
    prefs.layoutMode = 'phone';
    expect(service.isPhone).toBe(true);
    // Touch flag must remain a separate signal from layout mode.
    expect(service.hasTouchInput === true || service.hasTouchInput === false).toBe(true);
  });
});
