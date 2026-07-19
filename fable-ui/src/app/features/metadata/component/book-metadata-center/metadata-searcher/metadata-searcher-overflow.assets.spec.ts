import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const SEARCHER_SCSS = join(
  process.cwd(),
  'src/app/features/metadata/component/book-metadata-center/metadata-searcher/metadata-searcher.component.scss'
);

describe('metadata searcher search-card overflow', () => {
  const scss = readFileSync(SEARCHER_SCSS, 'utf8');

  it('sizes the field grid from the card container, not the viewport', () => {
    expect(scss).toMatch(/container-type:\s*inline-size/);
    expect(scss).toMatch(/container-name:\s*metadata-search-card/);
    expect(scss).toMatch(/@container metadata-search-card \(min-width: 920px\)/);
    // Viewport-driven 5-column strip was what spilled inside Book Details.
    expect(scss).not.toMatch(/@media \(min-width: 1024px\)\s*\{\s*grid-template-columns:\s*2fr 1fr 1\.5fr 1\.5fr auto/);
    expect(scss).toMatch(/\.searcher-container[\s\S]*overflow-x:\s*clip/);
  });
});
