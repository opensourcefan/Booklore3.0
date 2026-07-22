import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

/**
 * Regression tests for the PDF reader Book Mode / navigation-mode toolbar wiring.
 *
 * Historical context:
 *   Before the fix, the custom PDF toolbar rendered `<pdf-book-mode>`,
 *   `<pdf-single-page-mode>`, `<pdf-vertical-scroll-mode>` etc. with **zero**
 *   input/output bindings. That made Book Mode a complete no-op (the button
 *   only exposes an Angular EventEmitter — it never touches the pdf.js event
 *   bus) and left other mode buttons with stale `[toggled]` state, so they
 *   could not be visually deselected once activated.
 *
 * These tests verify the bindings survive future refactors, using a
 * DOM-backed approach on the raw template file so a broken binding
 * (missing/renamed attribute) fails the build without spinning up the full
 * ngx-extended-pdf-viewer + PDF.js runtime.
 */
describe('pdf-reader template bindings (Book Mode regression)', () => {
  const template = readFileSync(
    resolve(__dirname, 'pdf-reader.component.html'),
    'utf-8'
  );

  /**
   * Extracts the attribute list on the *first* opening tag with the given
   * element name. Enough for a single-instance element in this template.
   */
  function attrsOf(tag: string): string {
    // Match "<tag" followed by attribute chars until the closing ">".
    const match = template.match(new RegExp(`<${tag}\\b([\\s\\S]*?)>`));
    if (!match) {
      throw new Error(`Element <${tag}> not found in template`);
    }
    return match[1];
  }

  it('wires two-way pageViewMode binding on <ngx-extended-pdf-viewer>', () => {
    // This is what makes Book Mode actually activate — without it the
    // pdf-book-mode button's EventEmitter has no listener.
    const attrs = attrsOf('ngx-extended-pdf-viewer');
    expect(attrs).toContain('[(pageViewMode)]="pageViewMode"');
  });

  it.each([
    'pdf-book-mode',
    'pdf-single-page-mode',
    'pdf-vertical-scroll-mode',
    'pdf-horizontal-scroll',
    'pdf-wrapped-scroll-mode',
    'pdf-infinite-scroll',
  ])('wires page/scroll mode + pageViewModeChange handler on <%s>', (tag) => {
    const attrs = attrsOf(tag);
    // Toggled-state inputs so the button reflects the current mode.
    expect(attrs).toContain('[pageViewMode]="pageViewMode"');
    expect(attrs).toContain('[scrollMode]="scrollMode"');
    // Click forwarding: without this, book mode is a no-op and any other
    // mode button that emits pageViewModeChange stays visually stuck.
    expect(attrs).toContain('(pageViewModeChange)="onPageViewModeChange($event)"');
  });

  it.each([
    'pdf-no-spread',
    'pdf-odd-spread',
    'pdf-even-spread',
  ])('passes scrollMode to <%s> so it disables correctly in horizontal scroll', (tag) => {
    // Spread buttons in the library disable themselves when scrollMode === 1
    // (horizontal). Without the [scrollMode] input, they never disable.
    const attrs = attrsOf(tag);
    expect(attrs).toContain('[scrollMode]="scrollMode"');
  });
});
