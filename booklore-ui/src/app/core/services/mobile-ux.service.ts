import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type DeviceBreakpoint = 'mobile' | 'mobile-tablet' | 'desktop';

@Injectable({
  providedIn: 'root'
})
export class MobileUxService {
  private currentBreakpoint = new BehaviorSubject<DeviceBreakpoint>('desktop');
  
  public breakpoint$ = this.currentBreakpoint.asObservable();

  constructor() {
    this.initListeners();
  }

  private initListeners() {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const tabletQuery = window.matchMedia('(min-width: 768px) and (max-width: 1024px)');

    const updateBreakpoint = () => {
      if (mobileQuery.matches) {
        this.currentBreakpoint.next('mobile');
      } else if (tabletQuery.matches) {
        this.currentBreakpoint.next('mobile-tablet');
      } else {
        this.currentBreakpoint.next('desktop');
      }
    };

    mobileQuery.addEventListener('change', updateBreakpoint);
    tabletQuery.addEventListener('change', updateBreakpoint);
    updateBreakpoint();
  }

  public registerBackNavigation(callback: () => void): void {
     // TODO: Handle native app hardware back buttons or browser popstate securely
     window.addEventListener('popstate', callback);
  }
}
