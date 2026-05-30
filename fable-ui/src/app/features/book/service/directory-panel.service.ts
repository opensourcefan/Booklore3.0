import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';

@Injectable({providedIn: 'root'})
export class DirectoryPanelService {
  private visibleSubject = new BehaviorSubject<boolean>(false);
  readonly visible$ = this.visibleSubject.asObservable();

  get isVisible(): boolean {
    return this.visibleSubject.value;
  }

  toggle(): void {
    this.visibleSubject.next(!this.visibleSubject.value);
  }

  open(): void {
    this.visibleSubject.next(true);
  }

  close(): void {
    this.visibleSubject.next(false);
  }
}
