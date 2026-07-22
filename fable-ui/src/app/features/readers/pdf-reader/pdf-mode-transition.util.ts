import type {PageViewModeType} from 'ngx-extended-pdf-viewer';

/**
 * Whether a `pageViewMode` transition needs a forced viewer relayout.
 *
 * Background: `ngx-extended-pdf-viewer` uses the bundled PageFlip renderer for
 * `pageViewMode === 'book'`. Turning PageFlip on/off mutates the viewer's
 * container DOM (extra overlay, absolute positioning, transformed canvases).
 * When pdf.js then switches to a "normal" flow mode (single / multiple /
 * infinite-scroll / horizontal / wrapped) it does not always refit
 * `page-fit` / `page-width` to the new container geometry, nor does it
 * re-anchor the current page. The user sees pages shrunken to a tiny
 * thumbnail parked in the top-left corner of the viewer.
 *
 * Non-book ↔ non-book transitions (e.g. vertical ↔ wrapped ↔ single) are
 * handled correctly by pdf.js's own scroll-mode logic and do NOT need extra
 * intervention — forcing a relayout there tends to add a visible scroll jump.
 *
 * We therefore only trigger the extra relayout when Book Mode is on one side
 * of the transition.
 */
export function needsRelayoutForPageViewModeTransition(
  from: PageViewModeType | undefined,
  to: PageViewModeType | undefined,
): boolean {
  if (!from || !to) return false;
  if (from === to) return false;
  return from === 'book' || to === 'book';
}

/**
 * PDF.js theme defaults `#viewerContainer` to `inset: 32px 0 0`.
 * ngx-extended-pdf-viewer then overwrites `style.top` from the measured
 * toolbar height, flooring anything under 33px to `33px`.
 *
 * If the custom toolbar is taller than that top inset (or measurement races
 * before layout), page-fit sizes against a container that is taller than the
 * visible area under the header → a small vertical scrollbar.
 */
export const PDF_TOOLBAR_HEIGHT_FALLBACK_PX = 32;

export function resolvePdfViewerTopPx(toolbarHeightPx: number | null | undefined): number {
  const measured = Math.ceil(Number(toolbarHeightPx) || 0);
  if (measured < 33) {
    return 33;
  }
  return measured;
}

