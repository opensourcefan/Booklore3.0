import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const SEARCHER_SCSS = join(
  process.cwd(),
  'src/app/features/metadata/component/book-metadata-center/metadata-searcher/metadata-searcher.component.scss'
);

describe('metadata searcher search-card overflow', () => {
  const scss = readFileSync(SEARCHER_SCSS, 'utf8');

  it('sizes the field grid from available width without container-query flash', () => {
    // auto-fit + minmax sizes from the grid container itself (dialog/card), not the viewport.
    expect(scss).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*11rem\),\s*1fr\)\)/);
    // Container queries caused first-paint jumble while the query container size settled.
    expect(scss).not.toMatch(/container-type:\s*inline-size/);
    expect(scss).not.toMatch(/@container metadata-search-card/);
    // Viewport-driven 5-column strip was what spilled inside Book Details.
    expect(scss).not.toMatch(/@media \(min-width: 1024px\)\s*\{\s*grid-template-columns:\s*2fr 1fr 1\.5fr 1\.5fr auto/);
    expect(scss).toMatch(/\.searcher-container[\s\S]*overflow-x:\s*clip/);
  });
});
