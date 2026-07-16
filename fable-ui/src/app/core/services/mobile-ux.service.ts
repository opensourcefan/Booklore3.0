import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subscription, combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, shareReplay } from 'rxjs/operators';
import { LayoutMode, UiPreferencesService } from '../../shared/service/ui-preferences.service';
import { detectHasTouchInput } from '../../shared/util/search-overlay-focus.util';

export type DeviceBreakpoint = 'mobile' | 'mobile-tablet' | 'desktop';

@Injectable({
  providedIn: 'root'
})
export class MobileUxService implements OnDestroy {
  private readonly MOBILE_LONG_EDGE_MAX_PX = 1200;
  private readonly RESIZE_DEBOUNCE_MS = 150;

  private uiPrefs = inject(UiPreferencesService);

  private screenWidthSubject = new BehaviorSubject<number>(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  private screenHeightSubject = new BehaviorSubject<number>(
    typeof window !== 'undefined' ? window.innerHeight : 768
  );

  /**
   * True when the device exposes a touch digitizer.
   * Used for OSK / focus behavior only — does NOT change layout breakpoints.
   */
  private readonly hasTouchInputSubject = new BehaviorSubject<boolean>(
    typeof window !== 'undefined' ? detectHasTouchInput() : false
  );

  /** Touch-capability signal for keyboard helpers (not layout chrome). */
  public readonly hasTouchInput$: Observable<boolean> = this.hasTouchInputSubject.pipe(
    distinctUntilChanged(),
    shareReplay(1)
  );

  /** Debounced screen width observable (150ms). */
  public readonly screenWidth$: Observable<number> = this.screenWidthSubject.pipe(
    debounceTime(this.RESIZE_DEBOUNCE_MS),
    distinctUntilChanged(),
    shareReplay(1)
  );

  /** Debounced screen height observable (150ms). */
  public readonly screenHeight$: Observable<number> = this.screenHeightSubject.pipe(
    debounceTime(this.RESIZE_DEBOUNCE_MS),
    distinctUntilChanged(),
    shareReplay(1)
  );

  /** Three-tier breakpoint: mobile (≤phoneBreakpoint), mobile-tablet (phoneBreakpoint–tabletBreakpoint), desktop (>tabletBreakpoint). */
  public readonly breakpoint$: Observable<DeviceBreakpoint> = combineLatest([
    this.screenWidth$,
    this.screenHeight$,
    this.uiPrefs.layoutMode$,
    this.uiPrefs.phoneBreakpoint$,
    this.uiPrefs.tabletBreakpoint$
  ]).pipe(
    map(([width, height, mode, phoneBreakpoint, tabletBreakpoint]) => {
      if (mode === 'phone') return 'mobile';
      if (mode === 'tablet') return 'mobile-tablet';
      if (mode === 'desktop') return 'desktop';
      if (mode === 'auto-shape') {
        if (width <= phoneBreakpoint) return 'mobile';
        return height > width ? 'mobile-tablet' : 'desktop';
      }
      if (width <= phoneBreakpoint) {
        return 'mobile';
      } else if (width <= tabletBreakpoint) {
        return 'mobile-tablet';
      } else {
        return 'desktop';
      }
    }),
    distinctUntilChanged(),
    shareReplay(1)
  );

  /**
   * Dual-constraint mobile interaction mode.
   * True when short edge ≤ phoneBreakpoint AND long edge ≤ 1200.
   */
  public readonly isMobileInteractionMode$: Observable<boolean> = combineLatest([
    this.screenWidth$,
    this.screenHeight$,
    this.uiPrefs.layoutMode$,
    this.uiPrefs.phoneBreakpoint$
  ]).pipe(
    map(([width, height, mode, phoneBreakpoint]) => {
      if (mode === 'phone') return true;
      if (mode === 'tablet' || mode === 'desktop') return false;
      const shortEdge = Math.min(width, height);
      const longEdge = Math.max(width, height);
      return shortEdge <= phoneBreakpoint && longEdge <= this.MOBILE_LONG_EDGE_MAX_PX;
    }),
    distinctUntilChanged(),
    shareReplay(1)
  );

  get isMobileInteractionMode(): boolean {
    const mode = this.uiPrefs.layoutMode;
    if (mode === 'phone') return true;
    if (mode === 'tablet' || mode === 'desktop') return false;
    const width = this.screenWidthSubject.value;
    const height = this.screenHeightSubject.value;
    const shortEdge = Math.min(width, height);
    const longEdge = Math.max(width, height);
    return shortEdge <= this.uiPrefs.phoneBreakpoint && longEdge <= this.MOBILE_LONG_EDGE_MAX_PX;
  }

  get layoutMode(): LayoutMode {
    return this.uiPrefs.layoutMode;
  }

  setLayoutMode(value: LayoutMode): void {
    this.uiPrefs.setLayoutMode(value);
  }

  get isPhone(): boolean {
    return this.getBreakpointForCurrentViewport() === 'mobile';
  }

  get isTablet(): boolean {
    return this.getBreakpointForCurrentViewport() === 'mobile-tablet';
  }

  get isMobileOrTablet(): boolean {
    return this.isPhone || this.isTablet;
  }

  get isDesktop(): boolean {
    return !this.isMobileOrTablet;
  }

  /**
   * Touch digitizer present (maxTouchPoints / ontouchstart).
   * Prefer this over width checks when deciding whether to run OSK focus helpers.
   * Does not affect layout-phone / layout-desktop body classes.
   */
  get hasTouchInput(): boolean {
    return this.hasTouchInputSubject.value;
  }

  private resizeListener: (() => void) | null = null;
  private breakpointSubscription!: Subscription;
  private headerPositionSubscription!: Subscription;

  constructor() {
    this.initListeners();
    this.breakpointSubscription = this.breakpoint$.subscribe(bp => {
      if (typeof document !== 'undefined') {
        const body = document.body;
        body.classList.remove('layout-phone', 'layout-tablet', 'layout-desktop');
        if (bp === 'mobile') {
          body.classList.add('layout-phone');
        } else if (bp === 'mobile-tablet') {
          body.classList.add('layout-tablet');
        } else {
          body.classList.add('layout-desktop');
        }
        // Re-evaluate header position class when breakpoint changes
        this.syncHeaderPositionClass();
      }
    });

    this.headerPositionSubscription = this.uiPrefs.headerPosition$.subscribe(() => {
      this.syncHeaderPositionClass();
    });
  }

  /** Applies or removes the header-bottom class based on user preference and phone mode. */
  private syncHeaderPositionClass(): void {
    if (typeof document === 'undefined') return;
    const body = document.body;
    const isPhone = this.isPhone;
    const wantsBottom = this.uiPrefs.headerPosition === 'bottom';
    if (isPhone && wantsBottom) {
      body.classList.add('header-bottom');
    } else {
      body.classList.remove('header-bottom');
    }
  }

  private getBreakpointForCurrentViewport(): DeviceBreakpoint {
    const width = this.screenWidthSubject.value;
    const height = this.screenHeightSubject.value;
    const mode = this.uiPrefs.layoutMode;

    if (mode === 'phone') return 'mobile';
    if (mode === 'tablet') return 'mobile-tablet';
    if (mode === 'desktop') return 'desktop';

    if (mode === 'auto-shape') {
      if (width <= this.uiPrefs.phoneBreakpoint) return 'mobile';
      return height > width ? 'mobile-tablet' : 'desktop';
    }

    if (width <= this.uiPrefs.phoneBreakpoint) return 'mobile';
    if (width <= this.uiPrefs.tabletBreakpoint) return 'mobile-tablet';
    return 'desktop';
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined' && this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = null;
    }
    if (this.breakpointSubscription) {
      this.breakpointSubscription.unsubscribe();
    }
    if (this.headerPositionSubscription) {
      this.headerPositionSubscription.unsubscribe();
    }
  }

  private initListeners(): void {
    if (typeof window === 'undefined') {
      return;
    }

    this.resizeListener = () => {
      this.screenWidthSubject.next(window.innerWidth);
      this.screenHeightSubject.next(window.innerHeight);
    };
    window.addEventListener('resize', this.resizeListener);
  }
}
