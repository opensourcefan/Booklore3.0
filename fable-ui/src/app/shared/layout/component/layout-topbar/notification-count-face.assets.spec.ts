import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';

const TOPBAR_HTML = join(
  process.cwd(),
  'src/app/shared/layout/component/layout-topbar/app.topbar.component.html'
);
const TOPBAR_SCSS = join(
  process.cwd(),
  'src/app/shared/layout/component/layout-topbar/app.topbar.component.scss'
);

describe('desktop/tablet notification count face (phone badge lock)', () => {
  const html = readFileSync(TOPBAR_HTML, 'utf8');
  const scss = readFileSync(TOPBAR_SCSS, 'utf8');

  it('desktop notifications case replaces the bell with a centered count face', () => {
    const desktopCase = html.split("@case ('notifications')")[1]?.split("@case ('layoutPhone')")[0] ?? '';
    expect(desktopCase).toContain('notification-count-face');
    expect(desktopCase).toContain('topbar-item--notification-count');
    expect(desktopCase).toContain('shouldShowNotificationBadge');
    // No absolute overhang badge in the desktop toolbar case.
    expect(desktopCase).not.toMatch(/class="notification-badge"/);
  });

  it('phone mobile center-bar keeps the corner overlay badge', () => {
    expect(html).toMatch(
      /Mobile Notifications Bell[\s\S]*class="notification-badge" style="top: -0\.3rem; right: -0\.3rem;"/
    );
  });

  it('styles center-count only under topbar-desktop-items', () => {
    expect(scss).toMatch(/\.topbar-desktop-items\s+\.notification-count-face\s*\{/);
    expect(scss).not.toMatch(/\.topbar-desktop-items\s+\.notification-badge\s*\{/);
  });
});
