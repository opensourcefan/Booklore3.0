import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const TOPBAR_SCSS = join(process.cwd(), 'src/assets/layout/styles/layout/_topbar.scss');
const TOPBAR_HTML = join(
  process.cwd(),
  'src/app/shared/layout/component/layout-topbar/app.topbar.component.html'
);

describe('toolbar editor popover viewport fit', () => {
  it('caps the body-appended popover height and wires cancel dismiss', () => {
    const scss = readFileSync(TOPBAR_SCSS, 'utf8');
    const html = readFileSync(TOPBAR_HTML, 'utf8');

    expect(scss).toMatch(/\.toolbar-editor-popover\.p-popover\s*\{[\s\S]*max-height:/);
    expect(scss).toMatch(/body\.header-bottom\s+\.toolbar-editor-popover\.p-popover/);
    expect(html).toMatch(/\(cancelled\)="toolbarEditorPop\.hide\(\)"/);
  });
});
