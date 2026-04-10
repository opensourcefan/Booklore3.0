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
  const routerNavigateByUrl = vi.fn(() => Promise.resolve(true));

  beforeEach(() => {
    routerNavigate.mockClear();
    routerNavigateByUrl.mockClear();

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
        { provide: ActivatedRoute, useValue: { queryParams: of({ tab: 'reader', returnTo: '/all-books' }) } },
        { provide: Router, useValue: { navigate: routerNavigate, navigateByUrl: routerNavigateByUrl, url: '/settings?tab=reader&returnTo=%2Fall-books' } },
        { provide: PageTitleService, useValue: { setPageTitle: vi.fn() } },
        { provide: Location, useValue: { back: vi.fn() } },
      ],
    });
  });

  function createComponent(): SettingsComponent {
    return TestBed.runInInjectionContext(() => new SettingsComponent());
  }

  it('returns to the explicit returnTo route when one is provided', () => {
    const component = createComponent();
    component.ngOnInit();

    component.onReturn();

    expect(routerNavigateByUrl).toHaveBeenCalledWith('/all-books');
    expect(routerNavigate).not.toHaveBeenCalled();
  });

  it('falls back to the dashboard when no explicit return route exists', () => {
    TestBed.resetTestingModule();
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
        { provide: Router, useValue: { navigate: routerNavigate, navigateByUrl: routerNavigateByUrl, url: '/settings?tab=reader' } },
        { provide: PageTitleService, useValue: { setPageTitle: vi.fn() } },
        { provide: Location, useValue: { back: vi.fn() } },
      ],
    });
    const component = createComponent();
    component.ngOnInit();

    component.onReturn();

    expect(routerNavigateByUrl).not.toHaveBeenCalled();
    expect(routerNavigate).toHaveBeenCalledWith(['/dashboard']);
  });
});
