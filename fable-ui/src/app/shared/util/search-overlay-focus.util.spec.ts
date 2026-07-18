import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  blurSearchOverlayInput,
  detectHasTouchInput,
  focusSearchOverlayInput,
  shouldUseChromiumVirtualKeyboard
} from './search-overlay-focus.util';

describe('search-overlay-focus.util', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('detectHasTouchInput', () => {
    it('returns true when maxTouchPoints > 0', () => {
      const win = {
        navigator: {maxTouchPoints: 2},
      } as unknown as Window & typeof globalThis;
      expect(detectHasTouchInput(win)).toBe(true);
    });

    it('returns true when ontouchstart is present', () => {
      const win = {
        navigator: {maxTouchPoints: 0},
        ontouchstart: null,
      } as unknown as Window & typeof globalThis;
      expect(detectHasTouchInput(win)).toBe(true);
    });

    it('returns false when no touch capability is exposed', () => {
      const win = {
        navigator: {maxTouchPoints: 0},
      } as unknown as Window & typeof globalThis;
      expect(detectHasTouchInput(win)).toBe(false);
    });
  });

  describe('shouldUseChromiumVirtualKeyboard', () => {
    it('is false on fine-pointer desktops (Duet / Linux Chromium)', () => {
      const win = {
        matchMedia: (query: string) => ({
          matches: query.includes('pointer: fine')
        })
      } as unknown as Window & typeof globalThis;

      expect(shouldUseChromiumVirtualKeyboard(win)).toBe(false);
    });

    it('is true on coarse-pointer phones so Phone Mode keeps VK API', () => {
      const win = {
        matchMedia: (query: string) => ({
          matches: query.includes('pointer: coarse')
        })
      } as unknown as Window & typeof globalThis;

      expect(shouldUseChromiumVirtualKeyboard(win)).toBe(true);
    });
  });

  describe('focusSearchOverlayInput', () => {
    let input: HTMLInputElement;
    let focusSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      input = document.createElement('input');
      document.body.appendChild(input);
      focusSpy = vi.spyOn(input, 'focus');
    });

    afterEach(() => {
      input.remove();
    });

    it('focuses synchronously on the first attempt', () => {
      const onFocused = vi.fn();
      const handle = focusSearchOverlayInput(() => input, {
        onFocused,
        requestVirtualKeyboard: false
      });

      expect(focusSpy).toHaveBeenCalled();
      expect(onFocused).toHaveBeenCalledWith(input);
      handle.clear();
    });

    it('retries focus after mount delays when the input appears later', () => {
      vi.useFakeTimers();
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        return setTimeout(() => cb(performance.now()), 0) as unknown as number;
      });
      let resolved: HTMLInputElement | null = null;
      const handle = focusSearchOverlayInput(() => resolved, {
        requestVirtualKeyboard: false
      });

      expect(focusSpy).not.toHaveBeenCalled();

      resolved = input;
      vi.runAllTimers();

      expect(focusSpy).toHaveBeenCalled();
      handle.clear();
    });

    it('stops retrying after clear()', () => {
      vi.useFakeTimers();
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        return setTimeout(() => cb(performance.now()), 0) as unknown as number;
      });
      let resolved: HTMLInputElement | null = null;
      const handle = focusSearchOverlayInput(() => resolved, {
        requestVirtualKeyboard: false
      });
      handle.clear();

      resolved = input;
      vi.runAllTimers();

      expect(focusSpy).not.toHaveBeenCalled();
    });

    it('does not call virtualKeyboard.show on fine-pointer by default', () => {
      const show = vi.fn();
      Object.defineProperty(navigator, 'virtualKeyboard', {
        configurable: true,
        value: {show, hide: vi.fn()}
      });
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: (query: string) => ({
          matches: query.includes('pointer: fine'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn()
        })
      });

      const handle = focusSearchOverlayInput(() => input);
      expect(show).not.toHaveBeenCalled();
      handle.clear();
    });
  });

  describe('blurSearchOverlayInput', () => {
    it('blurs the resolved input', () => {
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      const blurSpy = vi.spyOn(input, 'blur');

      blurSearchOverlayInput(() => input);

      expect(blurSpy).toHaveBeenCalled();
      input.remove();
    });

    it('does not call virtualKeyboard.hide on fine-pointer', () => {
      const hide = vi.fn();
      Object.defineProperty(navigator, 'virtualKeyboard', {
        configurable: true,
        value: {show: vi.fn(), hide}
      });
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: (query: string) => ({
          matches: query.includes('pointer: fine'),
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn()
        })
      });

      const input = document.createElement('input');
      document.body.appendChild(input);
      blurSearchOverlayInput(() => input);
      expect(hide).not.toHaveBeenCalled();
      input.remove();
    });
  });
});
