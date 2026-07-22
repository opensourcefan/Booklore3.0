export type PdfTouchNavAxis = 'horizontal' | 'vertical';

export interface PdfTouchNavConfig {
  enabled: boolean;
  axis: PdfTouchNavAxis;
  modeLabelKey: string;
}

/** Mirrors PDF.js / ngx-extended-pdf-viewer ScrollMode. */
export enum PdfScrollMode {
  UNKNOWN = -1,
  VERTICAL = 0,
  HORIZONTAL = 1,
  WRAPPED = 2,
  PAGE = 3,
  INFINITE = 4,
}

export interface TouchPoint {
  x: number;
  y: number;
}

export type TouchNavAction = 'none' | 'previous' | 'next';

const EDGE_FRACTION = 0.22;
const TAP_MAX_DELTA = 18;
const TAP_MAX_DURATION_MS = 350;
const SWIPE_MIN_DISTANCE = 50;

export function resolvePdfTouchNavConfig(
  scrollMode: number,
  pageViewMode: string,
  hasTouchInput: boolean,
): PdfTouchNavConfig {
  if (!hasTouchInput) {
    return {enabled: false, axis: 'horizontal', modeLabelKey: ''};
  }

  if (scrollMode === PdfScrollMode.VERTICAL || scrollMode === PdfScrollMode.INFINITE) {
    return {enabled: false, axis: 'vertical', modeLabelKey: ''};
  }

  if (pageViewMode === 'book') {
    return {enabled: true, axis: 'horizontal', modeLabelKey: 'readerPdf.touch.bookModeHint'};
  }

  if (scrollMode === PdfScrollMode.PAGE || pageViewMode === 'single') {
    return {enabled: true, axis: 'vertical', modeLabelKey: 'readerPdf.touch.singlePageHint'};
  }

  if (scrollMode === PdfScrollMode.HORIZONTAL) {
    return {enabled: true, axis: 'horizontal', modeLabelKey: 'readerPdf.touch.horizontalHint'};
  }

  return {enabled: true, axis: 'horizontal', modeLabelKey: 'readerPdf.touch.wrappedHint'};
}

export function isTouchTap(
  deltaX: number,
  deltaY: number,
  durationMs: number,
  moved: boolean,
): boolean {
  return !moved
    && Math.abs(deltaX) < TAP_MAX_DELTA
    && Math.abs(deltaY) < TAP_MAX_DELTA
    && durationMs < TAP_MAX_DURATION_MS;
}

export function resolveEdgeTapAction(clientX: number, viewportWidth: number): TouchNavAction {
  const leftEdge = viewportWidth * EDGE_FRACTION;
  const rightEdge = viewportWidth * (1 - EDGE_FRACTION);

  if (clientX <= leftEdge) {
    return 'previous';
  }
  if (clientX >= rightEdge) {
    return 'next';
  }
  return 'none';
}

export function resolveEdgeTapNavigation(
  deltaX: number,
  deltaY: number,
  durationMs: number,
  moved: boolean,
  clientX: number,
  viewportWidth: number,
): TouchNavAction {
  if (!isTouchTap(deltaX, deltaY, durationMs, moved)) {
    return 'none';
  }
  return resolveEdgeTapAction(clientX, viewportWidth);
}

export function resolveCenterSwipeAction(
  start: TouchPoint,
  end: TouchPoint,
  viewportWidth: number,
  axis: PdfTouchNavAxis,
): TouchNavAction {
  const leftEdge = viewportWidth * EDGE_FRACTION;
  const rightEdge = viewportWidth * (1 - EDGE_FRACTION);

  if (start.x <= leftEdge || start.x >= rightEdge) {
    return 'none';
  }

  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;

  if (axis === 'horizontal') {
    if (Math.abs(deltaX) >= SWIPE_MIN_DISTANCE && Math.abs(deltaX) > Math.abs(deltaY)) {
      return deltaX < 0 ? 'next' : 'previous';
    }
    return 'none';
  }

  if (Math.abs(deltaY) >= SWIPE_MIN_DISTANCE && Math.abs(deltaY) > Math.abs(deltaX)) {
    return deltaY < 0 ? 'next' : 'previous';
  }
  return 'none';
}
