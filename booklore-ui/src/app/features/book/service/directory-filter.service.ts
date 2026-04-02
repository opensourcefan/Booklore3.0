import {Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';

export interface DirectorySelection {
  libraryPathId: number;
  fileSubPath: string;
}

@Injectable({providedIn: 'root'})
export class DirectoryFilterService {
  private filterSubject = new BehaviorSubject<DirectorySelection | null>(null);
  readonly filter$ = this.filterSubject.asObservable();

  get currentFilter(): DirectorySelection | null {
    return this.filterSubject.value;
  }

  setFilter(selection: DirectorySelection): void {
    this.filterSubject.next(selection);
  }

  clear(): void {
    this.filterSubject.next(null);
  }
}
