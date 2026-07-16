import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {STORAGE_KEY, ToolbarConfigService, ToolbarItem} from './toolbar-config.service';
import {UserService} from '../../../../features/settings/user-management/user.service';

describe('ToolbarConfigService per-browser storage', () => {
  let service: ToolbarConfigService;
  let updateUserSetting: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    updateUserSetting = vi.fn();

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
        }
      ]
    });
    service = TestBed.inject(ToolbarConfigService);
  });

  it('saves and loads toolbar layout from localStorage without writing user settings', () => {
    const customized: ToolbarItem[] = service.getDefaultItems().map(item =>
      item.id === 'stats' ? {...item, visible: false} : item
    );

    service.setItems(customized);
    service.save();

    expect(updateUserSetting).not.toHaveBeenCalled();
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as ToolbarItem[];
    expect(stored.find(item => item.id === 'stats')?.visible).toBe(false);

    service.load({
      id: 1,
      permissions: {admin: true},
      userSettings: {
        toolbarConfig: service.getDefaultItems()
      }
    } as never);

    expect(service.items.find(item => item.id === 'stats')?.visible).toBe(false);
  });

  it('seeds localStorage once from server config when browser has no saved layout', () => {
    const serverItems = service.getDefaultItems().map(item =>
      item.id === 'theme' ? {...item, visible: false} : item
    );

    service.load({
      id: 1,
      permissions: {admin: true},
      userSettings: {
        toolbarConfig: serverItems
      }
    } as never);

    expect(service.items.find(item => item.id === 'theme')?.visible).toBe(false);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as ToolbarItem[];
    expect(stored.find(item => item.id === 'theme')?.visible).toBe(false);
    expect(updateUserSetting).not.toHaveBeenCalled();
  });
});
