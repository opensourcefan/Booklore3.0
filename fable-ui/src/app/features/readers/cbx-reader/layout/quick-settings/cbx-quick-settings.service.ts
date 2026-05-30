import {Injectable} from '@angular/core';
import {BehaviorSubject, Subject} from 'rxjs';
import {CbxBackgroundColor, CbxFitMode, CbxMagnifierLensSize, CbxMagnifierZoom, CbxPageSpread, CbxPageViewMode, CbxScrollMode, CbxReadingDirection, CbxSlideshowInterval} from '../../../../settings/user-management/user.service';

export type CbxJoystickSensitivity = 'SLOW' | 'NORMAL' | 'FAST';

export interface CbxQuickSettingsState {
  fitMode: CbxFitMode;
  scrollMode: CbxScrollMode;
  pageViewMode: CbxPageViewMode;
  pageSpread: CbxPageSpread;
  backgroundColor: CbxBackgroundColor;
  readingDirection: CbxReadingDirection;
  slideshowInterval: CbxSlideshowInterval;
  magnifierZoom: CbxMagnifierZoom;
  magnifierLensSize: CbxMagnifierLensSize;
  joystickEnabled: boolean;
  joystickSensitivity: CbxJoystickSensitivity;
  joystickPositionLocked: boolean;
  joystickRecenterOnTouch: boolean;
  joystickIndicatorVisible: boolean;
  joystickIndicatorOpacity: number;
}

@Injectable()
export class CbxQuickSettingsService {
  private _state = new BehaviorSubject<CbxQuickSettingsState>({
    fitMode: CbxFitMode.FIT_PAGE,
    scrollMode: CbxScrollMode.PAGINATED,
    pageViewMode: CbxPageViewMode.SINGLE_PAGE,
    pageSpread: CbxPageSpread.ODD,
    backgroundColor: CbxBackgroundColor.GRAY,
    readingDirection: CbxReadingDirection.LTR,
    slideshowInterval: CbxSlideshowInterval.FIVE_SECONDS,
    magnifierZoom: CbxMagnifierZoom.ZOOM_3X,
    magnifierLensSize: CbxMagnifierLensSize.MEDIUM,
    joystickEnabled: false,
    joystickSensitivity: 'NORMAL',
    joystickPositionLocked: true,
    joystickRecenterOnTouch: true,
    joystickIndicatorVisible: true,
    joystickIndicatorOpacity: 0.88
  });
  state$ = this._state.asObservable();

  private _visible = new BehaviorSubject<boolean>(false);
  visible$ = this._visible.asObservable();

  private _fitModeChange = new Subject<CbxFitMode>();
  fitModeChange$ = this._fitModeChange.asObservable();

  private _scrollModeChange = new Subject<CbxScrollMode>();
  scrollModeChange$ = this._scrollModeChange.asObservable();

  private _pageViewModeChange = new Subject<CbxPageViewMode>();
  pageViewModeChange$ = this._pageViewModeChange.asObservable();

  private _pageSpreadChange = new Subject<CbxPageSpread>();
  pageSpreadChange$ = this._pageSpreadChange.asObservable();

  private _backgroundColorChange = new Subject<CbxBackgroundColor>();
  backgroundColorChange$ = this._backgroundColorChange.asObservable();

  private _readingDirectionChange = new Subject<CbxReadingDirection>();
  readingDirectionChange$ = this._readingDirectionChange.asObservable();

  private _slideshowIntervalChange = new Subject<CbxSlideshowInterval>();
  slideshowIntervalChange$ = this._slideshowIntervalChange.asObservable();

  private _magnifierZoomChange = new Subject<CbxMagnifierZoom>();
  magnifierZoomChange$ = this._magnifierZoomChange.asObservable();

  private _magnifierLensSizeChange = new Subject<CbxMagnifierLensSize>();
  magnifierLensSizeChange$ = this._magnifierLensSizeChange.asObservable();

  private _joystickEnabledChange = new Subject<boolean>();
  joystickEnabledChange$ = this._joystickEnabledChange.asObservable();

  private _joystickSensitivityChange = new Subject<CbxJoystickSensitivity>();
  joystickSensitivityChange$ = this._joystickSensitivityChange.asObservable();

  private _joystickPositionLockedChange = new Subject<boolean>();
  joystickPositionLockedChange$ = this._joystickPositionLockedChange.asObservable();

  private _joystickRecenterOnTouchChange = new Subject<boolean>();
  joystickRecenterOnTouchChange$ = this._joystickRecenterOnTouchChange.asObservable();

  private _joystickIndicatorVisibleChange = new Subject<boolean>();
  joystickIndicatorVisibleChange$ = this._joystickIndicatorVisibleChange.asObservable();

  private _joystickIndicatorOpacityChange = new Subject<number>();
  joystickIndicatorOpacityChange$ = this._joystickIndicatorOpacityChange.asObservable();

  get state(): CbxQuickSettingsState {
    return this._state.value;
  }

  get isVisible(): boolean {
    return this._visible.value;
  }

  show(): void {
    this._visible.next(true);
  }

  close(): void {
    this._visible.next(false);
  }

  updateState(partial: Partial<CbxQuickSettingsState>): void {
    this._state.next({...this._state.value, ...partial});
  }

  setFitMode(mode: CbxFitMode): void {
    this.updateState({fitMode: mode});
  }

  setScrollMode(mode: CbxScrollMode): void {
    this.updateState({scrollMode: mode});
  }

  setPageViewMode(mode: CbxPageViewMode): void {
    this.updateState({pageViewMode: mode});
  }

  setPageSpread(spread: CbxPageSpread): void {
    this.updateState({pageSpread: spread});
  }

  setBackgroundColor(color: CbxBackgroundColor): void {
    this.updateState({backgroundColor: color});
  }

  setReadingDirection(direction: CbxReadingDirection): void {
    this.updateState({readingDirection: direction});
  }

  setSlideshowInterval(interval: CbxSlideshowInterval): void {
    this.updateState({slideshowInterval: interval});
  }

  setMagnifierZoom(zoom: CbxMagnifierZoom): void {
    this.updateState({magnifierZoom: zoom});
  }

  setMagnifierLensSize(size: CbxMagnifierLensSize): void {
    this.updateState({magnifierLensSize: size});
  }

  setJoystickEnabled(enabled: boolean): void {
    this.updateState({joystickEnabled: enabled});
  }

  setJoystickSensitivity(sensitivity: CbxJoystickSensitivity): void {
    this.updateState({joystickSensitivity: sensitivity});
  }

  setJoystickPositionLocked(locked: boolean): void {
    this.updateState({joystickPositionLocked: locked});
  }

  setJoystickRecenterOnTouch(enabled: boolean): void {
    this.updateState({joystickRecenterOnTouch: enabled});
  }

  setJoystickIndicatorVisible(visible: boolean): void {
    this.updateState({joystickIndicatorVisible: visible});
  }

  setJoystickIndicatorOpacity(opacity: number): void {
    this.updateState({joystickIndicatorOpacity: opacity});
  }

  // Actions emitted from component
  emitFitModeChange(mode: CbxFitMode): void {
    this._fitModeChange.next(mode);
  }

  emitScrollModeChange(mode: CbxScrollMode): void {
    this._scrollModeChange.next(mode);
  }

  emitPageViewModeChange(mode: CbxPageViewMode): void {
    this._pageViewModeChange.next(mode);
  }

  emitPageSpreadChange(spread: CbxPageSpread): void {
    this._pageSpreadChange.next(spread);
  }

  emitBackgroundColorChange(color: CbxBackgroundColor): void {
    this._backgroundColorChange.next(color);
  }

  emitReadingDirectionChange(direction: CbxReadingDirection): void {
    this._readingDirectionChange.next(direction);
  }

  emitSlideshowIntervalChange(interval: CbxSlideshowInterval): void {
    this._slideshowIntervalChange.next(interval);
  }

  emitMagnifierZoomChange(zoom: CbxMagnifierZoom): void {
    this._magnifierZoomChange.next(zoom);
  }

  emitMagnifierLensSizeChange(size: CbxMagnifierLensSize): void {
    this._magnifierLensSizeChange.next(size);
  }

  emitJoystickEnabledChange(enabled: boolean): void {
    this._joystickEnabledChange.next(enabled);
  }

  emitJoystickSensitivityChange(sensitivity: CbxJoystickSensitivity): void {
    this._joystickSensitivityChange.next(sensitivity);
  }

  emitJoystickPositionLockedChange(locked: boolean): void {
    this._joystickPositionLockedChange.next(locked);
  }

  emitJoystickRecenterOnTouchChange(enabled: boolean): void {
    this._joystickRecenterOnTouchChange.next(enabled);
  }

  emitJoystickIndicatorVisibleChange(visible: boolean): void {
    this._joystickIndicatorVisibleChange.next(visible);
  }

  emitJoystickIndicatorOpacityChange(opacity: number): void {
    this._joystickIndicatorOpacityChange.next(opacity);
  }

  reset(): void {
    this._state.next({
      fitMode: CbxFitMode.FIT_PAGE,
      scrollMode: CbxScrollMode.PAGINATED,
      pageViewMode: CbxPageViewMode.SINGLE_PAGE,
      pageSpread: CbxPageSpread.ODD,
      backgroundColor: CbxBackgroundColor.GRAY,
      readingDirection: CbxReadingDirection.LTR,
      slideshowInterval: CbxSlideshowInterval.FIVE_SECONDS,
      magnifierZoom: CbxMagnifierZoom.ZOOM_3X,
      magnifierLensSize: CbxMagnifierLensSize.MEDIUM,
      joystickEnabled: false,
      joystickSensitivity: 'NORMAL',
      joystickPositionLocked: true,
      joystickRecenterOnTouch: true,
      joystickIndicatorVisible: true,
      joystickIndicatorOpacity: 0.88
    });
    this._visible.next(false);
  }
}
