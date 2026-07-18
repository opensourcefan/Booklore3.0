import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  FULLSCREEN_CHANGE_EVENTS,
  addFullscreenChangeListener,
  clearFullscreenTransientPointerUi,
  getFullscreenElement,
  isAppFullscreen,
  toggleAppFullscreen
} from './fullscreen.util';

describe('fullscreen.util', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.classList.remove('bl-resizing', 'bl-resizing-vertical');
  });

  it('isAppFullscreen reflects getFullscreenElement', () => {
    const doc = {
      fullscreenElement: null,
      webkitFullscreenElement: document.createElement('div')
    } as Document & {webkitFullscreenElement?: Element | null};

    expect(getFullscreenElement(doc)).toBe(doc.webkitFullscreenElement);
    expect(isAppFullscreen(doc)).toBe(true);
  });

  it('clearFullscreenTransientPointerUi removes stuck resize body classes', () => {
    document.body.classList.add('bl-resizing', 'bl-resizing-vertical');
    clearFullscreenTransientPointerUi();
    expect(document.body.classList.contains('bl-resizing')).toBe(false);
    expect(document.body.classList.contains('bl-resizing-vertical')).toBe(false);
  });

  it('toggleAppFullscreen exits when the browser is already fullscreen', async () => {
    const exitFullscreen = vi.fn().mockResolvedValue(undefined);
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => document.documentElement
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen
    });

    await toggleAppFullscreen({requestFullscreen} as unknown as HTMLElement);

    expect(exitFullscreen).toHaveBeenCalledTimes(1);
    expect(requestFullscreen).not.toHaveBeenCalled();

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => null
    });
  });

  it('addFullscreenChangeListener wires standard and webkit events plus visibility', () => {
    const handler = vi.fn();
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const doc = {
      addEventListener,
      removeEventListener,
      visibilityState: 'visible'
    } as unknown as Document;

    const unsubscribe = addFullscreenChangeListener(handler, doc);

    for (const eventName of FULLSCREEN_CHANGE_EVENTS) {
      expect(addEventListener).toHaveBeenCalledWith(eventName, handler);
    }
    expect(addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    unsubscribe();

    for (const eventName of FULLSCREEN_CHANGE_EVENTS) {
      expect(removeEventListener).toHaveBeenCalledWith(eventName, handler);
    }
    expect(removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});
