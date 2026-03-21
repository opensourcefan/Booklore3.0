import {Injectable} from '@angular/core';
import {Observable, Subject} from 'rxjs';

@Injectable({providedIn: 'root'})
export class LocalStorageService {
  private keyChangesSubject = new Subject<string>();
  keyChanges$: Observable<string> = this.keyChangesSubject.asObservable();

  get<T>(key: string): T | null {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) as T : null;
    } catch {
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      this.keyChangesSubject.next(key);
    } catch {
    }
  }

  remove(key: string): void {
    localStorage.removeItem(key);
    this.keyChangesSubject.next(key);
  }
}
