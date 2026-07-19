import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

// Hosts whose route-return close (X) sits over a scrollable PrimeNG tablist. On
// non-phone the tablist is narrowed so the next-chevron (>) sits left of the static X;
// Phone Mode must keep the baseline padding-right and the back-arrow glyph untouched.
const TABLIST_HOSTS: {label: string; html: string; scss: string}[] = [
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
  }
];

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('route-return close: static X beside tablist chevron (non-phone only)', () => {
  for (const host of TABLIST_HOSTS) {
    it(`${host.label}: narrows tablist and swaps glyph only outside Phone Mode`, () => {
      const scss = read(host.scss);
      const html = read(host.html);

      // Phone Mode baseline preserved: the plain padding reservation still exists...
      expect(scss).toMatch(/padding-right:\s*3\.5rem/);
      // ...and every desktop/tablet override is gated behind :not(.layout-phone).
      expect(scss).toMatch(/:host-context\(body:not\(\.layout-phone\)\)/);
      expect(scss).toMatch(/width:\s*calc\(100% - 3\.5rem\)/);
      expect(scss).toMatch(/content:\s*"\\e90b"/); // pi-times glyph swap

      // DOM icon is unchanged (phone still renders the back arrow); glyph swap is CSS-only.
      expect(html).toMatch(/icon="pi pi-arrow-left"/);
    });
  }

  it('metadata-manager swaps the close glyph on non-phone without touching phone', () => {
    const scss = read('src/app/features/metadata/component/metadata-manager/metadata-manager.component.scss');
    const html = read('src/app/features/metadata/component/metadata-manager/metadata-manager.component.html');
    expect(scss).toMatch(/:host-context\(body:not\(\.layout-phone\)\)[\s\S]*?content:\s*"\\e90b"/);
    expect(html).toMatch(/icon="pi pi-arrow-left"/);
  });
});
