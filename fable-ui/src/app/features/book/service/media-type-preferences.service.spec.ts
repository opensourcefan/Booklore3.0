import {TestBed} from '@angular/core/testing';
import {BehaviorSubject} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MediaTypePreferencesService} from './media-type-preferences.service';
import {LocalStorageService} from '../../../shared/service/local-storage.service';
import {UserService} from '../../settings/user-management/user.service';

describe('MediaTypePreferencesService', () => {
  let service: MediaTypePreferencesService;
  let localStorageMock: {
    get: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    trySet: ReturnType<typeof vi.fn>;
  };
  let userState$: BehaviorSubject<{loaded: boolean; user: null | {
    id: number;
    userSettings: {mediaTypeSettings?: {customTypes?: string[]; recentTypes?: string[]; sidebarOrder?: string[]}};
  }}>;
  let userServiceMock: {
    getCurrentUser: ReturnType<typeof vi.fn>;
    updateUserSetting: ReturnType<typeof vi.fn>;
    userState$: typeof userState$;
  };

  beforeEach(() => {
    localStorageMock = {
      get: vi.fn().mockReturnValue(undefined),
      remove: vi.fn(),
      trySet: vi.fn().mockReturnValue(true),
    };
    userState$ = new BehaviorSubject<{loaded: boolean; user: null}>({loaded: false, user: null});
    userServiceMock = {
      userState$,
      getCurrentUser: vi.fn().mockReturnValue({id: 7}),
      updateUserSetting: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        MediaTypePreferencesService,
        {provide: LocalStorageService, useValue: localStorageMock},
        {provide: UserService, useValue: userServiceMock},
      ],
    });

    service = TestBed.inject(MediaTypePreferencesService);
  });

  it('filters reserved PHYSICAL values from custom and recent media type settings', () => {
    service.setCustomTypes(['PHYSICAL', 'Comics', 'comics']);
    service.rememberRecentType('PHYSICAL');
    service.rememberRecentType('Magazine');

    expect(service.getCustomTypes()).toEqual(['Comics']);
    expect(service.getRecentTypes()).toEqual(['Magazine']);
  });

  it('persists sidebar order to device-local storage instead of user settings', () => {
    const saved = service.setSidebarOrder(['PDF', 'CBZ', 'PHYSICAL']);

    expect(saved).toBe(true);
    expect(localStorageMock.trySet).toHaveBeenCalledWith('sidebarBookTypeOrder', ['PDF', 'CBZ']);
    expect(service.getSidebarOrder()).toEqual(['PDF', 'CBZ']);
    expect(userServiceMock.updateUserSetting).not.toHaveBeenCalledWith(
      expect.anything(),
      'mediaTypeSettings',
      expect.objectContaining({sidebarOrder: ['PDF', 'CBZ']})
    );
  });
});
