import {
  resetBrowserPageZoom
} from './visual-viewport.util';

/** Cross-browser Fullscreen helpers (standard API + WebKit aliases). */

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

/** Events that browsers fire when Fullscreen API state changes. */
export const FULLSCREEN_CHANGE_EVENTS = ['fullscreenchange', 'webkitfullscreenchange'] as const;

export function getFullscreenElement(doc: Document = document): Element | null {
  const d = doc as FullscreenDocument;
  return doc.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

export function isAppFullscreen(doc: Document = document): boolean {
  return !!getFullscreenElement(doc);
}

export function requestAppFullscreen(target: HTMLElement = document.documentElement): Promise<void> {
  const el = target as FullscreenElement;
  if (typeof el.requestFullscreen === 'function') {
    return el.requestFullscreen().catch(() => undefined);
  }
  if (typeof el.webkitRequestFullscreen === 'function') {
    return Promise.resolve(el.webkitRequestFullscreen()).catch(() => undefined);
  }
  return Promise.resolve();
}

export function exitAppFullscreen(doc: Document = document): Promise<void> {
  const d = doc as FullscreenDocument;
  if (typeof doc.exitFullscreen === 'function') {
    return doc.exitFullscreen().catch(() => undefined);
  }
  if (typeof d.webkitExitFullscreen === 'function') {
    return Promise.resolve(d.webkitExitFullscreen()).catch(() => undefined);
  }
  return Promise.resolve();
}

/**
 * Toggle based on the live browser Fullscreen API state (not a cached UI flag).
 * This keeps the app button correct when fullscreen was entered/exited outside Fable.
 */
export function toggleAppFullscreen(target: HTMLElement = document.documentElement): Promise<void> {
  if (isAppFullscreen()) {
    return exitAppFullscreen();
  }
  return requestAppFullscreen(target);
}

/**
 * Clear transient drag / pointer-capture UI left on body after a Fullscreen API
 * transition. Chromium (esp. Wayland / desktop-touch) can drop pointerup while
 * keeping setPointerCapture or body.bl-resizing* classes, which steals hits from
 * library cards until reload.
 *
 * Also resets stuck browser page zoom (visualViewport.scale) that can leave the
 * library "expanded" and hide fixed top chrome after tablet pinch-zoom in readers.
 */
export function clearFullscreenTransientPointerUi(doc: Document = document): void {
  doc.body.classList.remove('bl-resizing', 'bl-resizing-vertical');
  resetBrowserPageZoom(doc);
}

/**
 * Subscribe to Fullscreen API changes (standard + webkit) and resync when the
 * document becomes visible again in case an event was missed.
 * Returns an unsubscribe function.
 */
export function addFullscreenChangeListener(
  handler: () => void,
  doc: Document = document
): () => void {
  for (const eventName of FULLSCREEN_CHANGE_EVENTS) {
    doc.addEventListener(eventName, handler);
  }

  const onVisibilityChange = (): void => {
    if (doc.visibilityState === 'visible') {
      handler();
    }
  };
  doc.addEventListener('visibilitychange', onVisibilityChange);

  return () => {
    for (const eventName of FULLSCREEN_CHANGE_EVENTS) {
      doc.removeEventListener(eventName, handler);
    }
    doc.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
