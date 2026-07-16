import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {BehaviorSubject, Subject} from 'rxjs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {DeviceBreakpoint, MobileUxService} from './mobile-ux.service';
import {LayoutMode, UiPreferencesService} from '../../shared/service/ui-preferences.service';
import {MobileBackNavigationService} from '../../shared/service/mobile-back-navigation.service';
import {DialogLauncherService} from '../../shared/services/dialog-launcher.service';
import {TabletNavigationGesturesService} from './tablet-navigation-gestures.service';

describe('TabletNavigationGesturesService', () => {
  let service: TabletNavigationGesturesService;
  let tabletNavGestures$: BehaviorSubject<boolean>;
  let layoutMode$: BehaviorSubject<LayoutMode>;
  let breakpoint$: BehaviorSubject<DeviceBreakpoint>;
  let hasTouchInput$: BehaviorSubject<boolean>;
  let requestBack: ReturnType<typeof vi.fn>;
  let openDialog: ReturnType<typeof vi.fn>;
  let routerEvents: Subject<unknown>;

  function configure(options: {
    pref?: boolean;
    layoutMode?: LayoutMode;
    breakpoint?: DeviceBreakpoint;
    hasTouch?: boolean;
    url?: string;
  } = {}): void {
    TestBed.resetTestingModule();
    tabletNavGestures$ = new BehaviorSubject(options.pref ?? true);
    layoutMode$ = new BehaviorSubject<LayoutMode>(options.layoutMode ?? 'tablet');
    breakpoint$ = new BehaviorSubject<DeviceBreakpoint>(options.breakpoint ?? 'mobile-tablet');
    hasTouchInput$ = new BehaviorSubject(options.hasTouch ?? true);
    requestBack = vi.fn(() => true);
    openDialog = vi.fn();
    routerEvents = new Subject();

    TestBed.configureTestingModule({
      providers: [
        TabletNavigationGesturesService,
        {
          provide: UiPreferencesService,
          useValue: {
            tabletNavGestures$: tabletNavGestures$.asObservable(),
            get tabletNavGestures() {
              return tabletNavGestures$.value;
            },
            layoutMode$: layoutMode$.asObservable(),
            get layoutMode() {
              return layoutMode$.value;
            }
          }
        },
        {
          provide: MobileUxService,
          useValue: {
            breakpoint$: breakpoint$.asObservable(),
            hasTouchInput$: hasTouchInput$.asObservable(),
            get hasTouchInput() {
              return hasTouchInput$.value;
            },
            get isPhone() {
              return breakpoint$.value === 'mobile';
            }
          }
        },
        {
          provide: MobileBackNavigationService,
          useValue: {
            requestBack,
            get hasOverlayEntry() {
              return false;
            }
          }
        },
        {
          provide: DialogLauncherService,
          useValue: {openDialog}
        },
        {
          provide: Router,
          useValue: {
            url: options.url ?? '/all-books',
            events: routerEvents.asObservable()
          }
        }
      ]
    });

    service = TestBed.inject(TabletNavigationGesturesService);
    service.start();
  }

  afterEach(() => {
    service?.ngOnDestroy();
    TestBed.resetTestingModule();
    document.body.classList.remove('tablet-nav-gestures');
  });

  it('stays disabled in Phone Mode even when the preference is on', () => {
    configure({pref: true, layoutMode: 'phone', breakpoint: 'mobile', hasTouch: true});
    expect(service.isEnabled).toBe(false);
    expect(document.body.classList.contains('tablet-nav-gestures')).toBe(false);
  });

  it('stays disabled when preference is off on tablet', () => {
    configure({pref: false, layoutMode: 'tablet', breakpoint: 'mobile-tablet', hasTouch: true});
    expect(service.isEnabled).toBe(false);
  });

  it('enables on tablet with touch and preference on', () => {
    configure({pref: true, layoutMode: 'tablet', breakpoint: 'mobile-tablet', hasTouch: true});
    expect(service.isEnabled).toBe(true);
    expect(document.body.classList.contains('tablet-nav-gestures')).toBe(true);
  });

  it('prevents contextmenu on non-input targets when enabled', () => {
    configure({pref: true, layoutMode: 'tablet', breakpoint: 'mobile-tablet', hasTouch: true});
    const cover = document.createElement('img');
    cover.className = 'book-cover';
    document.body.appendChild(cover);

    const event = new Event('contextmenu', {bubbles: true, cancelable: true});
    Object.defineProperty(event, 'target', {value: cover});
    const prevented = !document.dispatchEvent(event);
    expect(prevented || event.defaultPrevented).toBe(true);

    cover.remove();
  });

  it('does not prevent contextmenu on inputs', () => {
    configure({pref: true, layoutMode: 'tablet', breakpoint: 'mobile-tablet', hasTouch: true});
    const input = document.createElement('input');
    document.body.appendChild(input);

    const event = new Event('contextmenu', {bubbles: true, cancelable: true});
    Object.defineProperty(event, 'target', {value: input});
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);

    input.remove();
  });

  it('invokes requestBack on left-edge right swipe with a touch pointer', () => {
    configure({pref: true, layoutMode: 'tablet', breakpoint: 'mobile-tablet', hasTouch: true});
    Object.defineProperty(window, 'innerWidth', {configurable: true, value: 1200});

    document.dispatchEvent(new PointerEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 20,
      clientY: 400,
      bubbles: true
    }));
    document.dispatchEvent(new PointerEvent('pointerup', {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 140,
      clientY: 405,
      bubbles: true
    }));

    expect(requestBack).toHaveBeenCalledTimes(1);
  });

  it('ignores mouse pointer edge swipes', () => {
    configure({pref: true, layoutMode: 'tablet', breakpoint: 'mobile-tablet', hasTouch: true});
    Object.defineProperty(window, 'innerWidth', {configurable: true, value: 1200});

    document.dispatchEvent(new PointerEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 20,
      clientY: 400,
      bubbles: true
    }));
    document.dispatchEvent(new PointerEvent('pointerup', {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 140,
      clientY: 405,
      bubbles: true
    }));

    expect(requestBack).not.toHaveBeenCalled();
  });

  it('opens the kiosk sheet on a three-finger tap', () => {
    configure({pref: true, layoutMode: 'tablet', breakpoint: 'mobile-tablet', hasTouch: true});

    const touches = [
      {identifier: 1, clientX: 100, clientY: 100},
      {identifier: 2, clientX: 140, clientY: 110},
      {identifier: 3, clientX: 120, clientY: 150}
    ];

    document.dispatchEvent(new TouchEvent('touchstart', {
      touches: touches as unknown as Touch[],
      changedTouches: touches as unknown as Touch[],
      bubbles: true
    }));
    document.dispatchEvent(new TouchEvent('touchend', {
      touches: [] as unknown as Touch[],
      changedTouches: touches as unknown as Touch[],
      bubbles: true
    }));

    expect(openDialog).toHaveBeenCalledTimes(1);
  });
});
