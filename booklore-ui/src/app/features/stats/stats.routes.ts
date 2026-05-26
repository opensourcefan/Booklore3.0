import {Routes} from '@angular/router';
import {provideCharts, withDefaultRegisterables} from 'ng2-charts';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import {LibraryStatsGuard} from '../../core/security/guards/library-stats.guard';
import {UserStatsGuard} from '../../core/security/guards/user-stats.guard';

const chartProviders = [
  provideCharts(withDefaultRegisterables(), ChartDataLabels)
];

export const LIBRARY_STATS_ROUTES: Routes = [
  {
    path: '',
    providers: chartProviders,
    loadComponent: () => import('./component/library-stats/library-stats.component').then(m => m.LibraryStatsComponent),
    canActivate: [LibraryStatsGuard]
  }
];

export const USER_STATS_ROUTES: Routes = [
  {
    path: '',
    providers: chartProviders,
    loadComponent: () => import('./component/user-stats/user-stats.component').then(m => m.UserStatsComponent),
    canActivate: [UserStatsGuard]
  }
];
