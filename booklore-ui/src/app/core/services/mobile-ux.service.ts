import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, shareReplay } from 'rxjs/operators';

export type DeviceBreakpoint = 'mobile' | 'mobile-tablet' | 'desktop';

@Injectable({
  providedIn: 'root'
})
export class MobileUxService implements OnDestroy {
  private readonly MOBILE_BREAKPOINT = 767;
  private readonly MOBILE_LONG_EDGE_MAX_PX = 1200;
  private readonly RESIZE_DEBOUNCE_MS = 150;

  private screenWidthSubject = new BehaviorSubject<number>(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  private screenHeightSubject = new BehaviorSubject<number>(
    typeof window !== 'undefined' ? window.innerHeight : 768
  );
  private currentBreakpoint = new BehaviorSubject<DeviceBreakpoint>('desktop');

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

  /** Three-tier breakpoint: mobile (≤767), mobile-tablet (768–1024), desktop (>1024). */
  public readonly breakpoint$ = this.currentBreakpoint.asObservable();

  /**
   * Dual-constraint mobile interaction mode.
   * True when short edge ≤ 767 AND long edge ≤ 1200.
   * This correctly excludes tablets (iPad Mini 768×1024) and small laptops.
   */
  public readonly isMobileInteractionMode$: Observable<boolean> = combineLatest([
    this.screenWidth$,
    this.screenHeight$
  ]).pipe(
    map(([width, height]) => {
      const shortEdge = Math.min(width, height);
      const longEdge = Math.max(width, height);
      return shortEdge <= this.MOBILE_BREAKPOINT && longEdge <= this.MOBILE_LONG_EDGE_MAX_PX;
    }),
    distinctUntilChanged(),
    shareReplay(1)
  );

  private resizeListener: (() => void) | null = null;

  constructor() {
    this.initListeners();
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined' && this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = null;
    }
  }

  private initListeners(): void {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const tabletQuery = window.matchMedia('(min-width: 768px) and (max-width: 1024px)');

    const updateBreakpoint = () => {
      if (mobileQuery.matches) {
        this.currentBreakpoint.next('mobile');
      } else if (tabletQuery.matches) {
        this.currentBreakpoint.next('mobile-tablet');
      } else {
        this.currentBreakpoint.next('desktop');
      }
    };

    mobileQuery.addEventListener('change', updateBreakpoint);
    tabletQuery.addEventListener('change', updateBreakpoint);
    updateBreakpoint();

    this.resizeListener = () => {
      this.screenWidthSubject.next(window.innerWidth);
      this.screenHeightSubject.next(window.innerHeight);
    };
    window.addEventListener('resize', this.resizeListener);
  }
}
