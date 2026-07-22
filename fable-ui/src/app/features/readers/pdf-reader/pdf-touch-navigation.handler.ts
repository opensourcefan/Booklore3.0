/**
 * PDF touch navigation for non-phone touch devices.
 *
 * Provides tap-zone and swipe-based page navigation for page-based PDF scroll
 * modes (single-page, book, horizontal). Disabled in continuous scroll modes
 * where native finger scrolling handles navigation.
 *
 * Follows the same pattern as the CBX reader's panel touch zones.
 */

/** Scroll modes from PDF.js (ScrollMode enum). */
export const enum PdfScrollMode {
  Vertical = 0,
  Horizontal = 1,
  Wrapped = 2,
  /** Single-page / book are page-based — viewer uses scrollMode 3. */
  Page = 3,
}

export interface PdfTouchNavigationConfig {
  /** The container element to listen on (the ngx-extended-pdf-viewer host). */
  container: HTMLElement;
  /** Called to navigate backward (prev page, or -2 in spread). */
  onPrev: () => void;
  /** Called to navigate forward (next page, or +2 in spread). */
  onNext: () => void;
  /** Called when the first touch interaction occurs (to dismiss hint). */
  onFirstTouch: () => void;
}

/**
 * Manages touch event listeners for PDF page navigation.
 * Create one instance per PDF reader lifecycle, call `destroy()` on teardown.
 */
export class PdfTouchNavigationHandler {
  /** Left/right fraction of viewport that acts as a tap zone. */
  private readonly TAP_ZONE_FRACTION = 0.22;
  /** Minimum horizontal swipe distance in CSS px. */
  private readonly MIN_SWIPE_PX = 60;
  /** Maximum vertical drift before swipe is cancelled. */
  private readonly MAX_VERTICAL_DRIFT_PX = 48;
  /** Maximum duration for a tap (vs drag/hold) in ms. */
  private readonly MAX_TAP_DURATION_MS = 300;

  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private touchStartPointerId: number | null = null;
  private firstTouchFired = false;

  /** Whether touch navigation should process events (page-based mode + active). */
  private _active = false;

  constructor(private config: PdfTouchNavigationConfig) {
    this.attachListeners();
  }

  /** Enable/disable based on current scroll mode. */
  set active(value: boolean) {
    this._active = value;
  }

  get active(): boolean {
    return this._active;
  }

  destroy(): void {
    this.detachListeners();
  }

  // --- Event handlers (bound as arrow functions for stable references) ---

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this._active) return;
    // Only single-finger touch
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    if (this.touchStartPointerId != null) return; // already tracking a finger

    // Ignore touches on toolbar, sidebar, form fields, buttons
    if (this.isInteractiveTarget(event.target)) return;

    this.touchStartPointerId = event.pointerId;
    this.touchStartX = event.clientX;
    this.touchStartY = event.clientY;
    this.touchStartTime = Date.now();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.touchStartPointerId == null || event.pointerId !== this.touchStartPointerId) return;

    const startX = this.touchStartX;
    const startY = this.touchStartY;
    const startTime = this.touchStartTime;
    this.clearTouch();

    if (!this._active) return;
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;

    const deltaX = event.clientX - startX;
    const deltaY = Math.abs(event.clientY - startY);
    const duration = Date.now() - startTime;

    // Fire first-touch callback
    if (!this.firstTouchFired) {
      this.firstTouchFired = true;
      this.config.onFirstTouch();
    }

    // Swipe detection (longer horizontal gestures)
    if (Math.abs(deltaX) >= this.MIN_SWIPE_PX && deltaY <= this.MAX_VERTICAL_DRIFT_PX) {
      if (deltaX < 0) {
        // Swipe left → next page (book convention)
        this.config.onNext();
      } else {
        // Swipe right → prev page
        this.config.onPrev();
      }
      return;
    }

    // Tap detection (short duration, minimal movement)
    if (duration <= this.MAX_TAP_DURATION_MS && Math.abs(deltaX) < 20 && deltaY < 20) {
      const containerRect = this.config.container.getBoundingClientRect();
      const relativeX = event.clientX - containerRect.left;
      const containerWidth = containerRect.width;

      if (relativeX < containerWidth * this.TAP_ZONE_FRACTION) {
        // Left edge tap → prev
        this.config.onPrev();
      } else if (relativeX > containerWidth * (1 - this.TAP_ZONE_FRACTION)) {
        // Right edge tap → next
        this.config.onNext();
      }
      // Center tap: do nothing (let PDF.js handle it for link clicks etc.)
    }
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.touchStartPointerId != null && event.pointerId === this.touchStartPointerId) {
      this.clearTouch();
    }
  };

  private clearTouch(): void {
    this.touchStartPointerId = null;
    this.touchStartX = 0;
    this.touchStartY = 0;
    this.touchStartTime = 0;
  }

  /** Returns true if the touch target is an interactive element we shouldn't steal from. */
  private isInteractiveTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    return !!target.closest(
      '#toolbarViewer, #toolbarSidebar, #toolbarSidebarLeft, ' +
      '#sidebarContainer, .sidebar, .sidebar-overlay, ' +
      'button, a, input, select, textarea, ' +
      '[contenteditable="true"], [data-no-touch-nav], ' +
      '.bookmark-dialog, .bookmark-dialog-overlay, ' +
      '.annotationEditorLayer, .freeTextEditor, ' +
      '#secondaryToolbar, #findbar, ' +
      '.pdf-sidebar, .pdf-touch-zones'
    );
  }

  private attachListeners(): void {
    const el = this.config.container;
    el.addEventListener('pointerdown', this.onPointerDown, {passive: true});
    el.addEventListener('pointerup', this.onPointerUp, {passive: true});
    el.addEventListener('pointercancel', this.onPointerCancel, {passive: true});
  }

  private detachListeners(): void {
    const el = this.config.container;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerCancel);
  }
}
