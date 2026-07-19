import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const MENUITEM_SCSS = join(
  process.cwd(),
  'src/app/shared/layout/component/layout-menu/app.menuitem.component.scss'
);

describe('sidebar menu item label descenders', () => {
  const scss = readFileSync(MENUITEM_SCSS, 'utf8');

  it('does not pin .menu-item-text-inner to a sub-line-box pixel height', () => {
    const block = scss.match(/\.menu-item-text-inner\s*\{[^}]*\}/)?.[0] ?? '';
    expect(block).toBeTruthy();
    expect(block).not.toMatch(/height:\s*17px/);
    expect(block).toMatch(/overflow:\s*hidden/);
    expect(block).toMatch(/text-overflow:\s*ellipsis/);
    expect(block).toMatch(/white-space:\s*nowrap/);
  });
});
