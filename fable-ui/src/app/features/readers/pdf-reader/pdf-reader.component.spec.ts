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

  it('wraps the three spread buttons in a .pdf-spread-group container', () => {
    // The group wrapper is what carries the "book-mode inapplicable" state so
    // the three spread controls can be dimmed together without hiding them.
    const groupMatch = template.match(
      /<span[^>]*class="pdf-spread-group"[\s\S]*?<\/span>/
    );
    expect(groupMatch, 'expected a <span class="pdf-spread-group"> wrapper').not.toBeNull();
    const groupHtml = groupMatch![0];
    expect(groupHtml).toContain('<pdf-no-spread');
    expect(groupHtml).toContain('<pdf-odd-spread');
    expect(groupHtml).toContain('<pdf-even-spread');
  });

  it('greys out the spread group whenever pageViewMode === "book"', () => {
    // In Book Mode the viewer always shows facing pages via PageFlip, so the
    // spread setting is a no-op. The wrapper must gain
    // .pdf-inapplicable-in-book-mode so the SCSS opacity/pointer-events kicks
    // in and users can see the buttons are not part of Book Mode.
    const attrs = template.match(/<span[^>]*class="pdf-spread-group"([\s\S]*?)>/)?.[1] ?? '';
    expect(attrs).toContain(
      '[class.pdf-inapplicable-in-book-mode]="pageViewMode === \'book\'"'
    );
  });
});

describe('pdf-reader toolbar regroup', () => {
  const template = readFileSync(
    resolve(__dirname, 'pdf-reader.component.html'),
    'utf-8'
  );
  const scss = readFileSync(
    resolve(__dirname, 'pdf-reader.component.scss'),
    'utf-8'
  );

  it('widens both Contents and Thumbs nav buttons without flex-shrink', () => {
    expect(template).toMatch(/class="[^"]*toolbar-btn--wide[^"]*fable-panel-btn/);
    expect(template).toMatch(/class="[^"]*toolbar-btn--wide[^"]*pdfjs-thumbs-btn/);
    expect(scss).toContain('.toolbar-btn--wide');
    expect(scss).toMatch(/width:\s*56px\s*!important/);
    expect(scss).toMatch(/flex:\s*0\s+0\s+56px\s*!important/);
  });

  it('centers the zoom/rotate cluster on the full header', () => {
    expect(scss).toMatch(/grid-template-columns:\s*1fr\s+auto\s+1fr/);
    expect(scss).toMatch(/\.pdf-toolbar-middle[\s\S]*justify-self:\s*center/);
    expect(scss).toMatch(/\.pdf-toolbar-middle[\s\S]*gap:\s*0\.55rem/);
  });

  it('places rotate beside the zoom toolbar in the middle cluster', () => {
    const middle = template.match(
      /<div class="pdf-toolbar-middle"[\s\S]*?<\/div>/
    )?.[0] ?? '';
    expect(middle).toContain('<pdf-zoom-toolbar');
    expect(middle).toContain('<pdf-rotate-page');
  });

  it('exposes Annotate and More overflow menus that escape toolbar clip', () => {
    expect(template).toContain('toggleAnnotateMenu');
    expect(template).toContain('toggleMoreMenu');
    expect(template).toContain('readerPdf.toolbar.annotate');
    expect(template).toContain('readerPdf.toolbar.more');
    expect(template).toContain('onAnnotateHighlight');
    expect(template).toContain('onMorePan');
    expect(template).toContain('onMoreSelectText');
    expect(template).toContain('onMorePrint');
    expect(template).toContain('toolbarMenuTop');
    expect(template).not.toContain('pdf-menu-backdrop');
    expect(template).toContain('pdf-menu-item');
    // More rows include leading icons (svg before label span).
    expect(template).toMatch(/onMorePan\(\)"[\s\S]*?<svg[\s\S]*?<span>\{\{ 'readerPdf\.toolbar\.panDocument'/);
    expect(scss).toMatch(/#toolbarContainer[\s\S]*overflow:\s*visible\s*!important/);
    expect(scss).toMatch(/\.pdf-menu-dropdown[\s\S]*position:\s*fixed/);
    // More sits with Annotate (before layout-mode overflow), not after secondary toolbar.
    const annotateIdx = template.indexOf('toggleAnnotateMenu');
    const moreIdx = template.indexOf('toggleMoreMenu');
    const secondaryIdx = template.indexOf('pdf-toggle-secondary-toolbar');
    expect(annotateIdx).toBeGreaterThan(-1);
    expect(moreIdx).toBeGreaterThan(annotateIdx);
    expect(secondaryIdx).toBeGreaterThan(moreIdx);
    expect(template).toContain('pdf-toolbar-menu--more');
    expect(template).toContain('pdf-close-separator');
    expect(scss).toContain('.pdf-toolbar-menu--more');
    expect(scss).toContain('.pdf-close-separator');
  });

  it('switches menus via document outside-click without a blocking backdrop', () => {
    const source = readFileSync(
      resolve(__dirname, 'pdf-reader.component.ts'),
      'utf-8'
    );
    expect(source).toContain('ensureToolbarMenuOutsideListener');
    expect(source).toContain('teardownToolbarMenuOutsideListener');
    expect(source).toContain("target.closest('.pdf-menu-trigger')");
    expect(source).not.toContain('onToolbarMenuBackdropDismiss');
  });

  it('removes free-floating hand/select/print/editors/links/theme from the primary row', () => {
    // These live under More / Annotate menus (eventBus), not as primary icons.
    expect(template).not.toContain('<pdf-hand-tool');
    expect(template).not.toContain('<pdf-select-tool');
    expect(template).not.toContain('<pdf-print');
    expect(template).not.toContain('<pdf-highlight-editor');
    expect(template).not.toContain('<pdf-text-editor');
    expect(template).not.toContain('<pdf-draw-editor');
    // Theme / external-links are menu actions, not standalone primary buttons.
    expect(template).not.toMatch(/\(click\)="isDarkTheme = !isDarkTheme"/);
    expect(template).not.toMatch(/\(click\)="toggleExternalLinks\(\)"/);
  });
});

describe('pdf-reader phone toolbar (no mash)', () => {
  const scss = readFileSync(
    resolve(__dirname, 'pdf-reader.component.scss'),
    'utf-8'
  );

  /** Phone-only block: everything inside the first @media (max-width: 768px). */
  function phoneToolbarScss(): string {
    const match = scss.match(
      /@media\s*\(\s*max-width:\s*768px\s*\)\s*\{([\s\S]*)/
    );
    expect(match, 'expected a @media (max-width: 768px) phone toolbar block').not.toBeNull();
    return match![1];
  }

  it('scopes the de-mash layout to Phone Mode width only', () => {
    expect(scss).toMatch(/@media\s*\(\s*max-width:\s*768px\s*\)/);
    // Desktop/tablet grid + wide nav stay outside the phone media query.
    const desktopSlice = scss.slice(0, scss.search(/@media\s*\(\s*max-width:\s*768px\s*\)/));
    expect(desktopSlice).toMatch(/grid-template-columns:\s*1fr\s+auto\s+1fr/);
    expect(desktopSlice).toMatch(/width:\s*56px\s*!important/);
  });

  it('replaces the overlapping 3-column grid with a flex row on phone', () => {
    const phone = phoneToolbarScss();
    expect(phone).toMatch(/#toolbarViewer[\s\S]*display:\s*flex\s*!important/);
    expect(phone).toMatch(/#toolbarViewer[\s\S]*grid-template-columns:\s*none\s*!important/);
    expect(phone).toMatch(/#toolbarViewer[\s\S]*justify-content:\s*space-between\s*!important/);
  });

  it('restores compact Contents/Thumbs hit targets on phone so clusters do not collide', () => {
    const phone = phoneToolbarScss();
    expect(phone).toMatch(
      /toolbar-btn--wide[\s\S]*width:\s*28px\s*!important/
    );
    expect(phone).toMatch(
      /toolbar-btn--wide[\s\S]*flex:\s*0\s+0\s+28px\s*!important/
    );
  });
});

describe('pdf-reader phone touch navigation', () => {
  const source = readFileSync(
    resolve(__dirname, 'pdf-reader.component.ts'),
    'utf-8'
  );
  const handler = readFileSync(
    resolve(__dirname, 'pdf-touch-navigation.handler.ts'),
    'utf-8'
  );

  function methodBody(name: string): string {
    const match = source.match(
      new RegExp(
        `(?:private\\s+|public\\s+)?${name}\\s*\\([^)]*\\)\\s*(?::\\s*[^{]+)?\\{([\\s\\S]*?)\\n  \\}`
      )
    );
    expect(match, `expected method ${name}()`).not.toBeNull();
    return match![1];
  }

  it('arms touch navigation on any touch device, including Phone Mode', () => {
    const body = methodBody('initTouchNavigation');
    // Historical phone gate from tablet-only rollout must stay removed.
    expect(body).not.toMatch(/isPhone/);
    expect(body).toMatch(/hasTouchInput/);
  });

  it('flashes left/right tap-zone hints on Phone Mode when entering page-based modes', () => {
    const body = methodBody('flashTouchZones');
    expect(body).not.toMatch(/isPhone/);
    expect(body).toMatch(/hasTouchInput/);
    expect(body).toMatch(/isPageBasedMode/);
  });

  it('documents that the handler covers Phone Mode page-based navigation', () => {
    expect(handler).toMatch(/Phone Mode/);
    expect(handler).not.toMatch(/non-phone touch devices/);
  });
});
