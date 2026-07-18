import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/** Forced layout override, or auto responsive variants derived from viewport size. */
export type LayoutMode = 'auto' | 'auto-shape' | 'phone' | 'tablet' | 'desktop';

const LAYOUT_MODES: ReadonlySet<LayoutMode> = new Set(['auto', 'auto-shape', 'phone', 'tablet', 'desktop']);

function parseLayoutMode(raw: string | null): LayoutMode {
  if (raw && LAYOUT_MODES.has(raw as LayoutMode)) {
    return raw as LayoutMode;
  }
  return 'auto';
}

@Injectable({ providedIn: 'root' })
export class UiPreferencesService {
  private readonly COVER_PREVIEW_KEY = 'bl-show-cover-preview';
  private readonly RESIZE_HANDLES_KEY = 'bl-show-resize-handles';
  private readonly LAYOUT_MODE_KEY = 'bl-layout-mode';
  private readonly PHONE_BREAKPOINT_KEY = 'bl-phone-breakpoint';
  private readonly TABLET_BREAKPOINT_KEY = 'bl-tablet-breakpoint';
  private readonly HEADER_POSITION_KEY = 'bl-header-position';
  private readonly TABLET_HEADER_POSITION_KEY = 'bl-tablet-header-position';
  private readonly TABLET_NAV_GESTURES_KEY = 'bl-tablet-nav-gestures';

  private _showCoverPreview$ = new BehaviorSubject<boolean>(
    localStorage.getItem(this.COVER_PREVIEW_KEY) !== 'false'
  );
  readonly showCoverPreview$ = this._showCoverPreview$.asObservable();
  get showCoverPreview(): boolean { return this._showCoverPreview$.value; }
  setShowCoverPreview(value: boolean): void {
    localStorage.setItem(this.COVER_PREVIEW_KEY, String(value));
    this._showCoverPreview$.next(value);
  }

  /** Always-visible thumb-friendly resize grips for side panels and cover preview. */
  private _showResizeHandles$ = new BehaviorSubject<boolean>(
    localStorage.getItem(this.RESIZE_HANDLES_KEY) === 'true'
  );
  readonly showResizeHandles$ = this._showResizeHandles$.asObservable();
  get showResizeHandles(): boolean { return this._showResizeHandles$.value; }
  setShowResizeHandles(value: boolean): void {
    localStorage.setItem(this.RESIZE_HANDLES_KEY, String(value));
    this._showResizeHandles$.next(value);
  }

  /**
   * Opt-in tablet/kiosk navigation gestures (contextmenu suppress, edge swipe, 3-finger sheet).
   * Never applies in Phone Mode — gated by MobileUxService consumers.
   */
  private _tabletNavGestures$ = new BehaviorSubject<boolean>(
    localStorage.getItem(this.TABLET_NAV_GESTURES_KEY) === 'true'
  );
  readonly tabletNavGestures$ = this._tabletNavGestures$.asObservable();
  get tabletNavGestures(): boolean { return this._tabletNavGestures$.value; }
  setTabletNavGestures(value: boolean): void {
    localStorage.setItem(this.TABLET_NAV_GESTURES_KEY, String(value));
    this._tabletNavGestures$.next(value);
  }

  private _layoutMode$ = new BehaviorSubject<LayoutMode>(
    parseLayoutMode(localStorage.getItem(this.LAYOUT_MODE_KEY))
  );
  readonly layoutMode$ = this._layoutMode$.asObservable();
  get layoutMode(): LayoutMode { return this._layoutMode$.value; }
  setLayoutMode(value: LayoutMode): void {
    localStorage.setItem(this.LAYOUT_MODE_KEY, value);
    this._layoutMode$.next(value);
  }

  private _phoneBreakpoint$ = new BehaviorSubject<number>(
    parseInt(localStorage.getItem(this.PHONE_BREAKPOINT_KEY) || '767', 10)
  );
  readonly phoneBreakpoint$ = this._phoneBreakpoint$.asObservable();
  get phoneBreakpoint(): number { return this._phoneBreakpoint$.value; }
  setPhoneBreakpoint(value: number): void {
    localStorage.setItem(this.PHONE_BREAKPOINT_KEY, String(value));
    this._phoneBreakpoint$.next(value);
  }

  private _tabletBreakpoint$ = new BehaviorSubject<number>(
    parseInt(localStorage.getItem(this.TABLET_BREAKPOINT_KEY) || '1024', 10)
  );
  readonly tabletBreakpoint$ = this._tabletBreakpoint$.asObservable();
  get tabletBreakpoint(): number { return this._tabletBreakpoint$.value; }
  setTabletBreakpoint(value: number): void {
    localStorage.setItem(this.TABLET_BREAKPOINT_KEY, String(value));
    this._tabletBreakpoint$.next(value);
  }

  private _headerPosition$ = new BehaviorSubject<'top' | 'bottom'>(
    (localStorage.getItem(this.HEADER_POSITION_KEY) as 'top' | 'bottom') || 'top'
  );
  readonly headerPosition$ = this._headerPosition$.asObservable();
  get headerPosition(): 'top' | 'bottom' { return this._headerPosition$.value; }
  setHeaderPosition(value: 'top' | 'bottom'): void {
    localStorage.setItem(this.HEADER_POSITION_KEY, value);
    this._headerPosition$.next(value);
  }

  /**
   * Independent of phone header position. Opt-in bottom chrome for tablet layout only
   * (forced tablet, auto tablet band, or auto-shape portrait). Never applies in Phone Mode.
   */
  private _tabletHeaderPosition$ = new BehaviorSubject<'top' | 'bottom'>(
    (localStorage.getItem(this.TABLET_HEADER_POSITION_KEY) as 'top' | 'bottom') || 'top'
  );
  readonly tabletHeaderPosition$ = this._tabletHeaderPosition$.asObservable();
  get tabletHeaderPosition(): 'top' | 'bottom' { return this._tabletHeaderPosition$.value; }
  setTabletHeaderPosition(value: 'top' | 'bottom'): void {
    localStorage.setItem(this.TABLET_HEADER_POSITION_KEY, value);
    this._tabletHeaderPosition$.next(value);
  }
}
