import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const MENUITEM_SCSS = join(
  process.cwd(),
  'src/app/shared/layout/component/layout-menu/app.menuitem.component.scss'
);

describe('sidebar menu item label descenders', () => {
  const scss = readFileSync(MENUITEM_SCSS, 'utf8');

  it('keeps the 17px row strut without a clipping content-box height', () => {
    const inner = scss.match(/\.menu-item-text-inner\s*\{[^}]*\}/)?.[0] ?? '';
    const outer = scss.match(/\.menu-item-text\s*\{[^}]*\}/)?.[0] ?? '';
    expect(inner).toBeTruthy();
    expect(outer).toBeTruthy();

    // Do not use height: 17px (that clipped descenders inside overflow:hidden).
    expect(inner).not.toMatch(/(?<!line-)height:\s*17px/);
    // Restore compact row metrics via line-height + padding/margin trick.
    expect(inner).toMatch(/line-height:\s*17px/);
    expect(inner).toMatch(/padding-bottom:\s*3px/);
    expect(inner).toMatch(/margin-bottom:\s*-3px/);
    expect(outer).toMatch(/line-height:\s*17px/);
    expect(inner).toMatch(/overflow:\s*hidden/);
    expect(inner).toMatch(/text-overflow:\s*ellipsis/);
    expect(inner).toMatch(/white-space:\s*nowrap/);
  });
});
