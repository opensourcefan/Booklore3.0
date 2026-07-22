import {
  PdfScrollMode,
  isTouchTap,
  resolveCenterSwipeAction,
  resolveEdgeTapAction,
  resolveEdgeTapNavigation,
  resolvePdfTouchNavConfig,
} from './pdf-touch-nav.util';

describe('pdf-touch-nav.util', () => {
  describe('resolvePdfTouchNavConfig', () => {
    it('disables touch nav without touch input', () => {
      expect(resolvePdfTouchNavConfig(PdfScrollMode.PAGE, 'single', false).enabled).toBe(false);
    });

    it('disables touch nav in vertical and infinite scroll', () => {
      expect(resolvePdfTouchNavConfig(PdfScrollMode.VERTICAL, 'multiple', true).enabled).toBe(false);
      expect(resolvePdfTouchNavConfig(PdfScrollMode.INFINITE, 'infinite-scroll', true).enabled).toBe(false);
    });

    it('enables vertical nav in single-page mode', () => {
      const config = resolvePdfTouchNavConfig(PdfScrollMode.PAGE, 'single', true);
      expect(config.enabled).toBe(true);
      expect(config.axis).toBe('vertical');
    });

    it('enables horizontal nav in book mode', () => {
      const config = resolvePdfTouchNavConfig(PdfScrollMode.PAGE, 'book', true);
      expect(config.enabled).toBe(true);
      expect(config.axis).toBe('horizontal');
    });
  });

  describe('resolveEdgeTapAction', () => {
    it('maps left and right edges to page turns', () => {
      expect(resolveEdgeTapAction(100, 1000)).toBe('previous');
      expect(resolveEdgeTapAction(900, 1000)).toBe('next');
      expect(resolveEdgeTapAction(500, 1000)).toBe('none');
    });
  });

  describe('resolveEdgeTapNavigation', () => {
    it('maps edge taps to page turns', () => {
      expect(resolveEdgeTapNavigation(0, 0, 200, false, 100, 1000)).toBe('previous');
      expect(resolveEdgeTapNavigation(0, 0, 200, false, 900, 1000)).toBe('next');
      expect(resolveEdgeTapNavigation(0, 0, 200, false, 500, 1000)).toBe('none');
      expect(resolveEdgeTapNavigation(30, 0, 200, false, 100, 1000)).toBe('none');
    });
  });

  describe('resolveCenterSwipeAction', () => {
    const viewportWidth = 1000;
    const centerStart = {x: 500, y: 400};

    it('ignores swipes that start on edges', () => {
      expect(resolveCenterSwipeAction({x: 50, y: 400}, {x: 200, y: 400}, viewportWidth, 'horizontal'))
        .toBe('none');
    });

    it('maps horizontal swipes to page turns', () => {
      expect(resolveCenterSwipeAction(centerStart, {x: 400, y: 405}, viewportWidth, 'horizontal')).toBe('next');
      expect(resolveCenterSwipeAction(centerStart, {x: 600, y: 395}, viewportWidth, 'horizontal')).toBe('previous');
    });

    it('maps vertical swipes to page turns', () => {
      expect(resolveCenterSwipeAction(centerStart, {x: 505, y: 300}, viewportWidth, 'vertical')).toBe('next');
      expect(resolveCenterSwipeAction(centerStart, {x: 495, y: 500}, viewportWidth, 'vertical')).toBe('previous');
    });
  });

  describe('isTouchTap', () => {
    it('detects short stationary touches', () => {
      expect(isTouchTap(0, 0, 200, false)).toBe(true);
      expect(isTouchTap(30, 0, 200, false)).toBe(false);
      expect(isTouchTap(0, 0, 500, false)).toBe(false);
      expect(isTouchTap(0, 0, 200, true)).toBe(false);
    });
  });
});
