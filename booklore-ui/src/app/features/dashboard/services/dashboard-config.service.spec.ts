import {BehaviorSubject} from 'rxjs';
import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {DashboardConfigService} from './dashboard-config.service';
import {UserService} from '../../settings/user-management/user.service';
import {MagicShelfService} from '../../magic-shelf/service/magic-shelf.service';
import {DashboardConfig, ScrollerType} from '../models/dashboard-config.model';

describe('DashboardConfigService', () => {
  it('normalizes dashboard configs from user settings while preserving persisted layout fields', () => {
    const userState$ = new BehaviorSubject({
      loaded: true,
      user: {
        id: 7,
        userSettings: {
          dashboardConfig: {
            layoutLocked: true,
            scrollers: [
              {
                id: 'legacy-1',
                type: ScrollerType.RANDOM,
                title: 'dashboard.scroller.discoverNew',
                enabled: true,
                order: 5,
                maxItems: 0,
                libraryId: 4,
                columnSpan: 3
              }
            ]
          }
        }
      }
    });

    TestBed.configureTestingModule({
      providers: [
        DashboardConfigService,
        {
          provide: UserService,
          useValue: {
            userState$,
            getCurrentUser: vi.fn().mockReturnValue({id: 7}),
            updateUserSetting: vi.fn()
          }
        },
        {
          provide: MagicShelfService,
          useValue: {
            shelvesState$: new BehaviorSubject({shelves: []})
          }
        }
      ]
    });

    const service = TestBed.inject(DashboardConfigService);
    let currentConfig: DashboardConfig | undefined;

    service.config$.subscribe(config => {
      currentConfig = config;
    });

    expect(currentConfig).toBeDefined();
    expect(currentConfig?.layoutLocked).toBe(true);
    expect(currentConfig?.scrollers).toHaveLength(1);
    expect(currentConfig?.scrollers[0].maxItems).toBe(1);
    expect(currentConfig?.scrollers[0].order).toBe(1);
    expect(currentConfig?.scrollers[0].libraryId).toBe(4);
    expect(currentConfig?.scrollers[0].columnSpan).toBe(3);
  });
});