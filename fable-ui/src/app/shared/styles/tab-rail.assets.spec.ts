import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const HOSTS: {label: string; html: string; scss: string}[] = [
  {
    label: 'book-metadata-center',
    html: 'src/app/features/metadata/component/book-metadata-center/book-metadata-center.component.html',
    scss: 'src/app/features/metadata/component/book-metadata-center/book-metadata-center.component.scss'
  },
  {
    label: 'settings',
    html: 'src/app/features/settings/settings.component.html',
    scss: 'src/app/features/settings/settings.component.scss'
  },
  {
    label: 'series-page',
    html: 'src/app/features/book/components/series-page/series-page.component.html',
    scss: 'src/app/features/book/components/series-page/series-page.component.scss'
  },
  {
    label: 'author-detail',
    html: 'src/app/features/author-browser/components/author-detail/author-detail.component.html',
    scss: 'src/app/features/author-browser/components/author-detail/author-detail.component.scss'
  },
  {
    label: 'metadata-manager',
    html: 'src/app/features/metadata/component/metadata-manager/metadata-manager.component.html',
    scss: 'src/app/features/metadata/component/metadata-manager/metadata-manager.component.scss'
  }
];

describe('tab-rail fixed close column (option B)', () => {
  it('keeps a shared tab-rail mixin available', () => {
    const mixin = readFileSync(join(process.cwd(), 'src/app/shared/styles/_tab-rail.scss'), 'utf8');
    expect(mixin).toMatch(/@mixin tab-rail-host/);
    expect(mixin).toMatch(/@mixin tab-rail-close/);
  });

  for (const host of HOSTS) {
    it(`${host.label}: uses tab-rail close column with X and no overlapping tablist padding hack`, () => {
      const html = readFileSync(join(process.cwd(), host.html), 'utf8');
      const scss = readFileSync(join(process.cwd(), host.scss), 'utf8');

      expect(html).toMatch(/tab-rail-close/);
      expect(html).toMatch(/icon="pi pi-times"/);
      expect(html).not.toMatch(/icon="pi pi-arrow-left"/);
      expect(scss).toMatch(/tab-rail/);
      expect(scss).not.toMatch(/padding-right:\s*3\.5rem/);
      expect(scss).not.toMatch(/position:\s*absolute[\s\S]{0,80}route-return-control|route-return-control[\s\S]{0,120}position:\s*absolute/);
    });
  }

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
