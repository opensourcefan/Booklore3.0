/**
 * Desktop Linux / Chromium touch often synthesizes follow-up mouse click (and
 * sometimes mousedown) events after a touch opens an overlay. Those "ghost"
 * events hit the newly created backdrop and immediately dismiss the UI.
 */

export const OVERLAY_GHOST_CLICK_MS = 400;

export class GhostClickGuard {
  private armedUntil = 0;

  arm(durationMs: number = OVERLAY_GHOST_CLICK_MS): void {
    this.armedUntil = performance.now() + durationMs;
  }

  shouldIgnore(): boolean {
    return performance.now() < this.armedUntil;
  }
}

/** True when the event originated on the element that owns the listener. */
export function isEventOnCurrentTarget(event: Event): boolean {
  return event.target === event.currentTarget;
}

/**
 * Whether an overlay/backdrop dismiss handler should run.
 * Pass a guard armed when the overlay opened to ignore ghost clicks.
 */
export function shouldDismissOverlay(event: Event, guard?: GhostClickGuard): boolean {
  if (guard?.shouldIgnore()) {
    return false;
  }
  return isEventOnCurrentTarget(event);
}
