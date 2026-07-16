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
    this.trySet(key, value);
  }

  /**
   * Persist a value and report whether the write succeeded.
   * Use for user-visible preferences (e.g. sidebar order) where silent failure would erode trust.
   */
  trySet<T>(key: string, value: T): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      this.keyChangesSubject.next(key);
      return true;
    } catch {
      // localStorage unavailable (private mode / storage full)
      return false;
    }
  }

  remove(key: string): void {
    localStorage.removeItem(key);
    this.keyChangesSubject.next(key);
  }
}
