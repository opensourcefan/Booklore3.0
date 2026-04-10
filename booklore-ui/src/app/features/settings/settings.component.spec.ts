import {Location} from '@angular/common';
import {TestBed} from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {PageTitleService} from '../../shared/service/page-title.service';
import {UserService} from './user-management/user.service';
import {SettingsComponent} from './settings.component';

describe('SettingsComponent', () => {
  const routerNavigate = vi.fn(() => Promise.resolve(true));
  const locationBack = vi.fn();

  beforeEach(() => {
    routerNavigate.mockClear();
    locationBack.mockClear();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: UserService,
          useValue: {
            userState$: of({
              loaded: true,
              user: {
                permissions: {
                  admin: true,
                  canManageMetadataConfig: true,
                  canManageGlobalPreferences: true,
                  canAccessTaskManager: true,
                },
              },
            }),
          },
        },
        { provide: ActivatedRoute, useValue: { queryParams: of({ tab: 'reader' }) } },
        { provide: Router, useValue: { navigate: routerNavigate } },
        { provide: PageTitleService, useValue: { setPageTitle: vi.fn() } },
        { provide: Location, useValue: { back: locationBack } },
      ],
    });
  });

  function createComponent(): SettingsComponent {
    return TestBed.runInInjectionContext(() => new SettingsComponent());
  }

  it('returns to browser history when a previous page exists', () => {
    const historyLengthSpy = vi.spyOn(window.history, 'length', 'get').mockReturnValue(3);
    const component = createComponent();

    component.onReturn();

    expect(locationBack).toHaveBeenCalledOnce();
    expect(routerNavigate).not.toHaveBeenCalled();
    historyLengthSpy.mockRestore();
  });

  it('falls back to the dashboard when there is no meaningful browser history', () => {
    const historyLengthSpy = vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    const component = createComponent();

    component.onReturn();

    expect(locationBack).not.toHaveBeenCalled();
    expect(routerNavigate).toHaveBeenCalledWith(['/dashboard']);
    historyLengthSpy.mockRestore();
  });
});
