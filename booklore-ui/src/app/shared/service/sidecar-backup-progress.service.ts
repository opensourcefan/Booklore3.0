import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';

@Injectable({providedIn: 'root'})
export class SidecarBackupProgressService {
  private readonly activeSubject = new BehaviorSubject<boolean>(false);

  readonly active$ = this.activeSubject.asObservable();

  start(): void {
    this.activeSubject.next(true);
  }

  clear(): void {
    this.activeSubject.next(false);
  }
}