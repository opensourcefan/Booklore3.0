import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const HOSTS: {label: string; html: string; scss: string; hasTablistInRail: boolean}[] = [
  {
    label: 'book-metadata-center',
    html: 'src/app/features/metadata/component/book-metadata-center/book-metadata-center.component.html',
    scss: 'src/app/features/metadata/component/book-metadata-center/book-metadata-center.component.scss',
    hasTablistInRail: true
  },
  {
    label: 'settings',
    html: 'src/app/features/settings/settings.component.html',
    scss: 'src/app/features/settings/settings.component.scss',
    hasTablistInRail: true
  },
  {
    label: 'series-page',
    html: 'src/app/features/book/components/series-page/series-page.component.html',
    scss: 'src/app/features/book/components/series-page/series-page.component.scss',
    hasTablistInRail: true
  },
  {
    label: 'author-detail',
    html: 'src/app/features/author-browser/components/author-detail/author-detail.component.html',
    scss: 'src/app/features/author-browser/components/author-detail/author-detail.component.scss',
    hasTablistInRail: true
  },
  {
    label: 'metadata-manager',
    html: 'src/app/features/metadata/component/metadata-manager/metadata-manager.component.html',
    scss: 'src/app/features/metadata/component/metadata-manager/metadata-manager.component.scss',
    hasTablistInRail: false
  }
];

const FULL_HEIGHT_COLUMN = /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/;
const GRID_SPAN_LEFTOVER = /grid-column:\s*1\s*\/\s*-1/;
const GRID_ROW_SPAN_BODY = /grid-row:\s*1\s*\/\s*-1/;

describe('tab-rail fixed close beside narrowed tablist (all hosts)', () => {
  it('keeps X outside the tablist box without a full-height grid column', () => {
    const mixin = readFileSync(join(process.cwd(), 'src/app/shared/styles/_tab-rail.scss'), 'utf8');
    expect(mixin).toMatch(/@mixin tab-rail-host/);
    expect(mixin).toMatch(/@mixin tab-rail-close/);
    expect(mixin).toMatch(/@mixin tab-rail-header-reserve/);
    expect(mixin).toMatch(/position:\s*absolute/);
    expect(mixin).toMatch(/height:\s*\$tab-rail-close-size/);
    // Narrow the tablist so PrimeNG next-chevron stays left of X (padding cannot move abspos nav).
    expect(mixin).toMatch(/width:\s*calc\(100% - #\{\$tab-rail-close-size\}\)/);
    expect(mixin).not.toMatch(FULL_HEIGHT_COLUMN);
    // Absolute overlay + padding-only was the chevron collision pattern.
    expect(mixin).not.toMatch(/padding-right:\s*\$tab-rail-close-size\s*!important/);
  });

  for (const host of HOSTS) {
    it(`${host.label}: uses shared tab-rail close with X and no full-height column leftovers`, () => {
      const html = readFileSync(join(process.cwd(), host.html), 'utf8');
      const scss = readFileSync(join(process.cwd(), host.scss), 'utf8');

      expect(html).toMatch(/tab-rail-close/);
      expect(html).toMatch(/icon="pi pi-times"/);
      expect(html).not.toMatch(/icon="pi pi-arrow-left"/);
      expect(scss).toMatch(/@include tab-rail\.tab-rail-host/);
      expect(scss).toMatch(/@include tab-rail\.tab-rail-close/);
      expect(scss).not.toMatch(FULL_HEIGHT_COLUMN);
      expect(scss).not.toMatch(GRID_ROW_SPAN_BODY);
      expect(scss).not.toMatch(GRID_SPAN_LEFTOVER);

      if (host.hasTablistInRail) {
        expect(scss).toMatch(/@include tab-rail\.tab-rail-body/);
      }
    });
  }

  it('metadata-manager reserves header space (tabs are outside the chrome)', () => {
    const scss = readFileSync(join(process.cwd(), HOSTS[4].scss), 'utf8');
    expect(scss).toMatch(/@include tab-rail\.tab-rail-header-reserve/);
  });

  it('preserves existing return handlers (no routing logic changes in templates)', () => {
    const center = readFileSync(join(process.cwd(), HOSTS[0].html), 'utf8');
    const settings = readFileSync(join(process.cwd(), HOSTS[1].html), 'utf8');
    const series = readFileSync(join(process.cwd(), HOSTS[2].html), 'utf8');
    const author = readFileSync(join(process.cwd(), HOSTS[3].html), 'utf8');
    const manager = readFileSync(join(process.cwd(), HOSTS[4].html), 'utf8');

    expect(center).toMatch(/closeMetadataCenter\(\)/);
    expect(settings).toMatch(/onReturn\(\)/);
    expect(series).toMatch(/closePage\(\)/);
    expect(author).toMatch(/closePage\(\)/);
    expect(manager).toMatch(/closeAndReturn\(\)/);
  });
});
