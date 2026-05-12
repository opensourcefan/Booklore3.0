import {DOCUMENT} from '@angular/common';
import {PLATFORM_ID} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {EMPTY} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@primeuix/themes', () => {
  const chain = {
    preset: vi.fn(() => chain),
    surfacePalette: vi.fn(() => chain),
    use: vi.fn(() => chain),
  };

  return {
    $t: () => chain,
  };
});

import {UserService} from '../../features/settings/user-management/user.service';
import {AppConfigService} from './app-config.service';

describe('AppConfigService', () => {
  let service: AppConfigService;
  let userServiceMock: {
    userState$: typeof EMPTY;
    getCurrentUser: ReturnType<typeof vi.fn>;
    updateUserSetting: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    userServiceMock = {
      userState$: EMPTY,
      getCurrentUser: vi.fn(() => ({
        id: 7,
        userSettings: {},
      })),
      updateUserSetting: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        AppConfigService,
        {
          provide: DOCUMENT,
          useValue: document,
        },
        {
          provide: PLATFORM_ID,
          useValue: 'server',
        },
        {
          provide: UserService,
          useValue: userServiceMock,
        },
      ],
    });

    service = TestBed.inject(AppConfigService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists recent custom colors alongside theme settings', () => {
    TestBed.flushEffects();
    userServiceMock.updateUserSetting.mockClear();

    service.setThemeSelection('primary', '#112233');
    TestBed.flushEffects();

    expect(userServiceMock.updateUserSetting).toHaveBeenCalledTimes(1);
    expect(userServiceMock.updateUserSetting).toHaveBeenLastCalledWith(7, 'themeSettings', {
      preset: 'Aura',
      primary: '#112233',
      surface: 'ash',
      recentPrimaryColors: ['#112233'],
    });
  });
});