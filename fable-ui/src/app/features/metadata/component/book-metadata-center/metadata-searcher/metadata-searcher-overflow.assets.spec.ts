import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const SEARCHER_SCSS = join(
  process.cwd(),
  'src/app/features/metadata/component/book-metadata-center/metadata-searcher/metadata-searcher.component.scss'
);

describe('metadata searcher search-card layout', () => {
  const scss = readFileSync(SEARCHER_SCSS, 'utf8');

  it('caps the field grid at two shrinkable columns and never spills horizontally', () => {
    // Two shrinkable columns above the historical 640 band — stable on first paint.
    expect(scss).toMatch(/@media \(min-width: 640px\)\s*\{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    // The dense viewport ≥1024 strip was the overflow source inside narrow hosts.
    expect(scss).not.toMatch(/grid-template-columns:\s*2fr\s+1fr\s+1\.5fr\s+1\.5fr\s+auto/);
    expect(scss).not.toMatch(/minmax\(0,\s*2fr\)\s+minmax\(0,\s*1fr\)\s+minmax\(0,\s*1\.5fr\)/);
    // Element-measured layouts (CQ / auto-fit) flash a single-column stack until settle.
    expect(scss).not.toMatch(/container-type:\s*inline-size/);
    expect(scss).not.toMatch(/@container/);
    expect(scss).not.toMatch(/repeat\(auto-fit/);
  });

  it('keeps a min-width:0 shrink chain so long values cannot force a scroll', () => {
    expect(scss).toMatch(/\.searcher-container[\s\S]*?min-width:\s*0/);
    expect(scss).toMatch(/\.searcher-container[\s\S]*?max-width:\s*min\(1600px,\s*100%\)/);
    expect(scss).toMatch(/\.search-field[\s\S]*?min-width:\s*0/);
    expect(scss).toMatch(/::ng-deep \.p-inputtext[\s\S]*?min-width:\s*0/);
  });

  it('animates only the search-card shadow (no transition: all layout thrash)', () => {
    expect(scss).toMatch(/\.search-card\s*\{[\s\S]*?transition:\s*box-shadow[\s\S]*?&\s*:\s*hover/);
  });
});
