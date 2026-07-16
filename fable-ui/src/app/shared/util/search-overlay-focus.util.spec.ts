import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  blurSearchOverlayInput,
  detectHasTouchInput,
  focusSearchOverlayInput
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
  });
});
