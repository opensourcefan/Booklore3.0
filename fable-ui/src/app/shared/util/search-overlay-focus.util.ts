/**
 * Gesture-safe focus helpers for search-only overlays (dialogs / popovers).
 * Synchronous + microtask attempts preserve user-activation for desktop OSK;
 * rAF / short timeouts remain as mount-timing backups for phones.
 */

export type SearchInputResolver = () => HTMLInputElement | null | undefined;

export interface SearchOverlayFocusHandle {
  clear: () => void;
}

interface NavigatorWithVirtualKeyboard {
  virtualKeyboard?: {
    show: () => void;
    hide: () => void;
  };
}

export function detectHasTouchInput(
  win: Window & typeof globalThis = window
): boolean {
  if (typeof win === 'undefined') {
    return false;
  }
  try {
    if (typeof win.navigator !== 'undefined' && win.navigator.maxTouchPoints > 0) {
      return true;
    }
  } catch {
    // ignore
  }
  return 'ontouchstart' in win;
}

function tryShowVirtualKeyboard(win: Window & typeof globalThis = window): void {
  try {
    const nav = win.navigator as NavigatorWithVirtualKeyboard;
    nav.virtualKeyboard?.show?.();
  } catch {
    // Virtual Keyboard API is Chromium-only and may throw if unsupported.
  }
}

/**
 * Focus a search input so the on-screen keyboard can open after a user tap.
 * Returns a handle to cancel pending retries (call on blur / destroy).
 */
export function focusSearchOverlayInput(
  resolve: SearchInputResolver,
  options?: {
    onFocused?: (input: HTMLInputElement) => void;
    requestVirtualKeyboard?: boolean;
  }
): SearchOverlayFocusHandle {
  const timeouts: ReturnType<typeof setTimeout>[] = [];
  let cancelled = false;
  const requestVirtualKeyboard = options?.requestVirtualKeyboard !== false;

  const clear = (): void => {
    cancelled = true;
    for (const id of timeouts) {
      clearTimeout(id);
    }
    timeouts.length = 0;
  };

  const tryFocus = (): boolean => {
    if (cancelled) {
      return false;
    }
    const input = resolve() ?? null;
    if (!input) {
      return false;
    }
    input.focus({preventScroll: true});
    options?.onFocused?.(input);
    if (requestVirtualKeyboard) {
      tryShowVirtualKeyboard();
    }
    return true;
  };

  // Same user-gesture turn (best chance for desktop touch OSK).
  tryFocus();

  if (typeof queueMicrotask === 'function') {
    queueMicrotask(() => {
      tryFocus();
    });
  }

  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      tryFocus();
      timeouts.push(setTimeout(tryFocus, 50));
      timeouts.push(setTimeout(tryFocus, 150));
    });
  } else {
    timeouts.push(setTimeout(tryFocus, 0));
    timeouts.push(setTimeout(tryFocus, 50));
    timeouts.push(setTimeout(tryFocus, 150));
  }

  return {clear};
}

export function blurSearchOverlayInput(resolve: SearchInputResolver): void {
  const input = resolve() ?? null;
  input?.blur();
  try {
    const nav = navigator as NavigatorWithVirtualKeyboard;
    nav.virtualKeyboard?.hide?.();
  } catch {
    // ignore
  }
}
