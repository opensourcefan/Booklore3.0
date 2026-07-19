import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const SEARCHER_SCSS = join(
  process.cwd(),
  'src/app/features/metadata/component/book-metadata-center/metadata-searcher/metadata-searcher.component.scss'
);

describe('metadata searcher search-card layout contracts', () => {
  const scss = readFileSync(SEARCHER_SCSS, 'utf8');

  it('pins the form to column 2 so it never auto-places into the cover track', () => {
    expect(scss).toMatch(/\.search-card-layout[\s\S]*>\s*\.search-form-content\s*\{[\s\S]*grid-column:\s*2/);
    expect(scss).toMatch(/grid-template-columns:\s*minmax\(140px,\s*150px\)\s+minmax\(0,\s*1fr\)/);
  });

  it('gives Title a wider track than Providers on desktop (no provider span-2)', () => {
    expect(scss).toMatch(
      /@media \(min-width: 1024px\)\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1\.25fr\)\s+minmax\(0,\s*2fr\)\s+minmax\(0,\s*1\.5fr\)\s+auto/
    );
    expect(scss).not.toMatch(/\.search-field-provider[\s\S]*@media \(min-width: 1024px\)[\s\S]*grid-column:\s*1\s*\/\s*span\s*2/);
    expect(scss).toMatch(/\.search-field-provider[\s\S]*@media \(min-width: 1024px\)[\s\S]*grid-column:\s*1\s*;/);
    expect(scss).toMatch(/\.search-field-title[\s\S]*@media \(min-width: 1024px\)[\s\S]*grid-column:\s*2\s*;/);
  });
});
