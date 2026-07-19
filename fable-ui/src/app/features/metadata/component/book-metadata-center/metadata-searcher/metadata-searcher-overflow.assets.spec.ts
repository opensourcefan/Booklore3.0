import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const SEARCHER_SCSS = join(
  process.cwd(),
  'src/app/features/metadata/component/book-metadata-center/metadata-searcher/metadata-searcher.component.scss'
);

describe('metadata searcher search-card layout', () => {
  const scss = readFileSync(SEARCHER_SCSS, 'utf8');

  it('is first-paint stable and does not use a viewport-driven 5-column strip', () => {
    // Two shrinkable columns above the historical 640 breakpoint — known on first paint.
    expect(scss).toMatch(/@media \(min-width: 640px\)\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    // Element-measured layouts flash a single-column stack until parent width settles.
    expect(scss).not.toMatch(/container-type:\s*inline-size/);
    expect(scss).not.toMatch(/@container metadata-search/);
    expect(scss).not.toMatch(/repeat\(auto-fit/);
    // Dense viewport ≥1024 strip was what spilled inside narrower Book Details hosts.
    expect(scss).not.toMatch(/@media \(min-width: 1024px\)[\s\S]{0,120}grid-template-columns:\s*minmax\(0,\s*2fr\)/);
    expect(scss).not.toMatch(/@media \(min-width: 1024px\)\s*\{\s*grid-template-columns:\s*2fr 1fr 1\.5fr 1\.5fr auto/);
    // search-card must not animate layout via transition: all.
    expect(scss).toMatch(
      /\.search-card\s*\{[\s\S]*?transition:\s*box-shadow[\s\S]*?&\s*:\s*hover/
    );
    expect(scss).toMatch(/\.searcher-container[\s\S]*overflow-x:\s*clip/);
  });
});
