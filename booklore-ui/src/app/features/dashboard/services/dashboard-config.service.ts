import {Injectable, inject} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {cloneDashboardConfig, DashboardConfig, DEFAULT_DASHBOARD_CONFIG, normalizeDashboardConfig, ScrollerType} from '../models/dashboard-config.model';
import {UserService} from '../../settings/user-management/user.service';
import {filter, take} from 'rxjs/operators';
import {MagicShelfService} from '../../magic-shelf/service/magic-shelf.service';

@Injectable({
  providedIn: 'root'
})
export class DashboardConfigService {
  private configSubject = new BehaviorSubject<DashboardConfig>(cloneDashboardConfig(DEFAULT_DASHBOARD_CONFIG));

  public config$: Observable<DashboardConfig> = this.configSubject.asObservable();

  private userService = inject(UserService);
  private magicShelfService = inject(MagicShelfService);

  constructor() {
    this.userService.userState$
      .pipe(
        filter(userState => !!userState?.user && userState.loaded),
        take(1)
      )
      .subscribe(userState => {
        const dashboardConfig = userState.user?.userSettings?.dashboardConfig as DashboardConfig | undefined;
        if (dashboardConfig) {
          this.configSubject.next(normalizeDashboardConfig(dashboardConfig));
        }
      });

    this.magicShelfService.shelvesState$.subscribe(state => {
      const currentConfig = cloneDashboardConfig(this.configSubject.value);
      let updated = false;

      currentConfig.scrollers.forEach(scroller => {
        if (scroller.type === ScrollerType.MAGIC_SHELF && scroller.magicShelfId) {
          const shelf = state.shelves?.find(s => s.id === scroller.magicShelfId);
          if (shelf && scroller.title !== shelf.name) {
            scroller.title = shelf.name;
            updated = true;
          }
        }
      });

      if (updated) {
        this.configSubject.next(normalizeDashboardConfig(currentConfig));
        const user = this.userService.getCurrentUser();
        if (user) {
          this.userService.updateUserSetting(user.id, 'dashboardConfig', currentConfig);
        }
      }
    });
  }

  saveConfig(config: DashboardConfig): void {
    const normalizedConfig = normalizeDashboardConfig(config);
    this.configSubject.next(cloneDashboardConfig(normalizedConfig));

    const user = this.userService.getCurrentUser();
    if (user) {
      this.userService.updateUserSetting(user.id, 'dashboardConfig', normalizedConfig);
    }
  }

  resetToDefault(): void {
    this.saveConfig(cloneDashboardConfig(DEFAULT_DASHBOARD_CONFIG));
  }
}
