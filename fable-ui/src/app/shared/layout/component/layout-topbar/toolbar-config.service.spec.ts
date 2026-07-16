import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {BehaviorSubject} from 'rxjs';
import {STORAGE_KEY, STORAGE_KEY_BY_MODE, ToolbarConfigService, ToolbarItem} from './toolbar-config.service';
import {UserService} from '../../../../features/settings/user-management/user.service';
import {LayoutMode, UiPreferencesService} from '../../../service/ui-preferences.service';

describe('ToolbarConfigService per-mode storage', () => {
  let service: ToolbarConfigService;
  let updateUserSetting: ReturnType<typeof vi.fn>;
  let layoutMode$: BehaviorSubject<LayoutMode>;

  beforeEach(() => {
    localStorage.clear();
    updateUserSetting = vi.fn();
    layoutMode$ = new BehaviorSubject<LayoutMode>('desktop');

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
          provide: UiPreferencesService,
          useValue: {
            get layoutMode() {
              return layoutMode$.value;
            },
            layoutMode$
          }
        }
      ]
    });
    service = TestBed.inject(ToolbarConfigService);
  });

  it('keeps independent toolbar layouts for tablet and desktop on the same browser', () => {
    layoutMode$.next('tablet');
    const tabletItems: ToolbarItem[] = service.getDefaultItems().map(item =>
      item.id === 'stats' ? {...item, visible: false} : item
    );
    service.setItems(tabletItems);
    service.save();

    layoutMode$.next('desktop');
    expect(service.items.find(item => item.id === 'stats')?.visible).toBe(true);

    const desktopItems: ToolbarItem[] = service.getDefaultItems().map(item =>
      item.id === 'theme' ? {...item, visible: false} : item
    );
    service.setItems(desktopItems);
    service.save();

    layoutMode$.next('tablet');
    expect(service.items.find(item => item.id === 'stats')?.visible).toBe(false);
    expect(service.items.find(item => item.id === 'theme')?.visible).toBe(true);

    layoutMode$.next('desktop');
    expect(service.items.find(item => item.id === 'stats')?.visible).toBe(true);
    expect(service.items.find(item => item.id === 'theme')?.visible).toBe(false);
    expect(updateUserSetting).not.toHaveBeenCalled();
  });

  it('migrates legacy single-key config into only the current layout mode', () => {
    const legacy = service.getDefaultItems().map(item =>
      item.id === 'upload' ? {...item, visible: false} : item
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));

    layoutMode$.next('tablet');
    service.load();

    expect(service.items.find(item => item.id === 'upload')?.visible).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    const byMode = JSON.parse(localStorage.getItem(STORAGE_KEY_BY_MODE) || '{}');
    expect(byMode.tablet.find((item: ToolbarItem) => item.id === 'upload')?.visible).toBe(false);
    expect(byMode.desktop).toBeUndefined();

    layoutMode$.next('desktop');
    expect(service.items.find(item => item.id === 'upload')?.visible).toBe(true);
  });
});
