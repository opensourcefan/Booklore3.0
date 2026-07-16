import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/** Forced layout override, or auto (responsive from viewport width). */
export type LayoutMode = 'auto' | 'phone' | 'tablet' | 'desktop';

const LAYOUT_MODES: ReadonlySet<LayoutMode> = new Set(['auto', 'phone', 'tablet', 'desktop']);

function parseLayoutMode(raw: string | null): LayoutMode {
  if (raw && LAYOUT_MODES.has(raw as LayoutMode)) {
    return raw as LayoutMode;
  }
  return 'auto';
}

@Injectable({ providedIn: 'root' })
export class UiPreferencesService {
  private readonly COVER_PREVIEW_KEY = 'bl-show-cover-preview';
  private readonly LAYOUT_MODE_KEY = 'bl-layout-mode';
  private readonly PHONE_BREAKPOINT_KEY = 'bl-phone-breakpoint';
  private readonly TABLET_BREAKPOINT_KEY = 'bl-tablet-breakpoint';
  private readonly HEADER_POSITION_KEY = 'bl-header-position';

  private _showCoverPreview$ = new BehaviorSubject<boolean>(
    localStorage.getItem(this.COVER_PREVIEW_KEY) !== 'false'
  );
  readonly showCoverPreview$ = this._showCoverPreview$.asObservable();
  get showCoverPreview(): boolean { return this._showCoverPreview$.value; }
  setShowCoverPreview(value: boolean): void {
    localStorage.setItem(this.COVER_PREVIEW_KEY, String(value));
    this._showCoverPreview$.next(value);
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
}
