import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  GhostClickGuard,
  OVERLAY_GHOST_CLICK_MS,
  isEventOnCurrentTarget,
  shouldDismissOverlay
} from './overlay-dismiss.util';

describe('overlay-dismiss.util', () => {
  beforeEach(() => {
    vi.spyOn(performance, 'now').mockReturnValue(1_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GhostClickGuard ignores dismisses until the arm window elapses', () => {
    const guard = new GhostClickGuard();
    guard.arm();

    expect(guard.shouldIgnore()).toBe(true);

    vi.mocked(performance.now).mockReturnValue(1_000 + OVERLAY_GHOST_CLICK_MS - 1);
    expect(guard.shouldIgnore()).toBe(true);

    vi.mocked(performance.now).mockReturnValue(1_000 + OVERLAY_GHOST_CLICK_MS);
    expect(guard.shouldIgnore()).toBe(false);
  });

  it('isEventOnCurrentTarget requires target === currentTarget', () => {
    const overlay = document.createElement('div');
    const child = document.createElement('span');
    overlay.appendChild(child);

    const onOverlay = {target: overlay, currentTarget: overlay} as unknown as Event;
    const onChild = {target: child, currentTarget: overlay} as unknown as Event;

    expect(isEventOnCurrentTarget(onOverlay)).toBe(true);
    expect(isEventOnCurrentTarget(onChild)).toBe(false);
  });

  it('shouldDismissOverlay blocks ghost clicks and child-target events', () => {
    const guard = new GhostClickGuard();
    guard.arm();

    const overlay = document.createElement('div');
    const child = document.createElement('span');
    overlay.appendChild(child);

    const backdropEvent = {target: overlay, currentTarget: overlay} as unknown as Event;
    const childEvent = {target: child, currentTarget: overlay} as unknown as Event;

    expect(shouldDismissOverlay(backdropEvent, guard)).toBe(false);

    vi.mocked(performance.now).mockReturnValue(1_000 + OVERLAY_GHOST_CLICK_MS);
    expect(shouldDismissOverlay(backdropEvent, guard)).toBe(true);
    expect(shouldDismissOverlay(childEvent, guard)).toBe(false);
  });
});
