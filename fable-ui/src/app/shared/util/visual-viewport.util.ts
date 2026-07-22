/**
 * Browser page-zoom (visualViewport) helpers for desktop-touch / tablet readers.
 *
 * Chromium on touch tablets can apply a page-level pinch zoom (visualViewport.scale > 1)
 * even when a reader intends PDF.js / CSS-transform zoom. Fixed chrome then sits on the
 * layout viewport outside the visual viewport — top bars feel "gone" and the library
 * stays "expanded" until Fullscreen API toggle or reload remounts layout.
 *
 * Phone Mode must not acquire the reader zoom lock (viewport meta stays a11y-scalable).
 */

const VIEWPORT_META_SELECTOR = 'meta[name="viewport"]';
export const DEFAULT_VIEWPORT_CONTENT =
  'width=device-width, initial-scale=1, viewport-fit=cover';
export const READER_LOCKED_VIEWPORT_CONTENT =
  'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

let readerZoomLockCount = 0;
let savedViewportContent: string | null = null;

export function getBrowserPageZoomScale(win: Window = window): number {
  return win.visualViewport?.scale ?? 1;
}

export function isBrowserPageZoomed(win: Window = window, epsilon = 0.01): boolean {
  const vv = win.visualViewport;
  if (!vv) {
    return false;
  }
  return Math.abs(vv.scale - 1) > epsilon
    || Math.abs(vv.offsetTop) > 1
    || Math.abs(vv.offsetLeft) > 1;
}

function getViewportMeta(doc: Document = document): HTMLMetaElement | null {
  return doc.querySelector(VIEWPORT_META_SELECTOR);
}

/**
 * Force Chromium visualViewport back toward scale 1 by briefly locking the viewport meta.
 * Safe to call after Fullscreen API transitions or when leaving a reader.
 */
export function resetBrowserPageZoom(doc: Document = document): void {
  const meta = getViewportMeta(doc);
  if (!meta) {
    return;
  }
  const restoreTo = readerZoomLockCount > 0
    ? READER_LOCKED_VIEWPORT_CONTENT
    : (savedViewportContent ?? meta.getAttribute('content') ?? DEFAULT_VIEWPORT_CONTENT);

  meta.setAttribute('content', READER_LOCKED_VIEWPORT_CONTENT);
  // Force style recalc so Chromium applies the lock before we restore.
  void doc.documentElement.offsetHeight;
  requestAnimationFrame(() => {
    meta.setAttribute('content', restoreTo);
  });
}

/**
 * While held, keep the viewport meta non-scalable so browser pinch cannot steal
 * from in-reader zoom (PDF.js / CBX CSS / ebook). Nested acquires are refcounted.
 */
export function acquireReaderBrowserZoomLock(doc: Document = document): void {
  const meta = getViewportMeta(doc);
  if (!meta) {
    return;
  }
  if (readerZoomLockCount === 0) {
    savedViewportContent = meta.getAttribute('content') ?? DEFAULT_VIEWPORT_CONTENT;
  }
  readerZoomLockCount += 1;
  meta.setAttribute('content', READER_LOCKED_VIEWPORT_CONTENT);
  if (isBrowserPageZoomed()) {
    // lockCount > 0 so reset restores to the locked meta, not the scalable one
    resetBrowserPageZoom(doc);
  }
}

export function releaseReaderBrowserZoomLock(doc: Document = document): void {
  if (readerZoomLockCount <= 0) {
    readerZoomLockCount = 0;
    return;
  }
  readerZoomLockCount -= 1;
  if (readerZoomLockCount > 0) {
    return;
  }
  const meta = getViewportMeta(doc);
  const restoreTo = savedViewportContent ?? DEFAULT_VIEWPORT_CONTENT;
  savedViewportContent = null;
  if (!meta) {
    return;
  }
  // Reset any stuck scale while still locked, then restore the prior meta.
  meta.setAttribute('content', READER_LOCKED_VIEWPORT_CONTENT);
  void doc.documentElement.offsetHeight;
  requestAnimationFrame(() => {
    meta.setAttribute('content', restoreTo);
  });
}

export function shouldLockReaderBrowserZoom(opts: {
  isPhone: boolean;
  hasTouchInput: boolean;
}): boolean {
  // Phone Mode stays a11y-scalable; lock only desktop-touch / tablet digitizers.
  return opts.hasTouchInput && !opts.isPhone;
}

/** Test / emergency reset of refcount state. */
export function resetReaderBrowserZoomLockStateForTests(): void {
  readerZoomLockCount = 0;
  savedViewportContent = null;
}
