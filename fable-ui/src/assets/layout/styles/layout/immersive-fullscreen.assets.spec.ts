import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

describe('immersive fullscreen layout styles', () => {
  const scss = readFileSync(
    resolve(__dirname, '_main.scss'),
    'utf8'
  );

  it('scopes immersive chrome hide to tablet/desktop, not Phone Mode', () => {
    expect(scss).toContain('body:is(.layout-tablet, .layout-desktop)');
    expect(scss).toContain('html:is(:fullscreen, :-webkit-full-screen, :-ms-fullscreen)');
    expect(scss).toContain('.immersive-fullscreen-exit');
    expect(scss).toMatch(/Phone Mode \(body\.layout-phone\) is intentionally excluded/);
    expect(scss).not.toMatch(/body\.layout-phone[^{]*\{[^}]*immersive-fullscreen-exit/);
  });
});
