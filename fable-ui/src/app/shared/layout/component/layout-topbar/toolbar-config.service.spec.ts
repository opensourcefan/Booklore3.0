import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {BehaviorSubject} from 'rxjs';
import {STORAGE_KEY, STORAGE_KEY_BY_MODE, ToolbarConfigService, ToolbarItem} from './toolbar-config.service';
import {UserService} from '../../../../features/settings/user-management/user.service';
import {DeviceBreakpoint, MobileUxService} from '../../../../core/services/mobile-ux.service';

describe('ToolbarConfigService per-layout storage', () => {
  let service: ToolbarConfigService;
  let updateUserSetting: ReturnType<typeof vi.fn>;
  let breakpoint$: BehaviorSubject<DeviceBreakpoint>;

  function setBreakpoint(bp: DeviceBreakpoint): void {
    breakpoint$.next(bp);
  }

  beforeEach(() => {
    localStorage.clear();
    updateUserSetting = vi.fn();
    breakpoint$ = new BehaviorSubject<DeviceBreakpoint>('desktop');

    TestBed.configureTestingModule({
      providers: [
        ToolbarConfigService,
        {
          provide: UserService,
          useValue: {
            getCurrentUser: () => ({
              id: 1,
              permissions: {admin: true},
              userSettings: {}
            }),
            updateUserSetting
          }
        },
        {
          provide: MobileUxService,
          useValue: {
            breakpoint$,
            get isPhone() {
              return breakpoint$.value === 'mobile';
            },
            get isTablet() {
              return breakpoint$.value === 'mobile-tablet';
            },
            get isDesktop() {
              return breakpoint$.value === 'desktop';
            }
          }
        }
      ]
    });
    service = TestBed.inject(ToolbarConfigService);
  });

  it('keeps independent toolbar layouts for tablet and desktop on the same browser', () => {
    setBreakpoint('mobile-tablet');
    const tabletItems: ToolbarItem[] = service.getDefaultItems().map(item =>
      item.id === 'stats' ? {...item, visible: false} : item
    );
    service.setItems(tabletItems);
    service.save();

    setBreakpoint('desktop');
    expect(service.items.find(item => item.id === 'stats')?.visible).toBe(true);

    const desktopItems: ToolbarItem[] = service.getDefaultItems().map(item =>
      item.id === 'theme' ? {...item, visible: false} : item
    );
    service.setItems(desktopItems);
    service.save();

    setBreakpoint('mobile-tablet');
    expect(service.items.find(item => item.id === 'stats')?.visible).toBe(false);
    expect(service.items.find(item => item.id === 'theme')?.visible).toBe(true);

    setBreakpoint('desktop');
    expect(service.items.find(item => item.id === 'stats')?.visible).toBe(true);
    expect(service.items.find(item => item.id === 'theme')?.visible).toBe(false);
    expect(updateUserSetting).not.toHaveBeenCalled();
  });

  it('uses tablet/desktop storage keys when the effective breakpoint changes under auto-shape', () => {
    // Simulate auto-shape portrait → tablet layout, then landscape → desktop.
    setBreakpoint('mobile-tablet');
    const tabletItems: ToolbarItem[] = service.getDefaultItems().map(item =>
      item.id === 'metadata' ? {...item, visible: false} : item
    );
    service.setItems(tabletItems);
    service.save();

    setBreakpoint('desktop');
    expect(service.resolveLayoutKey()).toBe('desktop');
    expect(service.items.find(item => item.id === 'metadata')?.visible).toBe(true);

    const desktopItems: ToolbarItem[] = service.getDefaultItems().map(item =>
      item.id === 'upload' ? {...item, visible: false} : item
    );
    service.setItems(desktopItems);
    service.save();

    const byMode = JSON.parse(localStorage.getItem(STORAGE_KEY_BY_MODE) || '{}');
    expect(byMode['auto-shape']).toBeUndefined();
    expect(byMode.auto).toBeUndefined();
    expect(byMode.tablet.find((item: ToolbarItem) => item.id === 'metadata')?.visible).toBe(false);
    expect(byMode.desktop.find((item: ToolbarItem) => item.id === 'upload')?.visible).toBe(false);

    setBreakpoint('mobile-tablet');
    expect(service.resolveLayoutKey()).toBe('tablet');
    expect(service.items.find(item => item.id === 'metadata')?.visible).toBe(false);
    expect(service.items.find(item => item.id === 'upload')?.visible).toBe(true);
  });

  it('migrates legacy single-key config into only the current effective layout', () => {
    const legacy = service.getDefaultItems().map(item =>
      item.id === 'upload' ? {...item, visible: false} : item
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));

    setBreakpoint('mobile-tablet');
    service.load();

    expect(service.items.find(item => item.id === 'upload')?.visible).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    const byMode = JSON.parse(localStorage.getItem(STORAGE_KEY_BY_MODE) || '{}');
    expect(byMode.tablet.find((item: ToolbarItem) => item.id === 'upload')?.visible).toBe(false);
    expect(byMode.desktop).toBeUndefined();

    setBreakpoint('desktop');
    expect(service.items.find(item => item.id === 'upload')?.visible).toBe(true);
  });
});
