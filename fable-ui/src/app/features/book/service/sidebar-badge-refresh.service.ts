import {Injectable} from '@angular/core';
import {Observable, Subject} from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class SidebarBadgeRefreshService {
  private readonly refreshSubject = new Subject<void>();

  readonly refresh$: Observable<void> = this.refreshSubject.asObservable();

  requestRefresh(): void {
    this.refreshSubject.next();
  }
}
