import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  DEFAULT_VIEWPORT_CONTENT,
  READER_LOCKED_VIEWPORT_CONTENT,
  acquireReaderBrowserZoomLock,
  getBrowserPageZoomScale,
  isBrowserPageZoomed,
  releaseReaderBrowserZoomLock,
  resetBrowserPageZoom,
  resetReaderBrowserZoomLockStateForTests,
  shouldLockReaderBrowserZoom
} from './visual-viewport.util';

describe('visual-viewport.util', () => {
  let meta: HTMLMetaElement;

  afterEach(() => {
    vi.restoreAllMocks();
    resetReaderBrowserZoomLockStateForTests();
    meta?.remove();
  });

  function installMeta(content = DEFAULT_VIEWPORT_CONTENT): HTMLMetaElement {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = content;
    document.head.appendChild(meta);
    return meta;
  }

  it('reports page zoom from visualViewport.scale and offsets', () => {
    expect(getBrowserPageZoomScale({visualViewport: undefined} as Window)).toBe(1);
    expect(isBrowserPageZoomed({
      visualViewport: {scale: 1, offsetTop: 0, offsetLeft: 0}
    } as Window)).toBe(false);
    expect(isBrowserPageZoomed({
      visualViewport: {scale: 1.25, offsetTop: 0, offsetLeft: 0}
    } as Window)).toBe(true);
    expect(isBrowserPageZoomed({
      visualViewport: {scale: 1, offsetTop: 40, offsetLeft: 0}
    } as Window)).toBe(true);
  });

  it('locks and unlocks the viewport meta with nested acquires', () => {
    installMeta();
    acquireReaderBrowserZoomLock();
    expect(meta.content).toBe(READER_LOCKED_VIEWPORT_CONTENT);
    acquireReaderBrowserZoomLock();
    expect(meta.content).toBe(READER_LOCKED_VIEWPORT_CONTENT);
    releaseReaderBrowserZoomLock();
    expect(meta.content).toBe(READER_LOCKED_VIEWPORT_CONTENT);
    releaseReaderBrowserZoomLock();
    // unlock restores on rAF
    return new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        expect(meta.content).toBe(DEFAULT_VIEWPORT_CONTENT);
        resolve();
      });
    });
  });

  it('resetBrowserPageZoom briefly locks then restores the prior meta', () => {
    installMeta(DEFAULT_VIEWPORT_CONTENT);
    resetBrowserPageZoom();
    expect(meta.content).toBe(READER_LOCKED_VIEWPORT_CONTENT);
    return new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        expect(meta.content).toBe(DEFAULT_VIEWPORT_CONTENT);
        resolve();
      });
    });
  });

  it('locks reader browser zoom only for touch non-phone layouts', () => {
    expect(shouldLockReaderBrowserZoom({isPhone: true, hasTouchInput: true})).toBe(false);
    expect(shouldLockReaderBrowserZoom({isPhone: false, hasTouchInput: false})).toBe(false);
    expect(shouldLockReaderBrowserZoom({isPhone: false, hasTouchInput: true})).toBe(true);
  });
});
