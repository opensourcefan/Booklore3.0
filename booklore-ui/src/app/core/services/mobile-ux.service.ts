import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable, Subscription, combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, shareReplay } from 'rxjs/operators';
import { UiPreferencesService } from '../../shared/service/ui-preferences.service';

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
    this.uiPrefs.layoutMode$,
    this.uiPrefs.phoneBreakpoint$,
    this.uiPrefs.tabletBreakpoint$
  ]).pipe(
    map(([width, mode, phoneBreakpoint, tabletBreakpoint]) => {
      if (mode === 'phone') return 'mobile';
      if (mode === 'tablet') return 'mobile-tablet';
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
      if (mode === 'tablet') return false;
      const shortEdge = Math.min(width, height);
      const longEdge = Math.max(width, height);
      return shortEdge <= phoneBreakpoint && longEdge <= this.MOBILE_LONG_EDGE_MAX_PX;
    }),
    distinctUntilChanged(),
    shareReplay(1)
  );

  get layoutMode(): 'auto' | 'phone' | 'tablet' {
    return this.uiPrefs.layoutMode;
  }

  setLayoutMode(value: 'auto' | 'phone' | 'tablet'): void {
    this.uiPrefs.setLayoutMode(value);
  }

  get isPhone(): boolean {
    const mode = this.uiPrefs.layoutMode;
    if (mode === 'phone') return true;
    if (mode === 'tablet') return false;
    return this.screenWidthSubject.value <= this.uiPrefs.phoneBreakpoint;
  }

  get isTablet(): boolean {
    const mode = this.uiPrefs.layoutMode;
    if (mode === 'tablet') return true;
    if (mode === 'phone') return false;
    const width = this.screenWidthSubject.value;
    return width > this.uiPrefs.phoneBreakpoint && width <= this.uiPrefs.tabletBreakpoint;
  }

  get isMobileOrTablet(): boolean {
    return this.isPhone || this.isTablet;
  }

  get isDesktop(): boolean {
    return !this.isMobileOrTablet;
  }

  private resizeListener: (() => void) | null = null;
  private breakpointSubscription!: Subscription;

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
      }
    });
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined' && this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = null;
    }
    if (this.breakpointSubscription) {
      this.breakpointSubscription.unsubscribe();
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
